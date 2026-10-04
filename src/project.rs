//! Current policy admission, local enrollment and exact creation reconciliation.
use crate::{
    admission::{Context, Repository},
    application::Application,
    git::project as local,
    identity,
    model::*,
    storage::{Admitted, project::Project, source::Receipt},
    wire,
};
use serde_json::{Value, json};
use std::path::Path;

fn public(repo: &Repository) -> Value {
    let configured = repo.config["defaultRef"]
        .as_str()
        .filter(|r| repo.refs.iter().any(|allowed| allowed.as_str() == *r));
    let default = configured
        .or_else(|| {
            if repo.refs.len() == 1 {
                repo.refs.first().map(BranchRef::as_str)
            } else {
                None
            }
        })
        .unwrap_or("");
    let location = repo.config["checkout"]
        .as_str()
        .or_else(|| repo.config["remote"].as_str())
        .unwrap_or(&repo.name);
    let name = repo.config["name"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| {
            repo.config["_projectRoot"]
                .as_str()
                .and_then(|root| Path::new(location).strip_prefix(root).ok())
                .and_then(Path::to_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| location.into());
    json!({"repo":repo.name,"name":name,"identity":repo.config["identity"],"defaultRef":default,"managedRefNamespaces":repo.namespaces,"policy":repo.config["_projectPolicy"],"provider":repo.config["kind"],"checkout":repo.config["checkout"],"validationTimeoutSeconds":repo.config.get("validationTimeoutSeconds").cloned().unwrap_or(json!(300))})
}

fn config(project: &local::LocalProject) -> Value {
    let mut value = json!({"kind":"local","remote":project.remote,"identity":project.identity,"allowWorktree":true,"refs":[project.branch],"defaultRef":project.branch,"managedOnly":true});
    if let Some(checkout) = &project.checkout {
        value["checkout"] = json!(checkout);
        value["checkoutIdentity"] = json!(project.checkout_identity);
    }
    value
}
fn project_id(context: &Context, identity: &str) -> Result<ProjectId> {
    let key =
        identity::Value::parse(&json!([context.principal, identity]).to_string())?.fingerprint()?;
    ProjectId::new(format!("p-{}", &key.as_str()[..24]))
}

fn complete(
    app: &Application,
    context: &Context,
    receipt: &Receipt,
    mut config: Value,
) -> Result<Operation> {
    let name = wire::string(&receipt.intent["input"], "policy")?;
    let authority = Digest::new(wire::string(&receipt.intent, "authority")?)?;
    context.policy(name, Some(authority.as_str()))?;
    let identity = wire::string(&config, "identity")?.to_owned();
    let id = project_id(context, &identity)?;
    if context.project_conflict(id.as_str()) {
        return Err(Fault::new("CONFIG"));
    }
    let existing = app
        .store()?
        .projects(&context.principal)?
        .into_iter()
        .find(|p| p.identity == identity);
    if let Some(existing) = existing {
        if existing.policy != name
            || existing.authority != authority
            || existing.config["checkout"] != config["checkout"]
            || existing.config["checkoutIdentity"] != config["checkoutIdentity"]
        {
            return Err(Fault::new("PROJECT_ALREADY_CONNECTED"));
        }
        config = existing.config;
    }
    let project = Project {
        id,
        owner: context.principal.clone(),
        policy: name.into(),
        authority,
        identity,
        config,
    };
    let repo = context.delegated(project.clone())?;
    let git = app.git(&repo)?;
    git.head(&BranchRef::new(wire::string(&repo.config, "defaultRef")?)?)?
        .ok_or_else(|| Fault::new("REF_NOT_FOUND"))?;
    git.verify_identity()?;
    app.store()?
        .complete_project(&receipt.operation.id, &project, public(&repo))
}

fn fail(
    app: &Application,
    id: &OperationId,
    mut error: Fault,
    uncertain: bool,
) -> Result<Operation> {
    error.operation_id = Some(id.clone());
    if uncertain {
        error.effect = Effect::Unknown;
        app.store()?.project_unknown(id, error)
    } else {
        error.effect = Effect::None;
        app.store()?.finish(
            id,
            Status::Failed,
            Effect::None,
            Value::Null,
            Some(error),
            |_, _| Ok(()),
        )
    }
}

fn change(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(op) = app.replay(context, input, "project", original)? {
        return Ok(json!(op));
    }
    let name = wire::string(input, "policy")?;
    let policy = context.policy(name, None)?;
    if policy["kind"] != "local" {
        return Err(Fault::new("UNSUPPORTED_PROVIDER"));
    }
    let create = input["action"] == "create";
    if create && policy["allowCreate"] != true {
        return Err(Fault::new("PROJECT_CREATE_DENIED"));
    }
    let mut admission =
        app.admission(context, input, original, OperationKind::Project, None, None)?;
    let mut intent = json!({"input":input,"authority":Context::policy_authority(policy)?,"construction":if create {"local-project-create"} else {"local-project-connect"}});
    admission.intent = identity::Value::parse(&intent.to_string())?;
    let gate = app.operation_work(&admission.operation.id)?;
    let _guard = gate.lock().map_err(|_| Fault::new("OPERATION_STATE"))?;
    let admitted = app.store()?.admit(&admission, |_| Ok(()))?;
    if let Admitted::Replay(_) = admitted {
        return app
            .replay(context, input, "project", original)?
            .map(|op| json!(op))
            .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"));
    }
    let root = Path::new(wire::string(policy, "root")?);
    let project_name = wire::string(input, "name")?;
    let work = (|| {
        if create {
            let path = local::target(root, project_name, true)?;
            intent["projectCreate"] = json!(true);
            app.store()?
                .project_intent(&admission.operation.id, &intent)?;
            local::initialize(&path, project_name)?;
        }
        let described = local::describe(
            root,
            project_name,
            wire::string(policy, "managedRefNamespace")?,
        )?;
        let config = config(&described);
        if create {
            let temporary = Project {
                id: project_id(context, &described.identity)?,
                owner: context.principal.clone(),
                policy: name.into(),
                authority: Context::policy_authority(policy)?,
                identity: described.identity.clone(),
                config: config.clone(),
            };
            let repo = context.delegated(temporary)?;
            let head = app
                .git(&repo)?
                .head(&described.branch)?
                .ok_or_else(|| Fault::new("REF_NOT_FOUND"))?;
            intent["createdConfig"] = config.clone();
            intent["createdHead"] = json!(head);
            app.store()?
                .project_intent(&admission.operation.id, &intent)?;
            local::seal(&described, &admission.operation.id)?;
        }
        let receipt = app
            .store()?
            .receipt(
                &context.principal,
                Some(admission.operation.id.as_str()),
                None,
            )?
            .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
        complete(app, context, &receipt, config)
    })();
    let operation = match work {
        Ok(op) => op,
        Err(error) => {
            let uncertain = intent["projectCreate"] == true && error.code != "PROJECT_EXISTS";
            fail(app, &admission.operation.id, error, uncertain)?
        }
    };
    Ok(json!(operation))
}

pub(crate) fn reconcile(
    app: &Application,
    context: &Context,
    receipt: &Receipt,
) -> Result<Operation> {
    if receipt.operation.status.is_terminal() {
        return Ok(receipt.operation.clone());
    }
    let gate = app.operation_work(&receipt.operation.id)?;
    let _guard = match gate.try_lock() {
        Ok(guard) => guard,
        Err(std::sync::TryLockError::WouldBlock) => return Ok(receipt.operation.clone()),
        Err(_) => return Err(Fault::new("OPERATION_STATE")),
    };
    let receipt = app
        .store()?
        .receipt(
            &context.principal,
            Some(receipt.operation.id.as_str()),
            None,
        )?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    if receipt.operation.status.is_terminal() {
        return Ok(receipt.operation);
    }
    let role = receipt.intent["construction"].as_str();
    if role == Some("local-project-connect")
        || (role == Some("local-project-create") && receipt.intent["projectCreate"] != true)
    {
        return fail(app, &receipt.operation.id, Fault::new("INTERRUPTED"), false);
    }
    if role != Some("local-project-create") {
        return Ok(receipt.operation);
    }
    let recovery = (|| {
        let frozen = receipt
            .intent
            .get("createdConfig")
            .ok_or_else(|| Fault::new("PROJECT_UNKNOWN"))?;
        let policy = context.policy(
            wire::string(&receipt.intent["input"], "policy")?,
            Some(wire::string(&receipt.intent, "authority")?),
        )?;
        let temporary = Project {
            id: project_id(context, wire::string(frozen, "identity")?)?,
            owner: context.principal.clone(),
            policy: wire::string(&receipt.intent["input"], "policy")?.into(),
            authority: Digest::new(wire::string(&receipt.intent, "authority")?)?,
            identity: wire::string(frozen, "identity")?.into(),
            config: frozen.clone(),
        };
        let repo = context.delegated(temporary)?;
        let git = app.git(&repo)?;
        git.verify_identity()?;
        if !local::sealed(
            Path::new(wire::string(frozen, "remote")?),
            &receipt.operation.id,
        )? {
            return Err(Fault::new("PROJECT_UNKNOWN"));
        }
        let described = local::describe(
            Path::new(wire::string(policy, "root")?),
            wire::string(&receipt.intent["input"], "name")?,
            wire::string(policy, "managedRefNamespace")?,
        )?;
        if config(&described) != *frozen
            || git
                .head(&described.branch)?
                .as_ref()
                .map(Checkpoint::as_str)
                != Some(wire::string(&receipt.intent, "createdHead")?)
        {
            return Err(Fault::new("REPOSITORY_IDENTITY"));
        }
        complete(app, context, &receipt, frozen.clone())
    })();
    match recovery {
        Ok(op) => Ok(op),
        Err(error) => fail(app, &receipt.operation.id, error, true),
    }
}

pub fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    match wire::string(input, "action")? {
        "list" => {
            let policies = context.policies().into_iter().filter_map(|name| {
                let policy = context.policy(&name,None).ok()?;
                (policy["kind"] == "local").then(||json!({"name":name,"provider":"local","scope":policy["root"],"canCreate":policy["allowCreate"].as_bool().unwrap_or(false)}))
            }).collect::<Vec<_>>();
            Ok(
                json!({"projects":context.repositories().iter().map(|name|context.repository(name,None).map(|repo|public(&repo))).collect::<Result<Vec<_>>>()?,"policies":policies}),
            )
        }
        "inspect" => {
            let repo = context.repository(wire::string(input, "repo")?, None)?;
            let mut value = public(&repo);
            let observation: Result<()> = (|| {
                let git = app.git(&repo)?;
                git.verify_identity()?;
                if let Some(branch) = repo
                    .refs
                    .iter()
                    .find(|r| Some(r.as_str()) == value["defaultRef"].as_str())
                {
                    value["head"] = json!(
                        git.head(branch)?
                            .ok_or_else(|| Fault::new("REF_NOT_FOUND"))?
                    );
                } else {
                    return Err(Fault::new("BASE_REF_REQUIRED"));
                }
                Ok(())
            })();
            if let Err(error) = observation {
                value["error"] = json!(error);
            }
            Ok(value)
        }
        "connect" | "create" => change(app, context, input, original),
        _ => Err(Fault::new("SCHEMA")),
    }
}
