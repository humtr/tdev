//! Composition authority and availability, independent of Git work directories.
use crate::{admission::Context, application::Application, identity, model::*, wire};
use serde_json::{Value, json};

pub fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    match wire::string(input, "action")? {
        "list" => {
            let limit = wire::bounded(input, "limit", 20, 50)?;
            let rows = app.store()?.workspaces(
                &context.principal,
                input["includeClosed"].as_bool().unwrap_or(false),
                wire::bounded(input, "after", 0, 9007199254740991)?,
                limit + 1,
            )?;
            let next = if rows.len() > limit as usize {
                rows.get(limit as usize - 1).map(|r| r.0)
            } else {
                None
            };
            Ok(
                json!({"workspaces":rows.into_iter().take(limit as usize).map(|(_,v)|v).collect::<Vec<_>>(),"nextAfter":next}),
            )
        }
        "inspect" => inspect(app, context, input),
        "create" | "attach" | "detach" | "configure" | "close" => {
            if let Some(op) = app.replay(context, input, "workspace", original)? {
                return Ok(json!(op));
            }
            if input["action"] == "create"
                && input["defaultRepo"].as_str().is_some_and(|default| {
                    !input["projects"]
                        .as_array()
                        .is_some_and(|projects| projects.iter().any(|p| p == default))
                })
            {
                return Err(Fault::new("PROJECT_NOT_ATTACHED"));
            }
            let mut names = Vec::new();
            if let Some(projects) = input["projects"].as_array() {
                for project in projects {
                    names.push(project.as_str().ok_or_else(|| Fault::new("SCHEMA"))?);
                }
            }
            if input["action"] == "attach" {
                names.push(wire::string(input, "repo")?);
            }
            if let Some(default) = input["defaultRepo"].as_str() {
                names.push(default);
            }
            names.sort();
            names.dedup();
            let members = names
                .iter()
                .map(|name| {
                    context
                        .repository(name, None)
                        .and_then(|repo| Ok((repo.name.clone(), repo.identity()?.into())))
                })
                .collect::<Result<Vec<_>>>()?;
            let admission = app.admission(
                context,
                input,
                original,
                OperationKind::Workspace,
                None,
                None,
            )?;
            Ok(json!(app.store()?.workspace_change(
                &admission,
                input,
                &uuid::Uuid::new_v4().to_string(),
                &members
            )?))
        }
        _ => Err(Fault::new("SCHEMA")),
    }
}
fn inspect(app: &Application, context: &Context, input: &Value) -> Result<Value> {
    let id = wire::string(input, "workspaceId")?;
    let mut workspace = app.store()?.workspace(&context.principal, id, false)?;
    for member in workspace["projects"]
        .as_array_mut()
        .ok_or_else(|| Fault::new("STATE_FORMAT"))?
    {
        let available =
            context.repository(wire::string(member, "repo")?, member["identity"].as_str());
        member["available"] = json!(available.is_ok());
        if let Err(error) = available {
            member["error"] = json!(error);
        }
    }
    let limit = wire::bounded(input, "limit", 20, 50)?;
    let rows = app.store()?.tasks(
        &context.principal,
        Some(id),
        wire::bounded(input, "after", 0, 9007199254740991)?,
        limit + 1,
        input["includeClosed"].as_bool().unwrap_or(false),
    )?;
    let next = if rows.len() > limit as usize {
        rows.get(limit as usize - 1).map(|r| r.0)
    } else {
        None
    };
    let mut tasks = Vec::new();
    for (_, task) in rows.into_iter().take(limit as usize) {
        let mut value = json!({"taskId":task.id,"repo":task.repo});
        match app.ready_task(context, task.id.as_str()) {
            Ok((task, _)) => {
                value["checkpoint"] = json!(task.checkpoint);
                value["closed"] = json!(task.closed != 0);
                value["busy"] = json!(task.busy);
                let active = match task.busy {
                    Some(id) => {
                        app.store()?
                            .receipt(&context.principal, Some(id.as_str()), None)?
                    }
                    None => None,
                };
                if let Some(receipt) = active {
                    let operation = receipt.operation.clone();
                    value["active"] = crate::execution::api::summary(&receipt, operation)?;
                }
            }
            Err(error) => value["error"] = json!(error),
        }
        tasks.push(value);
    }
    let pending = app.store()?.pending_tasks(
        &context.principal,
        id,
        wire::bounded(input, "pendingAfter", 0, 9007199254740991)?,
        limit + 1,
    )?;
    let next_pending = if pending.len() > limit as usize {
        pending.get(limit as usize - 1).map(|r| r.0)
    } else {
        None
    };
    let mut pending_values = Vec::new();
    for (_, mut value) in pending.into_iter().take(limit as usize) {
        let receipt = app
            .store()?
            .receipt(&context.principal, value["operationId"].as_str(), None)?
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
        if let Err(error) = app.authorize_receipt(context, &receipt) {
            value.as_object_mut().unwrap().remove("operation");
            value["error"] = json!(error);
        }
        pending_values.push(value);
    }
    let mut value = json!({"workspace":workspace,"tasks":tasks,"nextAfter":next,"pendingTasks":pending_values,"nextPendingAfter":next_pending});
    wire::observe(
        &mut value,
        input["since"].as_str(),
        &["workspace", "tasks", "operations", "config"],
    )?;
    Ok(value)
}
