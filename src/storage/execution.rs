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
            workspace::available_member(db, &admission.owner, &task.workspace, &task.repo, &task.identity)?;
            let (checkpoint, busy, closed): (String, Option<String>, bool) = db.query_row("SELECT checkpoint,busy,closed FROM task WHERE id=? AND owner=? AND identity=?", params![task.id.as_str(), admission.owner.as_str(), task.identity], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(database)?;
            if closed { return Err(Fault::new("TASK_CLOSED")); }
            if busy.is_some() { return Err(Fault::new("TASK_BUSY")); }
            if checkpoint != expected.as_str() { return Err(Fault::new("STALE_CHECKPOINT")); }
            if process {
                let count: i64 = db.query_row("SELECT count(*) FROM operation WHERE task=? AND kind='exec' AND status IN ('running','unknown') AND json_extract(intent,'$.mode')='process'", [task.id.as_str()], |r| r.get(0)).map_err(database)?;
                // This transaction includes the newly inserted operation.
                if count > 8 { return Err(Fault::new("PROCESS_LIMIT")); }
            } else {
                db.execute("UPDATE task SET busy=? WHERE id=?", params![admission.operation.id.as_str(), task.id.as_str()]).map_err(database)?;
            }
            reserve_work()?;
            db.execute("UPDATE operation SET repo=?,ref=? WHERE id=?", params![task.repo, task.branch.as_str(), admission.operation.id.as_str()]).map_err(database)?;
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
                    "SELECT intent,status FROM operation WHERE id=? AND owner=? AND kind='exec'",
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
            if old.kind != OperationKind::Exec { return Err(Fault::new("OPERATION_STATE")); }
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
