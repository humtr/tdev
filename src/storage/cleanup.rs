//! Ref intent/uncertainty precedes dispatch; task retirement and receipt commit together.
use super::*;
use serde_json::Value as Json;

impl Store {
    pub fn cleanup_dispatch(&mut self, id: &OperationId, intent: &Json) -> Result<()> {
        self.transaction(|db| {
            let changed = db.execute("UPDATE operation SET intent=?,status='unknown',effect='unknown' WHERE id=? AND kind='task' AND status='running' AND effect='none' AND json_extract(intent,'$.construction')='managed-ref-cleanup' AND EXISTS(SELECT 1 FROM task WHERE task.id=operation.task AND task.busy=operation.id)",params![encoded(intent)?,id.as_str()]).map_err(database)?;
            if changed != 1 { return Err(Fault::new("OPERATION_STATE")); }
            Ok(())
        })
    }
    pub fn cleanup_unknown(&mut self, id: &OperationId, mut error: Fault) -> Result<Operation> {
        error.effect = Effect::Unknown;
        error.operation_id = Some(id.clone());
        self.transaction(|db| {
            db.execute("UPDATE operation SET status='unknown',effect='unknown',error=? WHERE id=? AND kind='task' AND status IN ('running','unknown') AND json_extract(intent,'$.construction')='managed-ref-cleanup'",params![encoded(&error)?,id.as_str()]).map_err(database)?;
            db.query_row(&format!("SELECT {COLUMNS} FROM operation WHERE id=?"),[id.as_str()],operation).map_err(database)
        })
    }
    pub fn complete_cleanup(
        &mut self,
        id: &OperationId,
        result: Result<Json>,
    ) -> Result<Operation> {
        let (status, effect, value, error) = match result {
            Ok(value) => (Status::Succeeded, Effect::Committed, value, None),
            Err(mut error) => {
                error.effect = Effect::None;
                error.operation_id = Some(id.clone());
                (Status::Failed, Effect::None, Json::Null, Some(error))
            }
        };
        let success = status == Status::Succeeded;
        self.finish(id,status,effect,value,error,|db,old| {
            let task = old.task.as_ref().ok_or_else(||Fault::new("OPERATION_STATE"))?;
            let role: String = db.query_row("SELECT json_extract(intent,'$.construction') FROM operation WHERE id=?",[id.as_str()],|r|r.get(0)).map_err(database)?;
            if old.kind != crate::model::OperationKind::Task || role != "managed-ref-cleanup" { return Err(Fault::new("OPERATION_STATE")); }
            let changed = db.execute("UPDATE task SET busy=NULL,closed=CASE WHEN ? THEN 1 ELSE closed END,ref_state=CASE WHEN ? THEN 'deleted' ELSE ref_state END WHERE id=? AND busy=?",params![success,success,task.as_str(),id.as_str()]).map_err(database)?;
            if changed != 1 { return Err(Fault::new("OPERATION_STATE")); }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Checkpoint, OperationKind};
    use serde_json::json;

    #[test]
    fn closed_detached_cleanup_freezes_publication_and_retains_uncertainty_across_restart() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("state");
        let mut store = Store::open(&path).unwrap();
        store.transaction(|db| {
            db.execute("INSERT INTO workspace(id,owner,name,closed) VALUES('space','alice','Space',1)",[]).map_err(database)?;
            db.execute("INSERT INTO task(id,owner,repo,ref,identity,base,checkpoint,closed,workspace,managed,source_ref,namespace,published_oid,ref_state) VALUES('task','alice','test','refs/heads/work/task','local:1:2',?,?,1,'space',1,'refs/heads/main','refs/heads/work/',?,'published')",params!["a".repeat(40),"a".repeat(40),"b".repeat(40)]).map_err(database)?;
            Ok(())
        }).unwrap();
        let owner = PrincipalId::new("alice").unwrap();
        let task = store.task(&owner, "task").unwrap();
        let mut admission = Admission {
            owner: owner.clone(),
            request: RequestId::new("cleanup").unwrap(),
            fingerprint: Digest::new("a".repeat(64)).unwrap(),
            operation: Operation {
                id: OperationId::new("cleanup-op").unwrap(),
                kind: OperationKind::Task,
                task: Some(task.id.clone()),
                status: Status::Running,
                effect: Effect::None,
                result: None,
                error: None,
            },
            intent: Value::parse(
                &json!({"input":{"action":"cleanup"},"construction":"managed-ref-cleanup"})
                    .to_string(),
            )
            .unwrap(),
        };
        store
            .connection()
            .execute(
                "UPDATE task SET published_oid=? WHERE id='task'",
                ["c".repeat(40)],
            )
            .unwrap();
        assert_eq!(
            store.reserve_cleanup(&admission, &task).err().unwrap().code,
            "SOURCE_CHANGED"
        );
        assert!(store.lookup(&owner, &admission.request).unwrap().is_none());
        store
            .connection()
            .execute(
                "UPDATE task SET published_oid=? WHERE id='task'",
                ["b".repeat(40)],
            )
            .unwrap();
        assert!(matches!(
            store.reserve_cleanup(&admission, &task).unwrap(),
            Admitted::New(_)
        ));
        let intent = json!({"input":{"action":"cleanup"},"construction":"managed-ref-cleanup","refMutation":"delete","old":"b".repeat(40)});
        store
            .cleanup_dispatch(&admission.operation.id, &intent)
            .unwrap();
        admission.request = RequestId::new("second").unwrap();
        admission.operation.id = OperationId::new("second-op").unwrap();
        assert_eq!(
            store.reserve_cleanup(&admission, &task).err().unwrap().code,
            "TASK_BUSY"
        );
        drop(store);
        let mut store = Store::open(&path).unwrap();
        assert_eq!(store.recover_source().unwrap(), 0);
        let id = OperationId::new("cleanup-op").unwrap();
        let pending = store
            .receipt(&owner, Some(id.as_str()), None)
            .unwrap()
            .unwrap();
        assert_eq!(
            (pending.operation.status, pending.operation.effect),
            (Status::Unknown, Effect::Unknown)
        );
        store
            .complete_cleanup(&id, Ok(json!({"cleaned":true})))
            .unwrap();
        let completed = store.task(&owner, "task").unwrap();
        assert_eq!(
            (
                completed.closed,
                completed.ref_state.as_deref(),
                completed.busy
            ),
            (1, Some("deleted"), None)
        );
        assert_eq!(
            completed.checkpoint,
            Checkpoint::new("a".repeat(40)).unwrap()
        );
        assert_eq!(
            completed.published_oid,
            Some(Checkpoint::new("b".repeat(40)).unwrap())
        );
        assert_eq!(
            store
                .cleanup_unknown(&id, Fault::new("LATE"))
                .unwrap()
                .status,
            Status::Succeeded
        );
    }
}
