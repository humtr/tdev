//! Owned source admission, private Git construction and bounded observation.
use crate::{
    admission::Context,
    application::Application,
    git::{DiffFormat, Edit, FileMode},
    identity,
    model::*,
    storage::{Admitted, source::Task},
    wire,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
pub(crate) mod cleanup;
pub(crate) mod continuation;
mod integration;
pub(crate) mod publication;
mod start;

pub fn task(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    match wire::string(input, "action")? {
        "start" => start::call(app, context, input, original),
        "open" | "compose" => open(app, context, input, original),
        "integrate" => integration::call(app, context, input, original),
        "cleanup" => cleanup::call(app, context, input, original),
        "resetEnvironment" => crate::execution::reset::call(app, context, input, original),
        "close" => {
            if let Some(op) = app.replay(context, input, "task", original)? {
                return Ok(json!(op));
            }
            let (task, _) = app.ready_task(context, wire::string(input, "taskId")?)?;
            let expected = Checkpoint::new(wire::string(input, "expected")?)?;
            let admission = app.admission(
                context,
                input,
                original,
                OperationKind::Task,
                Some(task.id.clone()),
                Some(&task.identity),
            )?;
            let admitted = app.store()?.reserve_task(&admission, &task, &expected)?;
            match admitted {
                Admitted::Replay(op) => Ok(json!(op)),
                Admitted::New(_) => {
                    let result = json!({"taskId":task.id,"closed":true});
                    Ok(json!(app.store()?.complete_source(
                        &admission.operation.id,
                        Ok(result),
                        None,
                        true
                    )?))
                }
            }
        }
        "list" => list(app, context, input),
        "inspect" => inspect(app, context, input),
        _ => Err(Fault::new("SCHEMA")),
    }
}
fn open(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(op) = app.replay(context, input, "task", original)? {
        return Ok(json!(op));
    }
    let repo = context.repository(wire::string(input, "repo")?, None)?;
    let branch = BranchRef::new(wire::string(input, "ref")?)?;
    if !repo.refs.contains(&branch) {
        return Err(Fault::new("PERMISSION_DENIED"));
    }
    let head = Checkpoint::new(wire::string(input, "expectedHead")?)?;
    // Validate the enrolled transport before reserving private construction.
    repo.git()?;
    let admission = app.admission(
        context,
        input,
        original,
        OperationKind::Task,
        None,
        Some(repo.identity()?),
    )?;
    let (admitted, workspace) = app.store()?.admit_open(
        &admission,
        input,
        &repo.name,
        repo.identity()?,
        &uuid::Uuid::new_v4().to_string(),
    )?;
    if let Admitted::Replay(op) = admitted {
        return Ok(json!(op));
    }
    let result = (|| {
        let git = app.git(&repo)?;
        git.fetch(&branch, &head)?;
        let checkpoint = if input["action"] == "compose" {
            let mut sources = Vec::new();
            for source in input["sources"]
                .as_array()
                .ok_or_else(|| Fault::new("SCHEMA"))?
            {
                let (task, _) = app.task(context, wire::string(source, "taskId")?)?;
                let selected = Checkpoint::new(wire::string(source, "checkpoint")?)?;
                if task.repo != repo.name
                    || task.branch != branch
                    || task.identity != repo.identity()?
                    || task.checkpoint != selected
                {
                    return Err(Fault::new("SOURCE_CHANGED"));
                }
                sources.push((task.base, selected));
            }
            git.compose(&head, &sources, &admission.operation.id)?
        } else {
            head.clone()
        };
        let task = Task {
            id: TaskId::new(uuid::Uuid::new_v4().to_string())?,
            owner: context.principal.clone(),
            repo: repo.name.clone(),
            branch,
            identity: repo.identity()?.into(),
            base: head.clone(),
            checkpoint,
            busy: None,
            closed: 0,
            workspace,
            managed: 0,
            source_ref: None,
            namespace: None,
            published_oid: None,
            ref_state: None,
        };
        app.store()?.complete_open(&admission, &task)
    })();
    match result {
        Ok(op) => Ok(json!(op)),
        Err(error) => Ok(json!(app.store()?.complete_source(
            &admission.operation.id,
            Err(error),
            None,
            false
        )?)),
    }
}
pub fn edit(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(op) = app.replay(context, input, "edit", original)? {
        return Ok(json!(op));
    }
    let (task, repo) = app.ready_task(context, wire::string(input, "taskId")?)?;
    let expected = Checkpoint::new(wire::string(input, "expected")?)?;
    let admission = app.admission(
        context,
        input,
        original,
        OperationKind::Edit,
        Some(task.id.clone()),
        Some(&task.identity),
    )?;
    let admitted = app.store()?.reserve_task(&admission, &task, &expected)?;
    if let Admitted::Replay(op) = admitted {
        return Ok(json!(op));
    }
    let checkpoint = (|| {
        let edits = input["edits"]
            .as_array()
            .ok_or_else(|| Fault::new("SCHEMA"))?
            .iter()
            .map(decode_edit)
            .collect::<Result<Vec<_>>>()?;
        app.git(&repo)?
            .edit(&expected, &edits, &admission.operation.id)
    })();
    match checkpoint {
        Ok(checkpoint) => Ok(json!(app.store()?.complete_source(
            &admission.operation.id,
            Ok(json!({"taskId":task.id,"checkpoint":checkpoint})),
            Some(&checkpoint),
            false
        )?)),
        Err(error) => Ok(json!(app.store()?.complete_source(
            &admission.operation.id,
            Err(error),
            None,
            false
        )?)),
    }
}
fn decode_edit(value: &Value) -> Result<Edit> {
    let path = SourcePath::new(wire::string(value, "path")?)?;
    let before = || BlobId::new(wire::string(value, "before")?);
    Ok(match wire::string(value, "action")? {
        "put" => {
            let content = wire::string(value, "content")?;
            let data = if value["encoding"] == "base64" {
                STANDARD.decode(content).map_err(|_| Fault::new("BASE64"))?
            } else {
                content.as_bytes().to_vec()
            };
            let mode = match value["mode"].as_str().unwrap_or("100644") {
                "100644" => FileMode::File,
                "100755" => FileMode::Executable,
                "120000" => FileMode::Symlink,
                _ => return Err(Fault::new("SCHEMA")),
            };
            Edit::Put {
                path,
                data,
                mode,
                before: value["before"].as_str().map(BlobId::new).transpose()?,
            }
        }
        "replace" => Edit::Replace {
            path,
            old: wire::string(value, "old")?.into(),
            text: wire::string(value, "text")?.into(),
            count: wire::bounded(value, "count", 1, 10000)? as usize,
        },
        "delete" => Edit::Delete {
            path,
            before: before()?,
        },
        "move" => Edit::Move {
            path,
            to: SourcePath::new(wire::string(value, "to")?)?,
            before: before()?,
        },
        _ => return Err(Fault::new("SCHEMA")),
    })
}
fn list(app: &Application, context: &Context, input: &Value) -> Result<Value> {
    let workspace = input["workspaceId"].as_str();
    if let Some(id) = workspace {
        app.store()?.workspace(&context.principal, id, false)?;
    }
    let after = wire::bounded(input, "after", 0, 9007199254740991)?;
    let limit = wire::bounded(input, "limit", 20, 50)?;
    let rows = app.store()?.tasks(
        &context.principal,
        workspace,
        after,
        limit + 1,
        input["includeClosed"].as_bool().unwrap_or(false),
    )?;
    let next = if rows.len() > limit as usize {
        rows.get(limit as usize - 1).map(|r| r.0)
    } else {
        None
    };
    let tasks = rows
        .iter()
        .take(limit as usize)
        .filter_map(|(_, t)| app.task(context, t.id.as_str()).ok().map(|(t, _)| json!(t)))
        .collect::<Vec<_>>();
    let mut repositories = Vec::new();
    for name in context.repositories() {
        let repo = context.repository(&name, None)?;
        for branch in &repo.refs {
            let mut value = json!({"repo":name,"ref":branch});
            match app.git(&repo).and_then(|g| g.head(branch)) {
                Ok(head) => value["head"] = json!(head),
                Err(error) => value["error"] = json!(error),
            }
            repositories.push(value);
        }
    }
    Ok(
        json!({"repositories":repositories,"tasks":tasks,"nextAfter":next,"execution":"Termux-native: same-UID developer authority, host network, not a sandbox."}),
    )
}
fn inspect(app: &Application, context: &Context, input: &Value) -> Result<Value> {
    let started = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| Fault::new("CLOCK"))?
        .as_nanos()
        .to_string();
    let (task, repo) = app.ready_task(context, wire::string(input, "taskId")?)?;
    let outstanding = app
        .store()?
        .outstanding_execution(&context.principal, &task.id, true)?;
    let mut processes = Vec::new();
    for receipt in outstanding {
        app.authorize_receipt(context, &receipt)?;
        let operation = app.reconcile(context, &receipt)?;
        processes.push(crate::execution::api::summary(&receipt, operation)?);
    }
    let remote = match app.git(&repo).and_then(|g| g.head(&task.branch)) {
        Ok(head) => json!({"head":head}),
        Err(error) => json!({"error":error}),
    };
    // Refresh source/history/active in one local view after provider observation.
    // The provider and executor interval is deliberately not an atomic snapshot.
    let before = wire::bounded(input, "before", 9007199254740991, 9007199254740991)?;
    let limit = wire::bounded(input, "limit", 20, 50)?;
    let (task, operations, active) = {
        let store = app.store()?;
        let task = store.task(&context.principal, wire::string(input, "taskId")?)?;
        Application::authorize_task(context, &task)?;
        let operations = store.task_operations(&context.principal, &task.id, before, limit + 1)?;
        let active = task
            .busy
            .as_ref()
            .map(|id| {
                store
                    .receipt(&context.principal, Some(id.as_str()), None)?
                    .map(|r| {
                        let operation = r.operation.clone();
                        crate::execution::api::summary(&r, operation)
                    })
                    .transpose()
            })
            .transpose()?
            .flatten();
        (task, operations, active)
    };
    let next = if operations.len() > limit as usize {
        operations.get(limit as usize - 1).map(|r| r.0)
    } else {
        None
    };
    let ref_cleanup = if task.managed == 0 {
        "unmanaged"
    } else if task.busy.is_some() || remote.get("error").is_some() {
        "observe"
    } else if task.ref_state.as_deref() == Some("deleted") && remote["head"].is_null() {
        "done"
    } else if remote["head"] == json!(task.published_oid) {
        "ready"
    } else {
        "changed"
    };
    let mut value = json!({"task":task,"remote":remote,"operations":operations.into_iter().take(limit as usize).map(|(_,op)|op).collect::<Vec<_>>(),"active":active,"nextBefore":next,"mutationReady":task.closed==0 && task.busy.is_none(),"baseMatchesRemote":remote["head"]==json!(task.base),"processes":processes,"builds":[],"refCleanup":ref_cleanup});
    wire::observe(
        &mut value,
        input["since"].as_str(),
        &["task", "operations", "remote"],
    )?;
    value["observation"]["startedAtNs"] = json!(started);
    Ok(value)
}
pub fn read(app: &Application, context: &Context, input: &Value) -> Result<Value> {
    let (task, repo) = app.task(context, wire::string(input, "taskId")?)?;
    let checkpoint = input["checkpoint"]
        .as_str()
        .map(Checkpoint::new)
        .transpose()?
        .unwrap_or(task.checkpoint.clone());
    let git = app.git(&repo)?;
    if !git.is_ancestor(&checkpoint, &task.checkpoint)? {
        return Err(Fault::new("SOURCE_NOT_IN_TASK"));
    }
    let entries = git.entries(&checkpoint)?;
    let mut remaining = wire::bounded(input, "budget", 24000, 65536)? as usize;
    let mut items = Vec::new();
    for query in input["queries"]
        .as_array()
        .ok_or_else(|| Fault::new("SCHEMA"))?
    {
        let action = wire::string(query, "action")?;
        let result = (|| {
            let path = query["path"]
                .as_str()
                .filter(|p| *p != ".")
                .map(SourcePath::new)
                .transpose()?;
            let offset = wire::Offset::new(query.get("offset"))?;
            let names = entries
                .iter()
                .filter(|(p, _)| {
                    path.as_ref().is_none_or(|prefix| {
                        p == &prefix || p.as_str().starts_with(&(prefix.as_str().to_owned() + "/"))
                    })
                })
                .collect::<Vec<_>>();
            let mut item = json!({"action":action});
            match action {
                "file" => {
                    let path = path.ok_or_else(|| Fault::new("PATH"))?;
                    let entry = entries
                        .get(&path)
                        .ok_or_else(|| Fault::new("FILE_NOT_FOUND"))?;
                    item = json!({"action":action,"path":path,"blob":entry.blob,"mode":entry.mode.as_str()});
                    let count =
                        (wire::bounded(query, "limit", 24000, 65536)? as usize).min(remaining);
                    let (size, data) =
                        git.blob_range(&entry.blob, offset.index(usize::MAX), count)?;
                    remaining -= data.len();
                    item["size"] = json!(size);
                    item["offset"] = offset.original.clone();
                    item["nextOffset"] = offset.plus(data.len())?;
                    item["complete"] = json!(offset.index(size) + data.len() >= size);
                    item["data"] = json!(STANDARD.encode(data));
                    item["encoding"] = json!("base64");
                }
                "list" => {
                    let start = offset.index(names.len());
                    let mut selected = Vec::new();
                    for (path, entry) in names.iter().skip(start) {
                        let cost = path.as_str().len() + 100;
                        if remaining < cost {
                            break;
                        }
                        remaining -= cost;
                        selected.push(
                            json!({"path":path,"mode":entry.mode.as_str(),"blob":entry.blob}),
                        );
                    }
                    item["entries"] = json!(selected);
                    item["nextOffset"] = offset.plus(selected.len())?;
                    item["complete"] = json!(start + selected.len() >= names.len());
                }
                "search" => {
                    let needle = wire::string(query, "text")?.as_bytes();
                    let start = offset.index(names.len());
                    let mut index = start;
                    let mut scanned = 0;
                    let mut hits = Vec::new();
                    for (path, entry) in names.iter().skip(start) {
                        let cost = path.as_str().len() + 100;
                        if remaining < cost {
                            break;
                        }
                        let size = git.blob_size(&entry.blob)?;
                        if size > 16 * 1024 * 1024 {
                            return Err(Fault::message(
                                "READ_SCAN_LIMIT",
                                format!(
                                    "budget=readSearchScanBytes configured=16777216 observed={size}"
                                ),
                            ));
                        }
                        if scanned + size > 16 * 1024 * 1024 {
                            break;
                        }
                        let data = git.blob(&entry.blob)?;
                        scanned += data.len();
                        index += 1;
                        if let Some(hit) = memchr::memmem::find(&data, needle) {
                            remaining -= cost;
                            hits.push(json!({"path":path,"byteOffset":hit}));
                        }
                    }
                    item["hits"] = json!(hits);
                    item["nextOffset"] = offset.plus(index - start)?;
                    item["complete"] = json!(index >= names.len());
                    item["scannedBytes"] = json!(scanned);
                }
                "history" | "diff" => {
                    let data = if action == "history" {
                        git.history(&checkpoint)?
                    } else {
                        let base = query["base"]
                            .as_str()
                            .map(Checkpoint::new)
                            .transpose()?
                            .unwrap_or(task.base.clone());
                        if !git.is_ancestor(&base, &task.checkpoint)? {
                            return Err(Fault::new("SOURCE_NOT_IN_TASK"));
                        }
                        let format = match query["format"].as_str().unwrap_or("stat") {
                            "stat" => DiffFormat::Stat,
                            "patch" => DiffFormat::Patch,
                            "names" => DiffFormat::Names,
                            _ => return Err(Fault::new("SCHEMA")),
                        };
                        git.diff(&base, &checkpoint, format, path.as_ref())?
                    };
                    chunk(&mut item, &data, query, &offset, &mut remaining, true)?;
                }
                _ => return Err(Fault::new("SCHEMA")),
            }
            Ok(item)
        })();
        items.push(match result {
            Ok(item) => item,
            Err(error) => json!({"action":action,"error":error}),
        });
    }
    Ok(json!({"checkpoint":checkpoint,"busy":task.busy,"items":items}))
}
fn chunk(
    item: &mut Value,
    data: &[u8],
    query: &Value,
    offset: &wire::Offset,
    remaining: &mut usize,
    text: bool,
) -> Result<()> {
    let start = offset.index(data.len());
    let count = (wire::bounded(query, "limit", if text { 65536 } else { 24000 }, 65536)? as usize)
        .min(*remaining)
        .min(data.len() - start);
    let bytes = &data[start..start + count];
    *remaining -= count;
    item["size"] = json!(data.len());
    item["offset"] = offset.original.clone();
    item["nextOffset"] = offset.plus(count)?;
    item["complete"] = json!(start + count >= data.len());
    item["data"] = json!(STANDARD.encode(bytes));
    item["encoding"] = json!("base64");
    if text {
        item["text"] = json!(String::from_utf8_lossy(bytes));
    }
    Ok(())
}
