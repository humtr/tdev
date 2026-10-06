//! Human-name continuation is a coherent local ledger read, never reconciliation.
use super::*;
use crate::storage::{Store, source::Receipt};
use std::collections::BTreeSet;

fn summary(receipt: &Receipt) -> Value {
    let op = &receipt.operation;
    let mut value = json!({"operationId":op.id,"requestId":receipt.request,"kind":op.kind,"status":op.status,"effect":op.effect});
    if let Some(expected) = receipt.intent["input"]["expected"].as_str() {
        value["sourceCheckpoint"] = json!(expected);
    }
    value
}

fn frontier(context: &Context, store: &Store, task: &Task) -> Result<Value> {
    let recent = store.continuation_receipts(&context.principal, &task.id, false)?;
    let outstanding = store.continuation_receipts(&context.principal, &task.id, true)?;
    let allowed = |rows: &[crate::storage::continuation::Retained], limit| {
        rows.iter()
            .take(limit)
            .filter(|r| Application::authorize_retained(context, &r.receipt, store).is_ok())
            .map(|r| summary(&r.receipt))
            .collect::<Vec<_>>()
    };
    Ok(
        json!({"taskId":task.id,"project":task.repo,"workspaceId":task.workspace,"closed":task.closed==1,
        "checkpoint":task.checkpoint,"busyOperationId":task.busy,"publishedCheckpoint":task.published_oid,"refState":task.ref_state,
        "recent":allowed(&recent,8),"recentComplete":recent.len()<=8,
        "outstanding":allowed(&outstanding,40),"outstandingComplete":outstanding.len()<=40}),
    )
}

pub(crate) fn call(app: &Application, context: &Context, input: &Value) -> Result<Value> {
    let limit = wire::bounded(input, "limit", 20, 20)? as usize;
    let after = wire::bounded(input, "after", 0, 9007199254740991)?;
    let query = super::casefold::fold(input["project"].as_str().unwrap_or(""));
    let label = super::casefold::fold(input["label"].as_str().unwrap_or(""));
    let mut projects = Vec::new();
    for name in context.repositories() {
        let repo = context.repository(&name, None)?;
        let public = crate::project::public(&repo);
        if query.is_empty()
            || [
                &name,
                wire::string(&public, "name")?,
                wire::string(&repo.config, "remote")?,
            ]
            .into_iter()
            .any(|s| super::casefold::fold(s) == query)
        {
            projects.push(json!({"project":name,"name":public["name"]}));
        }
    }
    let project_ids = projects
        .iter()
        .filter_map(|p| p["project"].as_str())
        .collect::<BTreeSet<_>>();
    // Hold the original Store mutex for local reads only. Authority checks reuse
    // this ledger view; no provider, Git, executor or separate store is called.
    let store = app.store()?;
    let rows = store.continuation_entries(&context.principal, after)?;
    let mut scanned = after;
    let mut more = rows.len() > 200;
    let mut matches = Vec::new();
    let mut pending = Vec::new();
    let mut unavailable = 0;
    for row in rows.iter().take(200) {
        let receipt = &row.receipt;
        let original = &receipt.intent["input"];
        let title = original["label"].as_str();
        let mut eligible = row.repo.as_deref().is_some_and(|r| project_ids.contains(r))
            && (label.is_empty() || super::casefold::fold(title.unwrap_or("")).contains(&label));
        let mut project_name = None;
        if receipt.operation.kind == OperationKind::Project {
            let name = original["name"].as_str().unwrap_or("");
            let full =
                context.pending_project_name(original["policy"].as_str().unwrap_or(""), name);
            eligible = label.is_empty()
                && (query.is_empty()
                    || [name, &full]
                        .into_iter()
                        .any(|s| super::casefold::fold(s) == query));
            project_name = Some(full);
        }
        let mut task = None;
        if eligible {
            let authorized = (|| {
                Application::authorize_retained(context, receipt, &store)?;
                if let Some(id) = &receipt.operation.task {
                    let value = store.task(&context.principal, id.as_str())?;
                    Application::authorize_task(context, &value)?;
                    task = Some(value);
                }
                Ok(())
            })();
            if let Err(_error) = authorized as Result<()> {
                unavailable += 1;
                eligible = false;
            }
            if let Some(task) = &task {
                let state = input["state"].as_str().unwrap_or("all");
                if state != "all" && (task.closed == 1) != (state == "closed") {
                    eligible = false;
                }
            }
        }
        if eligible {
            if matches.len() + pending.len() == limit {
                more = true;
                break;
            }
            if let Some(task) = task {
                let mut value = frontier(context, &store, &task)?;
                value["label"] = json!(title);
                matches.push(value);
            } else {
                let mut value = summary(receipt);
                value["project"] = json!(row.repo);
                value["label"] = json!(title);
                if let Some(name) = project_name {
                    value["projectName"] = json!(name);
                }
                pending.push(value);
            }
        }
        scanned = row.cursor;
    }
    let pending_complete = !more && after == 0;
    let complete = pending_complete && projects.len() <= limit;
    let count = matches.len() + pending.len();
    let resolution = if !complete {
        "incomplete"
    } else if unavailable > 0 {
        "unavailable"
    } else if count > 1 || ((count == 0 || !query.is_empty()) && projects.len() > 1) {
        "ambiguous"
    } else if count == 0 {
        "none"
    } else {
        "unique"
    };
    let mut value = json!({"resolution":resolution,"projects":projects.into_iter().take(limit).collect::<Vec<_>>(),
        "matches":matches,"pending":pending,"nextAfter":if more {Some(scanned)} else {None},
        "pendingComplete":pending_complete,"unavailableMatches":unavailable});
    wire::observe(
        &mut value,
        input["since"].as_str(),
        &["retained SQLite state; no executor or provider reconciliation"],
    )?;
    Ok(value)
}
