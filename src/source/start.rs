//! Freeze project/base/managed-ref intent before private source construction.
use super::*;

fn label(input: &Value) -> String {
    let mut result = String::new();
    for character in input["label"].as_str().unwrap_or("task").chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '_' | '-') {
            result.push(character);
        } else if !result.ends_with('-') {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-');
    if trimmed.is_empty() {
        "task".into()
    } else {
        trimmed.into()
    }
}

pub(super) fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(op) = app.replay(context, input, "task", original)? {
        return Ok(json!(op));
    }
    let scoped = app
        .store()?
        .select_workspace_project(&context.principal, input)?;
    let repo = if let Some((name, identity)) = scoped {
        context.repository(&name, Some(&identity))?
    } else {
        let available = context.repositories();
        let name = input["repo"]
            .as_str()
            .or_else(|| context.default_repository())
            .or_else(|| {
                if available.len() == 1 {
                    Some(available[0].as_str())
                } else {
                    None
                }
            })
            .ok_or_else(|| Fault::new("PROJECT_REQUIRED"))?;
        context.repository(name, None)?
    };
    repo.local()?;
    let source = input["baseRef"]
        .as_str()
        .or_else(|| repo.config["defaultRef"].as_str())
        .or_else(|| {
            if repo.refs.len() == 1 {
                repo.refs.first().map(BranchRef::as_str)
            } else {
                None
            }
        })
        .ok_or_else(|| Fault::new("BASE_REF_REQUIRED"))?;
    let source = BranchRef::new(source)?;
    if !repo.refs.contains(&source) {
        return Err(Fault::new("PERMISSION_DENIED"));
    }
    let namespace = repo
        .namespaces
        .iter()
        .min()
        .ok_or_else(|| Fault::new("MANAGED_REF_DENIED"))?
        .clone();
    let git = app.git(&repo)?;
    let base = git
        .head(&source)?
        .ok_or_else(|| Fault::new("REF_NOT_FOUND"))?;
    if input["expectedHead"]
        .as_str()
        .is_some_and(|expected| expected != base.as_str())
    {
        return Err(Fault::new("STALE_HEAD"));
    }
    let id = TaskId::new(uuid::Uuid::new_v4().to_string())?;
    let branch = BranchRef::new(format!("{namespace}{}-{id}", label(input)))?;
    if git.head(&branch)?.is_some() {
        return Err(Fault::new("REF_EXISTS"));
    }
    let mut task = Task {
        id,
        owner: context.principal.clone(),
        repo: repo.name.clone(),
        branch,
        identity: repo.identity()?.into(),
        base: base.clone(),
        checkpoint: base.clone(),
        busy: None,
        closed: 0,
        workspace: uuid::Uuid::new_v4().to_string(),
        managed: 1,
        source_ref: Some(source.clone()),
        namespace: Some(namespace.clone()),
        published_oid: None,
        ref_state: Some("reserved".into()),
    };
    let mut admission = app.admission(
        context,
        input,
        original,
        OperationKind::Task,
        None,
        Some(&task.identity),
    )?;
    admission.intent = identity::Value::parse(&json!({"input":input,"identity":task.identity,"construction":"private-source","resolved":{"repo":task.repo,"sourceRef":source,"base":base,"namespace":namespace,"ref":task.branch,"taskId":task.id}}).to_string())?;
    let importing = input["localChanges"] == true;
    if importing {
        let mut intent: Value = serde_json::from_slice(&admission.intent.canonical()?)
            .map_err(|_| Fault::new("STATE_FORMAT"))?;
        intent["resolved"]["checkout"] = repo.config["checkout"].clone();
        intent["resolved"]["checkoutIdentity"] = repo.config["checkoutIdentity"].clone();
        admission.intent = identity::Value::parse(&intent.to_string())?;
    }
    let admitted = app.store()?.admit_start(&admission, input, &mut task)?;
    if let Admitted::Replay(_) = admitted {
        return app
            .replay(context, input, "task", original)?
            .map(|op| json!(op))
            .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"));
    }
    let result = (|| {
        git.fetch(&source, &base)?;
        let imported = if importing {
            let checkout = crate::git::checkout::Checkout::new(
                &git,
                repo.config["checkout"].as_str(),
                repo.config["checkoutIdentity"].as_str(),
            )?;
            let (checkpoint, evidence) =
                checkout.capture(&base, &source, &admission.operation.id)?;
            task.checkpoint = checkpoint;
            Some(evidence)
        } else {
            None
        };
        if git.head(&task.branch)?.is_some() {
            return Err(Fault::new("REF_EXISTS"));
        }
        app.store()?
            .complete_start(&admission, &task, imported.as_ref())
    })();
    let operation = match result {
        Ok(op) => op,
        Err(error) => {
            app.store()?
                .complete_source(&admission.operation.id, Err(error), None, false)?
        }
    };
    Ok(json!(operation))
}
