//! Freeze one authorized source version and reserve only the target writer.
use super::*;
use crate::git::integration::{Choice, Resolution};

pub(super) fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(operation) = app.replay(context, input, "task", original)? {
        return Ok(json!(operation));
    }
    let (target, repo) = app.ready_task(context, wire::string(input, "taskId")?)?;
    let (source, _) = app.task(context, wire::string(input, "sourceTaskId")?)?;
    if target.id == source.id || source.repo != target.repo || source.identity != target.identity {
        return Err(Fault::new("INTEGRATION_SOURCE"));
    }
    let selected = input["sourceCheckpoint"]
        .as_str()
        .map(Checkpoint::new)
        .transpose()?
        .unwrap_or(source.checkpoint.clone());
    let expected = Checkpoint::new(wire::string(input, "expected")?)?;
    let git = app.git(&repo)?;
    if !git.is_ancestor(&source.base, &selected)?
        || !git.is_ancestor(&selected, &source.checkpoint)?
    {
        return Err(Fault::new("SOURCE_NOT_IN_TASK"));
    }
    if !git.is_ancestor(&source.base, &target.base)? {
        return Err(Fault::new("UNRELATED_BASE"));
    }
    let mut admission = app.admission(
        context,
        input,
        original,
        OperationKind::Task,
        Some(target.id.clone()),
        Some(&target.identity),
    )?;
    let mut intent: Value = serde_json::from_slice(&admission.intent.canonical()?)
        .map_err(|_| Fault::new("STATE_FORMAT"))?;
    intent["integrationSource"] =
        json!({"taskId":source.id,"base":source.base,"checkpoint":selected});
    admission.intent = identity::Value::parse(&intent.to_string())?;
    let admitted = app
        .store()?
        .reserve_integration(&admission, &target, &expected, &source)?;
    if let Admitted::Replay(_) = admitted {
        return app
            .replay(context, input, "task", original)?
            .map(|operation| json!(operation))
            .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"));
    }
    let result = (|| {
        let resolutions = input["resolutions"]
            .as_array()
            .into_iter()
            .flatten()
            .map(decode_resolution)
            .collect::<Result<Vec<_>>>()?;
        git.integrate(
            &expected,
            &source.base,
            &selected,
            &resolutions,
            &admission.operation.id,
        )
    })();
    let operation = match result {
        Ok(merged) => {
            let mut result =
                serde_json::to_value(&merged).map_err(|_| Fault::new("STATE_FORMAT"))?;
            result["taskId"] = json!(target.id);
            result["sourceTaskId"] = json!(source.id);
            result["sourceBase"] = json!(source.base);
            result["sourceCheckpoint"] = json!(selected);
            app.store()?.complete_source(
                &admission.operation.id,
                Ok(result),
                if merged.applied {
                    Some(&merged.checkpoint)
                } else {
                    None
                },
                false,
            )?
        }
        Err(error) => {
            app.store()?
                .complete_source(&admission.operation.id, Err(error), None, false)?
        }
    };
    Ok(json!(operation))
}

fn decode_resolution(value: &Value) -> Result<Resolution> {
    let choice = match wire::string(value, "choice")? {
        "current" => Choice::Current,
        "incoming" => Choice::Incoming,
        "base" => Choice::Base,
        "delete" => Choice::Delete,
        "content" => {
            let content = wire::string(value, "content")?;
            let data = if value["encoding"] == "base64" {
                STANDARD
                    .decode(content)
                    .map_err(|_| Fault::new("ENCODING"))?
            } else {
                content.as_bytes().to_vec()
            };
            let mode = match value["mode"].as_str().unwrap_or("100644") {
                "100644" => FileMode::File,
                "100755" => FileMode::Executable,
                _ => return Err(Fault::new("SCHEMA")),
            };
            Choice::Content { mode, data }
        }
        _ => return Err(Fault::new("SCHEMA")),
    };
    Ok(Resolution {
        path: SourcePath::new(wire::string(value, "path")?)?,
        choice,
    })
}
