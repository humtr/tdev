use super::*;
use serde_json::{Value as Json, json};

pub(super) fn owned(db: &Connection, owner: &PrincipalId, id: &str, active: bool) -> Result<Json> {
    let mut value = db.query_row("SELECT id,name,revision,closed,default_repo,is_default FROM workspace WHERE id=? AND owner=?", params![id,owner.as_str()], |r| Ok(json!({"workspaceId":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"revision":r.get::<_,i64>(2)?,"closed":r.get::<_,i64>(3)? != 0,"defaultRepo":r.get::<_,Option<String>>(4)?,"isDefault":r.get::<_,i64>(5)? != 0}))).optional().map_err(database)?.ok_or_else(|| Fault::new("WORKSPACE_NOT_FOUND"))?;
    if active && value["closed"] == true {
        return Err(Fault::new("WORKSPACE_CLOSED"));
    }
    let mut statement = db
        .prepare("SELECT repo,identity FROM workspace_project WHERE workspace=? ORDER BY repo")
        .map_err(database)?;
    let projects = statement
        .query_map([id], |r| {
            Ok(json!({"repo":r.get::<_,String>(0)?,"identity":r.get::<_,String>(1)?}))
        })
        .map_err(database)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(database)?;
    value["projects"] = json!(projects);
    Ok(value)
}

pub(super) fn available_member(
    db: &Connection,
    owner: &PrincipalId,
    id: &str,
    repo: &str,
    identity: &str,
) -> Result<()> {
    owned(db, owner, id, true)?;
    let member: Option<String> = db
        .query_row(
            "SELECT identity FROM workspace_project WHERE workspace=? AND repo=?",
            params![id, repo],
            |r| r.get(0),
        )
        .optional()
        .map_err(database)?;
    if member.is_none() {
        return Err(Fault::new("PROJECT_NOT_ATTACHED"));
    }
    if member.as_deref() != Some(identity) {
        return Err(Fault::new("REPOSITORY_IDENTITY"));
    }
    Ok(())
}

pub(super) fn bind(
    db: &Connection,
    owner: &PrincipalId,
    requested: Option<&str>,
    proposed: &str,
    repo: &str,
    identity: &str,
) -> Result<String> {
    if let Some(id) = requested {
        available_member(db, owner, id, repo, identity)?;
        return Ok(id.into());
    }
    let id: Option<String> = db
        .query_row(
            "SELECT id FROM workspace WHERE owner=? AND is_default=1 AND closed=0",
            [owner.as_str()],
            |r| r.get(0),
        )
        .optional()
        .map_err(database)?;
    let id = match id {
        Some(id) => id,
        None => {
            db.execute(
                "INSERT INTO workspace(id,owner,name,is_default) VALUES(?,?,?,1)",
                params![proposed, owner.as_str(), "Default"],
            )
            .map_err(database)?;
            proposed.into()
        }
    };
    let member: Option<String> = db
        .query_row(
            "SELECT identity FROM workspace_project WHERE workspace=? AND repo=?",
            params![id, repo],
            |r| r.get(0),
        )
        .optional()
        .map_err(database)?;
    match member {
        Some(current) if current != identity => {
            return Err(Fault::new("REPOSITORY_IDENTITY"));
        }
        None => {
            db.execute(
                "INSERT INTO workspace_project(workspace,repo,identity) VALUES(?,?,?)",
                params![id, repo, identity],
            )
            .map_err(database)?;
            db.execute("UPDATE workspace SET revision=revision+1 WHERE id=?", [&id])
                .map_err(database)?;
        }
        _ => {}
    }
    Ok(id)
}

fn in_use(db: &Connection, id: &str, repo: Option<&str>) -> Result<bool> {
    let tasks: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM task WHERE workspace=? AND closed=0 AND (? IS NULL OR repo=?))",params![id,repo,repo],|r|r.get(0)).map_err(database)?;
    let pending: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM operation WHERE kind='task' AND status IN ('running','unknown') AND json_extract(intent,'$.workspaceId')=? AND (? IS NULL OR json_extract(intent,'$.input.repo')=?))",params![id,repo,repo],|r|r.get(0)).map_err(database)?;
    Ok(tasks || pending)
}

impl Store {
    pub fn workspace(&self, owner: &PrincipalId, id: &str, active: bool) -> Result<Json> {
        owned(self.connection(), owner, id, active)
    }
    pub fn workspaces(
        &self,
        owner: &PrincipalId,
        include_closed: bool,
        after: u64,
        limit: u64,
    ) -> Result<Vec<(u64, Json)>> {
        let mut statement = self.connection().prepare("SELECT id,rowid FROM workspace WHERE owner=? AND (? OR closed=0) AND rowid>? ORDER BY rowid LIMIT ?").map_err(database)?;
        let ids = statement
            .query_map(
                params![
                    owner.as_str(),
                    include_closed,
                    i64::try_from(after).map_err(|_| Fault::new("SCHEMA"))?,
                    i64::try_from(limit).map_err(|_| Fault::new("SCHEMA"))?
                ],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? as u64)),
            )
            .map_err(database)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(database)?;
        ids.iter()
            .map(|(id, row)| Ok((*row, self.workspace(owner, id, false)?)))
            .collect()
    }
    /// Configuration/identity preflight belongs to the caller, outside this transaction.
    pub fn workspace_change(
        &mut self,
        admission: &Admission,
        input: &Json,
        proposed: &str,
        members: &[(String, String)],
    ) -> Result<Operation> {
        // Changes have no external construction phase: admission and receipt commit together.
        self.transaction(|db| {
            let existing = db.query_row(
                &format!("SELECT {COLUMNS},hash FROM operation WHERE owner=? AND request=?"),
                params![admission.owner.as_str(), admission.request.as_str()],
                |row| Ok((row.get::<_, String>(7)?, operation(row)?)),
            ).optional().map_err(database)?;
            if let Some((hash, operation)) = existing {
                if hash != admission.fingerprint.as_str() {
                    return Err(Fault::new("IDEMPOTENCY_MISMATCH"));
                }
                return Ok(operation);
            }
            let action = crate::wire::string(input, "action")?;
            let id = if action == "create" {
                proposed
            } else {
                crate::wire::string(input, "workspaceId")?
            };
            if action == "create" {
                db.execute(
                    "INSERT INTO workspace(id,owner,name,default_repo) VALUES(?,?,?,?)",
                    params![id, admission.owner.as_str(), input["name"].as_str(), input["defaultRepo"].as_str()],
                ).map_err(database)?;
                for (repo, identity) in members {
                    db.execute(
                        "INSERT INTO workspace_project(workspace,repo,identity) VALUES(?,?,?)",
                        params![id, repo, identity],
                    ).map_err(database)?;
                }
            } else {
                let old = owned(db, &admission.owner, id, true)?;
                let expected = crate::wire::integer(&input["expectedRevision"], i64::MAX as u64).ok();
                if expected != old["revision"].as_u64() {
                    return Err(Fault::new("STALE_WORKSPACE"));
                }
                let repo = input["repo"].as_str();
                match action {
                    "attach" => {
                        let (repo, identity) = members.first().ok_or_else(|| Fault::new("SCHEMA"))?;
                        let existing: Option<String> = db.query_row(
                            "SELECT identity FROM workspace_project WHERE workspace=? AND repo=?",
                            params![id, repo], |row| row.get(0),
                        ).optional().map_err(database)?;
                        if existing.as_ref().is_some_and(|old| old != identity) {
                            return Err(Fault::new("REPOSITORY_IDENTITY"));
                        }
                        db.execute(
                            "INSERT OR IGNORE INTO workspace_project(workspace,repo,identity) VALUES(?,?,?)",
                            params![id, repo, identity],
                        ).map_err(database)?;
                    }
                    "detach" => {
                        if in_use(db, id, repo)? {
                            return Err(Fault::new("WORKSPACE_IN_USE"));
                        }
                        db.execute("DELETE FROM workspace_project WHERE workspace=? AND repo=?", params![id, repo]).map_err(database)?;
                        db.execute("UPDATE workspace SET default_repo=NULL WHERE id=? AND default_repo=?", params![id, repo]).map_err(database)?;
                    }
                    "configure" => {
                        if let Some(name) = input["name"].as_str() {
                            db.execute("UPDATE workspace SET name=? WHERE id=?", params![name, id]).map_err(database)?;
                        }
                        if input.get("defaultRepo").is_some() {
                            if let Some(repo) = input["defaultRepo"].as_str() {
                                let identity = &members.first().ok_or_else(|| Fault::new("PROJECT_NOT_ATTACHED"))?.1;
                                available_member(db, &admission.owner, id, repo, identity)?;
                            }
                            db.execute("UPDATE workspace SET default_repo=? WHERE id=?", params![input["defaultRepo"].as_str(), id]).map_err(database)?;
                        }
                    }
                    "close" => {
                        if in_use(db, id, None)? {
                            return Err(Fault::new("WORKSPACE_IN_USE"));
                        }
                        db.execute("UPDATE workspace SET closed=1 WHERE id=?", [id]).map_err(database)?;
                    }
                    _ => return Err(Fault::new("SCHEMA")),
                }
                db.execute("UPDATE workspace SET revision=revision+1 WHERE id=?", [id]).map_err(database)?;
            }
            let result = owned(db, &admission.owner, id, false)?;
            if let Some(default) = result["defaultRepo"].as_str()
                && !result["projects"].as_array().unwrap().iter().any(|project| project["repo"] == default)
            {
                return Err(Fault::new("PROJECT_NOT_ATTACHED"));
            }
            let operation = Operation {
                status: Status::Succeeded, effect: Effect::Committed, result: Some(result),
                ..admission.operation.clone()
            };
            let mut intent: Json = serde_json::from_slice(&admission.intent.canonical()?).map_err(|_| Fault::new("STATE_FORMAT"))?;
            intent["workspaceId"] = json!(id);
            db.execute(
                "INSERT INTO operation(id,owner,request,hash,kind,status,effect,intent,result) VALUES(?,?,?,?,?,?,?,?,?)",
                params![operation.id.as_str(), admission.owner.as_str(), admission.request.as_str(),
                    admission.fingerprint.as_str(), "workspace", "succeeded", "committed",
                    encoded(&intent)?, encoded(&operation.result)?],
            ).map_err(database)?;
            Ok(operation)
        })
    }
}
