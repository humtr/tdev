//! SQLite admission and completion for the existing execution/task owners.
use super::*;
use crate::model::{Checkpoint, OperationKind, TaskId};
use crate::storage::source::{Receipt, Task};

impl Store {
    pub fn pending_execution_controls(
        &self,
        owner: &PrincipalId,
        id: &OperationId,
    ) -> Result<Vec<Receipt>> {
        let mut statement = self.connection().prepare("SELECT id FROM operation WHERE owner=? AND kind='operation' AND status IN ('running','unknown') AND json_extract(intent,'$.input.operationId')=? ORDER BY rowid LIMIT 64").map_err(database)?;
        let ids = statement
            .query_map(params![owner.as_str(), id.as_str()], |r| {
                r.get::<_, String>(0)
            })
            .map_err(database)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(database)?;
        ids.into_iter()
            .map(|id| {
                self.receipt(owner, Some(&id), None)?
                    .ok_or_else(|| Fault::new("STATE_FORMAT"))
            })
            .collect()
    }
    pub fn outstanding_execution(
        &self,
        owner: &PrincipalId,
        task: &TaskId,
        processes_only: bool,
    ) -> Result<Vec<Receipt>> {
        let mut stmt = self.connection().prepare("SELECT id FROM operation WHERE owner=? AND task=? AND kind='exec' AND status IN ('running','unknown') AND (?=0 OR json_extract(intent,'$.mode')='process') ORDER BY rowid LIMIT 9").map_err(database)?;
        let ids = stmt
            .query_map(
                params![owner.as_str(), task.as_str(), processes_only],
                |row| row.get::<_, String>(0),
            )
            .map_err(database)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(database)?;
        ids.into_iter()
            .map(|id| {
                self.receipt(owner, Some(&id), None)?
                    .ok_or_else(|| Fault::new("STATE_FORMAT"))
            })
            .collect()
    }

    pub fn admit_execution(
        &mut self,
        admission: &Admission,
        task: &Task,
        expected: &Checkpoint,
        process: bool,
        reserve_work: impl FnOnce() -> Result<()>,
    ) -> Result<Admitted> {
        self.admit(admission, |db| {
            reserve_execution(db, admission, task, expected, process)?;
            reserve_work()?;
            db.execute(
                "UPDATE operation SET repo=?,ref=? WHERE id=?",
                params![
                    task.repo,
                    task.branch.as_str(),
                    admission.operation.id.as_str()
                ],
            )
            .map_err(database)?;
            Ok(())
        })
    }

    pub fn bind_validation(&mut self, id: &OperationId, candidate: &Checkpoint) -> Result<()> {
        self.transaction(|db| {
            let changed = db.execute("UPDATE operation SET intent=json_set(intent,'$.validation.candidate',?) WHERE id=? AND kind='validate' AND status='running' AND effect='none' AND json_extract(intent,'$.validation.candidate') IS NULL AND EXISTS(SELECT 1 FROM task WHERE task.id=operation.task AND task.busy=operation.id)",params![candidate.as_str(),id.as_str()]).map_err(database)?;
            if changed != 1 {return Err(Fault::new("OPERATION_STATE"));}
            Ok(())
        })
    }

    pub fn bind_execution(
        &mut self,
        owner: &PrincipalId,
        id: &OperationId,
        digest: &Digest,
    ) -> Result<()> {
        self.transaction(|db| {
            let receipt = db
                .query_row(
                    "SELECT intent,status FROM operation WHERE id=? AND owner=? AND kind IN ('exec','validate')",
                    params![id.as_str(), owner.as_str()],
                    |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
                )
                .map_err(database)?;
            if !["running", "unknown"].contains(&receipt.1.as_str()) {
                return Err(Fault::new("OPERATION_STATE"));
            }
            let mut intent: serde_json::Value =
                serde_json::from_str(&receipt.0).map_err(|_| Fault::new("STATE_FORMAT"))?;
            if let Some(previous) = intent.get("jobDigest") {
                if previous != &serde_json::json!(digest) {
                    return Err(Fault::new("EXECUTION_IDENTITY"));
                }
            } else {
                intent["jobDigest"] = serde_json::json!(digest);
                db.execute(
                    "UPDATE operation SET intent=? WHERE id=?",
                    params![encoded(&intent)?, id.as_str()],
                )
                .map_err(database)?;
            }
            Ok(())
        })
    }

    pub fn execution_observation(
        &mut self,
        owner: &PrincipalId,
        id: &OperationId,
        known_running: bool,
    ) -> Result<Operation> {
        self.transaction(|db| {
            db.execute("UPDATE operation SET status=?,effect='unknown' WHERE id=? AND owner=? AND status IN ('running','unknown')",params![if known_running {"running"} else {"unknown"},id.as_str(),owner.as_str()]).map_err(database)?;
            db.query_row(&format!("SELECT {COLUMNS} FROM operation WHERE id=? AND owner=?"),params![id.as_str(),owner.as_str()],operation).map_err(database)
        })
    }

    pub fn complete_execution(
        &mut self,
        id: &OperationId,
        checkpoint: Option<&Checkpoint>,
        status: Status,
        effect: Effect,
        result: serde_json::Value,
        error: Option<Fault>,
    ) -> Result<Operation> {
        self.finish(id,status,effect,result,error,|db,old| {
            if !matches!(old.kind, OperationKind::Exec | OperationKind::Validate) { return Err(Fault::new("OPERATION_STATE")); }
            if old.kind == OperationKind::Validate && checkpoint.is_some() { return Err(Fault::new("OPERATION_STATE")); }
            let intent: String = db.query_row("SELECT intent FROM operation WHERE id=?",[id.as_str()],|r|r.get(0)).map_err(database)?;
            let intent: serde_json::Value = serde_json::from_str(&intent).map_err(|_|Fault::new("STATE_FORMAT"))?;
            if intent["mode"] == "process" {
                if checkpoint.is_some() { return Err(Fault::new("OPERATION_STATE")); }
            } else {
                let changed = db.execute("UPDATE task SET checkpoint=COALESCE(?,checkpoint),busy=NULL WHERE id=? AND busy=? AND checkpoint=?",params![checkpoint.map(Checkpoint::as_str),old.task.as_ref().ok_or_else(||Fault::new("OPERATION_STATE"))?.as_str(),id.as_str(),crate::wire::string(&intent,"checkpoint")?]).map_err(database)?;
                if changed != 1 { return Err(Fault::new("OPERATION_STATE")); }
            }
            Ok(())
        })
    }

    pub fn admit_environment_reset(
        &mut self,
        admission: &Admission,
        task: &Task,
        expected: &Checkpoint,
    ) -> Result<Admitted> {
        self.admit(admission, |db| {
            workspace::owned(db,&admission.owner,&task.workspace,false)?;
            let busy: Option<String> = db.query_row("SELECT busy FROM task WHERE id=? AND owner=?",params![task.id.as_str(),admission.owner.as_str()],|r|r.get(0)).map_err(database)?;
            if busy.is_some() { return Err(Fault::new("TASK_BUSY")); }
            let checkpoint: String = db.query_row("SELECT checkpoint FROM task WHERE id=?", [task.id.as_str()], |r|r.get(0)).map_err(database)?;
            if checkpoint != expected.as_str() { return Err(Fault::new("STALE_CHECKPOINT")); }
            let count: i64 = db.query_row("SELECT count(*) FROM operation WHERE task=? AND kind IN ('exec','validate','artifact') AND status IN ('running','unknown')",[task.id.as_str()],|r|r.get(0)).map_err(database)?;
            if count != 0 { return Err(Fault::new("ENVIRONMENT_BUSY")); }
            db.execute("UPDATE task SET busy=? WHERE id=?",params![admission.operation.id.as_str(),task.id.as_str()]).map_err(database)?;
            Ok(())
        })
    }
}

pub(crate) fn reserve_execution(
    db: &Transaction<'_>,
    admission: &Admission,
    task: &Task,
    expected: &Checkpoint,
    process: bool,
) -> Result<()> {
    workspace::available_member(
        db,
        &admission.owner,
        &task.workspace,
        &task.repo,
        &task.identity,
    )?;
    let (checkpoint, busy, closed): (String, Option<String>, bool) = db
        .query_row(
            "SELECT checkpoint,busy,closed FROM task WHERE id=? AND owner=? AND identity=?",
            params![task.id.as_str(), admission.owner.as_str(), task.identity],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(database)?;
    if closed {
        return Err(Fault::new("TASK_CLOSED"));
    }
    if busy.is_some() {
        return Err(Fault::new("TASK_BUSY"));
    }
    if checkpoint != expected.as_str() {
        return Err(Fault::new("STALE_CHECKPOINT"));
    }
    if process {
        let count: i64 = db.query_row("SELECT count(*) FROM operation WHERE task=? AND kind='exec' AND status IN ('running','unknown') AND json_extract(intent,'$.mode')='process'", [task.id.as_str()], |r| r.get(0)).map_err(database)?;
        // This transaction includes the newly inserted operation.
        if count > 8 {
            return Err(Fault::new("PROCESS_LIMIT"));
        }
    } else {
        db.execute(
            "UPDATE task SET busy=? WHERE id=?",
            params![admission.operation.id.as_str(), task.id.as_str()],
        )
        .map_err(database)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::OperationKind;
    use serde_json::json;

    #[test]
    fn validation_completion_cannot_import_source_or_release_writer_on_rejection() {
        let root = tempfile::tempdir().unwrap();
        let mut store = Store::open(&root.path().join("state")).unwrap();
        let owner = PrincipalId::new("alice").unwrap();
        let checkpoint = Checkpoint::new("a".repeat(40)).unwrap();
        store.transaction(|db| {
            db.execute("INSERT INTO workspace(id,owner,name) VALUES('space','alice','Space')",[]).map_err(database)?;
            db.execute("INSERT INTO workspace_project(workspace,repo,identity) VALUES('space','test','local:1:2')",[]).map_err(database)?;
            db.execute("INSERT INTO task(id,owner,repo,ref,identity,base,checkpoint,workspace) VALUES('task','alice','test','refs/heads/main','local:1:2',?,?,'space')",params![checkpoint.as_str(),checkpoint.as_str()]).map_err(database)?;
            Ok(())
        }).unwrap();
        let task = store.task(&owner, "task").unwrap();
        let admission = Admission {
            owner:owner.clone(),request:RequestId::new("validate").unwrap(),fingerprint:Digest::new("a".repeat(64)).unwrap(),
            intent:Value::parse(&json!({"construction":"source-validation","mode":"command","checkpoint":checkpoint}).to_string()).unwrap(),
            operation:Operation {id:OperationId::new("validation").unwrap(),kind:OperationKind::Validate,task:Some(task.id.clone()),status:Status::Running,effect:Effect::None,result:None,error:None},
        };
        store
            .admit_execution(&admission, &task, &checkpoint, false, || Ok(()))
            .unwrap();
        let imported = Checkpoint::new("b".repeat(40)).unwrap();
        assert_eq!(
            store
                .complete_execution(
                    &admission.operation.id,
                    Some(&imported),
                    Status::Succeeded,
                    Effect::Committed,
                    json!({}),
                    None
                )
                .unwrap_err()
                .code,
            "OPERATION_STATE"
        );
        let current = store.task(&owner, task.id.as_str()).unwrap();
        assert_eq!(current.checkpoint, checkpoint);
        assert_eq!(current.busy, Some(admission.operation.id.clone()));
        assert_eq!(
            store
                .lookup(&owner, &admission.request)
                .unwrap()
                .unwrap()
                .status,
            Status::Running
        );
        store
            .complete_execution(
                &admission.operation.id,
                None,
                Status::Succeeded,
                Effect::Committed,
                json!({}),
                None,
            )
            .unwrap();
        let current = store.task(&owner, task.id.as_str()).unwrap();
        assert_eq!(current.checkpoint, checkpoint);
        assert!(current.busy.is_none());
    }
}
