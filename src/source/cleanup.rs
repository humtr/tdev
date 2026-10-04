//! Owned ref cleanup never repeats an uncertain deletion, even after restart.
use super::*;
use crate::storage::source::Receipt;

fn result(task: &Task) -> Value {
    json!({"taskId":task.id,"ref":task.branch,"cleaned":true})
}
fn uncertain(id: &OperationId, error: Fault) -> Fault {
    Fault {
        effect: Effect::Unknown,
        operation_id: Some(id.clone()),
        ..Fault::message(
            "REF_CLEANUP_UNKNOWN",
            format!(
                "Observe the original cleanup; deletion will not be repeated: {}",
                error.code
            ),
        )
    }
}

pub(super) fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(operation) = app.replay(context, input, "task", original)? {
        return Ok(json!(operation));
    }
    let (task, repo) = app.task(context, wire::string(input, "taskId")?)?;
    repo.local()?;
    let mut admission = app.admission(
        context,
        input,
        original,
        OperationKind::Task,
        Some(task.id.clone()),
        Some(&task.identity),
    )?;
    let mut intent = json!({"input":input,"identity":task.identity,"construction":"managed-ref-cleanup","cleanup":{"repo":task.repo,"ref":task.branch,"publishedOid":task.published_oid,"refState":task.ref_state}});
    admission.intent = identity::Value::parse(&intent.to_string())?;
    let gate = app.operation_work(&admission.operation.id)?;
    let _guard = gate.lock().map_err(|_| Fault::new("OPERATION_STATE"))?;
    let admitted = app.store()?.reserve_cleanup(&admission, &task)?;
    if let Admitted::Replay(_) = admitted {
        return app
            .replay(context, input, "task", original)?
            .map(|op| json!(op))
            .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"));
    }
    let id = &admission.operation.id;
    let preflight = (|| {
        if task.managed != 1 {
            return Err(Fault::new("REF_NOT_OWNED"));
        }
        let git = app.git(&repo)?;
        let head = git.head(&task.branch)?;
        if let Some(head) = &head {
            if task.ref_state.as_deref() != Some("published")
                || task.published_oid.as_ref() != Some(head)
            {
                return Err(Fault::new("REF_NOT_OWNED"));
            }
            git.check_delete(&task.branch, head)?;
        }
        Ok((git, head))
    })();
    let operation = match preflight {
        Err(error) => app.store()?.complete_cleanup(id, Err(error))?,
        Ok((_, None)) => app.store()?.complete_cleanup(id, Ok(result(&task)))?,
        Ok((git, Some(head))) => {
            intent["refMutation"] = json!("delete");
            intent["old"] = json!(head);
            app.store()?.cleanup_dispatch(id, &intent)?;
            match git.delete_ref(&task.branch, &head) {
                Ok(()) => (|| app.store()?.complete_cleanup(id, Ok(result(&task))))()
                    .map_err(|error| uncertain(id, error))?,
                Err(error) if error.effect == Effect::None => {
                    app.store()?.complete_cleanup(id, Err(error))?
                }
                Err(error) => (|| app.store()?.cleanup_unknown(id, uncertain(id, error)))()
                    .map_err(|error| uncertain(id, error))?,
            }
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
    if receipt.intent["construction"] != "managed-ref-cleanup" {
        return Err(Fault::new("STATE_FORMAT"));
    }
    let id = &receipt.operation.id;
    let (task, repo) = app.task(
        context,
        receipt
            .operation
            .task
            .as_ref()
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?
            .as_str(),
    )?;
    let frozen = &receipt.intent["cleanup"];
    if frozen["repo"] != task.repo
        || frozen["ref"] != json!(task.branch)
        || receipt.intent["identity"] != task.identity
        || frozen["publishedOid"] != json!(task.published_oid)
        || frozen["refState"] != json!(task.ref_state)
    {
        return Err(Fault::new("STATE_FORMAT"));
    }
    if task.managed != 1 {
        return app
            .store()?
            .complete_cleanup(id, Err(Fault::new("REF_NOT_OWNED")));
    }
    let dispatched = receipt.intent["refMutation"] == "delete";
    if dispatched
        && (frozen["refState"] != "published"
            || frozen["publishedOid"].is_null()
            || receipt.intent["old"] != frozen["publishedOid"]
            || receipt.operation.effect != Effect::Unknown)
    {
        return Err(Fault::new("STATE_FORMAT"));
    }
    // Observation errors never turn absence into proof or clear the writer fence.
    let head = match app.git(&repo).and_then(|git| git.head(&task.branch)) {
        Ok(head) => head,
        Err(_) => return Ok(receipt.operation),
    };
    if head.is_none() {
        return (|| app.store()?.complete_cleanup(id, Ok(result(&task))))().map_err(|error| {
            if dispatched {
                uncertain(id, error)
            } else {
                error
            }
        });
    }
    if !dispatched {
        return app
            .store()?
            .complete_cleanup(id, Err(Fault::new("INTERRUPTED")));
    }
    Ok(receipt.operation)
}
