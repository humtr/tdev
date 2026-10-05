//! Publish one frozen validation candidate; recovery only observes its original ref effect.
use super::*;
use crate::{
    execution::api::{policy, validated},
    storage::source::Receipt,
};

fn uncertain(id: &OperationId, error: Fault) -> Fault {
    Fault {
        effect: Effect::Unknown,
        operation_id: Some(id.clone()),
        ..Fault::message(
            "PUBLICATION_UNKNOWN",
            format!(
                "Observe the original publication; dispatch will not repeat: {}",
                error.code
            ),
        )
    }
}
fn outcome(receipt: &Receipt) -> Value {
    json!({"commit":receipt.intent["candidate"],"validationId":receipt.intent["input"]["validationId"]})
}
fn pointers(receipt: &Receipt) -> Result<(Checkpoint, Checkpoint, Option<Checkpoint>)> {
    Ok((
        Checkpoint::new(wire::string(&receipt.intent, "checkpoint")?)?,
        Checkpoint::new(wire::string(&receipt.intent, "candidate")?)?,
        receipt
            .intent
            .get("old")
            .filter(|v| !v.is_null())
            .map(|v| Checkpoint::new(v.as_str().ok_or_else(|| Fault::new("STATE_FORMAT"))?))
            .transpose()?,
    ))
}

pub(crate) fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(operation) = app.replay(context, input, "publish", original)? {
        return Ok(json!(operation));
    }
    let validation = app
        .store()?
        .receipt(
            &context.principal,
            Some(wire::string(input, "validationId")?),
            None,
        )?
        .ok_or_else(|| Fault::new("VALIDATION_REQUIRED"))?;
    app.authorize_receipt(context, &validation)?;
    let proof = validated(&validation)?;
    let (task, repo) = app.ready_task(
        context,
        validation
            .operation
            .task
            .as_ref()
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?
            .as_str(),
    )?;
    let candidate = proof
        .candidate
        .as_ref()
        .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
    let old = if task.managed == 1 {
        None
    } else {
        Some(task.base.clone())
    };
    let mut admission = app.admission(
        context,
        input,
        original,
        OperationKind::Publish,
        Some(task.id.clone()),
        Some(&task.identity),
    )?;
    let intent = json!({"input":input,"identity":task.identity,"construction":"source-publication","checkpoint":proof.checkpoint,"candidate":candidate,"base":proof.base,"old":old,"ref":task.branch,"managed":task.managed,"policy":proof.policy,"dispatched":false});
    admission.intent = identity::Value::parse(&intent.to_string())?;
    let alias = app
        .store()?
        .publication_alias(&admission, &validation.operation.id)?;
    if let Some(operation) = alias {
        let receipt = app
            .store()?
            .receipt(&context.principal, Some(operation.id.as_str()), None)?
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
        app.authorize_receipt(context, &receipt)?;
        return Ok(json!(reconcile(app, context, &receipt)?));
    }
    if task.checkpoint != proof.checkpoint || task.base != proof.base {
        return Err(Fault::new("VALIDATION_SOURCE_CHANGED"));
    }
    if policy(&repo)? != proof.policy {
        return Err(Fault::new("POLICY_CHANGED"));
    }
    if task.managed == 0 && repo.config["managedOnly"] == true {
        return Err(Fault::new("MANAGED_TASK_REQUIRED"));
    }
    if input.get("expectedHead").is_some_and(|v| *v != json!(old)) {
        return Err(Fault::new("STALE_HEAD"));
    }
    let gate = app.operation_work(&admission.operation.id)?;
    let _guard = gate.lock().map_err(|_| Fault::new("OPERATION_BUSY"))?;
    let admitted = app
        .store()?
        .admit_publication(&admission, &task, &validation)?;
    if let Admitted::Replay(_) = admitted {
        return app
            .replay(context, input, "publish", original)?
            .map(|op| json!(op))
            .ok_or_else(|| Fault::new("STATE_FORMAT"));
    }
    let receipt = app
        .store()?
        .receipt(
            &context.principal,
            Some(admission.operation.id.as_str()),
            None,
        )?
        .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
    let preflight = app.git(&repo).and_then(|git| {
        git.check_candidate(&proof.checkpoint, &proof.base, candidate)?;
        if task.managed == 1 && task.ref_state.as_deref() != Some("reserved") {
            return Err(Fault::new("STALE_HEAD"));
        }
        git.check_publish(&task.branch, old.as_ref(), candidate)?;
        Ok(git)
    });
    let id = &admission.operation.id;
    let operation = match preflight {
        Err(error) => {
            app.store()?
                .complete_publication(id, Err(error), candidate, &proof.checkpoint)?
        }
        Ok(git) => {
            app.store()?.publication_dispatch(id)?;
            match git.publish_ref(&task.branch, old.as_ref(), candidate) {
                Ok(()) => (|| {
                    app.store()?.complete_publication(
                        id,
                        Ok(outcome(&receipt)),
                        candidate,
                        &proof.checkpoint,
                    )
                })()
                .map_err(|error| uncertain(id, error))?,
                Err(error) if error.effect == Effect::None => (|| {
                    app.store()?
                        .complete_publication(id, Err(error), candidate, &proof.checkpoint)
                })()
                .map_err(|error| uncertain(id, error))?,
                Err(_) => (|| {
                    app.store()?
                        .execution_observation(&context.principal, id, false)
                })()
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
    if let Some(id) = receipt.intent["aliasOf"].as_str() {
        let original = app
            .store()?
            .receipt(&context.principal, Some(id), None)?
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
        if original.operation.kind != OperationKind::Publish
            || original.intent.get("aliasOf").is_some()
        {
            return Err(Fault::new("STATE_FORMAT"));
        }
        app.authorize_receipt(context, &original)?;
        return reconcile(app, context, &original);
    }
    if receipt.operation.status.is_terminal() {
        return Ok(receipt.operation.clone());
    }
    let gate = app.operation_work(&receipt.operation.id)?;
    let _guard = match gate.try_lock() {
        Ok(guard) => guard,
        Err(std::sync::TryLockError::WouldBlock) => return Ok(receipt.operation.clone()),
        Err(_) => return Err(Fault::new("OPERATION_BUSY")),
    };
    let receipt = app
        .store()?
        .receipt(
            &context.principal,
            Some(receipt.operation.id.as_str()),
            None,
        )?
        .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
    if receipt.operation.status.is_terminal() {
        return Ok(receipt.operation);
    }
    let (checkpoint, candidate, _) = pointers(&receipt)?;
    if receipt.intent["dispatched"] != true {
        return app.store()?.complete_publication(
            &receipt.operation.id,
            Err(Fault::new("INTERRUPTED")),
            &candidate,
            &checkpoint,
        );
    }
    let (task, repo) = app.task(
        context,
        receipt
            .operation
            .task
            .as_ref()
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?
            .as_str(),
    )?;
    if receipt.intent["ref"] != json!(task.branch)
        || receipt.intent["base"] != json!(task.base)
        || receipt.intent["managed"] != task.managed
        || receipt.intent["checkpoint"] != json!(task.checkpoint)
        || task.busy.as_ref() != Some(&receipt.operation.id)
    {
        return Err(Fault::new("STATE_FORMAT"));
    }
    let observed = app
        .git(&repo)
        .and_then(|git| match git.head(&task.branch)? {
            Some(head) if head == candidate => Ok(true),
            Some(head) => git.published_contains(&head, &candidate),
            None => Ok(false),
        });
    if observed == Ok(true) {
        app.store()?.complete_publication(
            &receipt.operation.id,
            Ok(outcome(&receipt)),
            &candidate,
            &checkpoint,
        )
    } else {
        app.store()?
            .execution_observation(&context.principal, &receipt.operation.id, false)
    }
}
