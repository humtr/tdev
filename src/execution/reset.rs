//! Retained dependency reset intent; never delete a newly rebuilt directory on replay.
use super::evidence;
use crate::{
    admission::Context,
    application::Application,
    identity,
    model::*,
    storage::{Admitted, source::Receipt},
    supervisor::Environment,
    wire,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
    path::Path,
};

#[derive(Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Record {
    operation: OperationId,
    task: TaskId,
    directory: Option<(u64, u64)>,
}

fn directory(path: &Path) -> Result<Option<(u64, u64)>> {
    // SAFETY: getuid is a scalar-only read of this process's identity.
    let uid = unsafe { libc::getuid() };
    match fs::symlink_metadata(path) {
        Ok(m)
            if m.is_dir()
                && !m.file_type().is_symlink()
                && m.mode() & 0o077 == 0
                && m.uid() == uid =>
        {
            Ok(Some((m.dev(), m.ino())))
        }
        Ok(_) => Err(Fault::new("ENVIRONMENT_IDENTITY")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(evidence(e)),
    }
}

pub fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(op) = app.replay(context, input, "task", original)? {
        return Ok(json!(op));
    }
    let (task, _) = app.ready_task(context, wire::string(input, "taskId")?)?;
    // Observe bounded consumers first; the admission transaction checks again against starts.
    let consumers = app
        .store()?
        .outstanding_execution(&context.principal, &task.id, false)?;
    for receipt in consumers {
        app.authorize_receipt(context, &receipt)?;
        crate::execution::api::reconcile(app, context, &receipt)?;
    }
    let mut admission = app.admission(
        context,
        input,
        original,
        OperationKind::Task,
        Some(task.id.clone()),
        Some(&task.identity),
    )?;
    admission.intent = identity::Value::parse(
        &json!({"input":input,"identity":task.identity,"construction":"native-environment-reset"})
            .to_string(),
    )?;
    let expected = Checkpoint::new(wire::string(input, "expected")?)?;
    let op = match app
        .store()?
        .admit_environment_reset(&admission, &task, &expected)?
    {
        Admitted::New(op) | Admitted::Replay(op) => op,
    };
    let receipt = app
        .store()?
        .receipt(&context.principal, Some(op.id.as_str()), None)?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    Ok(json!(reconcile(app, context, &receipt)?))
}

pub fn reconcile(app: &Application, context: &Context, receipt: &Receipt) -> Result<Operation> {
    let gate = app.operation_work(&receipt.operation.id)?;
    let _guard = gate.lock().map_err(|_| Fault::new("OPERATION_BUSY"))?;
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
    match advance(app, context, &receipt) {
        Ok(operation) => Ok(operation),
        Err(mut error) => {
            app.store()?
                .execution_observation(&context.principal, &receipt.operation.id, false)?;
            error.effect = Effect::Unknown;
            error.operation_id = Some(receipt.operation.id);
            Err(error)
        }
    }
}

fn advance(app: &Application, context: &Context, receipt: &Receipt) -> Result<Operation> {
    let task_id = receipt
        .operation
        .task
        .as_ref()
        .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
    let (task, _) = app.task(context, task_id.as_str())?;
    if task.busy.as_ref() != Some(&receipt.operation.id) {
        return Err(Fault::new("OPERATION_STATE"));
    }
    if !app
        .store()?
        .outstanding_execution(&context.principal, task_id, false)?
        .is_empty()
    {
        return Err(Fault::new("ENVIRONMENT_BUSY"));
    }
    let environment =
        Environment::new(&app.root.join("environments"), task_id.clone()).map_err(evidence)?;
    let lease = environment.try_exclusive().map_err(|e| {
        if e.kind() == std::io::ErrorKind::WouldBlock {
            Fault::new("ENVIRONMENT_BUSY")
        } else {
            evidence(e)
        }
    })?;
    let records = app.root.join("environments/.resets");
    fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&records)
        .map_err(evidence)?;
    directory(&records)?;
    let record_path = records.join(format!("{}.json", receipt.operation.id));
    let trash = records.join(receipt.operation.id.as_str());
    let record = match OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK)
        .open(&record_path)
    {
        Ok(file) => {
            let metadata = file.metadata().map_err(evidence)?;
            if !metadata.is_file() || metadata.len() > 4096 {
                return Err(Fault::new("ENVIRONMENT_IDENTITY"));
            }
            let mut bytes = Vec::new();
            file.take(4097).read_to_end(&mut bytes).map_err(evidence)?;
            serde_json::from_slice::<Record>(&bytes)
                .map_err(|_| Fault::new("ENVIRONMENT_IDENTITY"))?
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if directory(&trash)?.is_some() {
                return Err(Fault::new("ENVIRONMENT_RESET_CONFLICT"));
            }
            let record = Record {
                operation: receipt.operation.id.clone(),
                task: task_id.clone(),
                directory: directory(lease.path())?,
            };
            let mut temporary = tempfile::NamedTempFile::new_in(&records).map_err(evidence)?;
            temporary
                .write_all(&serde_json::to_vec(&record).map_err(|_| Fault::new("STATE_FORMAT"))?)
                .map_err(evidence)?;
            temporary.as_file().sync_all().map_err(evidence)?;
            temporary
                .persist_noclobber(&record_path)
                .map_err(|e| evidence(e.error))?;
            File::open(&records)
                .and_then(|f| f.sync_all())
                .map_err(evidence)?;
            record
        }
        Err(e) => return Err(evidence(e)),
    };
    if record.operation != receipt.operation.id || record.task != *task_id {
        return Err(Fault::new("ENVIRONMENT_IDENTITY"));
    }
    let current = directory(lease.path())?;
    let retired = directory(&trash)?;
    if current.is_some() && (current != record.directory || retired.is_some())
        || retired.is_some() && retired != record.directory
    {
        return Err(Fault::new("ENVIRONMENT_RESET_CONFLICT"));
    }
    if current.is_some() {
        fs::rename(lease.path(), &trash).map_err(evidence)?;
        File::open(app.root.join("environments"))
            .and_then(|f| f.sync_all())
            .map_err(evidence)?;
        File::open(&records)
            .and_then(|f| f.sync_all())
            .map_err(evidence)?;
    }
    if directory(&trash)?.is_some() {
        fs::remove_dir_all(&trash).map_err(evidence)?;
        File::open(&records)
            .and_then(|f| f.sync_all())
            .map_err(evidence)?;
    }
    app.store()?.complete_source(
        &receipt.operation.id,
        Ok(json!({"taskId":task_id,"environmentReset":true})),
        None,
        false,
    )
}
