use super::*;
use crate::model::{BranchRef, Checkpoint, TaskId};
use serde_json::{Value as Json, json};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Task {
    pub id: TaskId,
    pub owner: PrincipalId,
    pub repo: String,
    #[serde(rename = "ref")]
    pub branch: BranchRef,
    pub identity: String,
    pub base: Checkpoint,
    pub checkpoint: Checkpoint,
    pub busy: Option<OperationId>,
    pub closed: u8,
    pub workspace: String,
    pub managed: u8,
    pub source_ref: Option<BranchRef>,
    pub namespace: Option<String>,
    pub published_oid: Option<Checkpoint>,
    pub ref_state: Option<String>,
}
const TASK_COLUMNS: &str = "id,owner,repo,ref,identity,base,checkpoint,busy,closed,workspace,managed,source_ref,namespace,published_oid,ref_state";
fn task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    let value = json!({"id":row.get::<_,String>(0)?,"owner":row.get::<_,String>(1)?,"repo":row.get::<_,String>(2)?,"ref":row.get::<_,String>(3)?,"identity":row.get::<_,String>(4)?,"base":row.get::<_,String>(5)?,"checkpoint":row.get::<_,String>(6)?,"busy":row.get::<_,Option<String>>(7)?,"closed":row.get::<_,u8>(8)?,"workspace":row.get::<_,String>(9)?,"managed":row.get::<_,u8>(10)?,"source_ref":row.get::<_,Option<String>>(11)?,"namespace":row.get::<_,Option<String>>(12)?,"published_oid":row.get::<_,Option<String>>(13)?,"ref_state":row.get::<_,Option<String>>(14)?});
    serde_json::from_value(value).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })
}

pub struct Receipt {
    pub operation: Operation,
    pub hash: String,
    pub intent: Json,
    pub request: String,
}

impl Store {
    pub fn task(&self, owner: &PrincipalId, id: &str) -> Result<Task> {
        let task = self
            .connection()
            .query_row(
                &format!("SELECT {TASK_COLUMNS} FROM task WHERE id=? AND owner=?"),
                params![id, owner.as_str()],
                task,
            )
            .optional()
            .map_err(|_| Fault::new("STATE_FORMAT"))?
            .ok_or_else(|| Fault::new("TASK_NOT_FOUND"))?;
        if task.closed > 1 || task.managed > 1 {
            return Err(Fault::new("STATE_FORMAT"));
        }
        crate::model::WorkspaceId::new(&task.workspace).map_err(|_| Fault::new("STATE_FORMAT"))?;
        if task
            .ref_state
            .as_deref()
            .is_some_and(|s| !["reserved", "published", "deleted"].contains(&s))
            || (task.managed == 1 && (task.source_ref.is_none() || task.namespace.is_none()))
        {
            return Err(Fault::new("STATE_FORMAT"));
        }
        workspace::owned(self.connection(), owner, &task.workspace, false)?;
        Ok(task)
    }
    pub fn tasks(
        &self,
        owner: &PrincipalId,
        workspace: Option<&str>,
        after: u64,
        limit: u64,
        closed: bool,
    ) -> Result<Vec<(u64, Task)>> {
        let mut stmt = self.connection().prepare(&format!("SELECT {TASK_COLUMNS},rowid FROM task WHERE owner=? AND (? IS NULL OR workspace=?) AND rowid>? AND (? OR closed=0) ORDER BY rowid LIMIT ?")).map_err(database)?;
        stmt.query_map(
            params![
                owner.as_str(),
                workspace,
                workspace,
                i64::try_from(after).map_err(|_| Fault::new("SCHEMA"))?,
                closed,
                i64::try_from(limit).map_err(|_| Fault::new("SCHEMA"))?
            ],
            |r| Ok((r.get::<_, i64>(15)? as u64, task(r)?)),
        )
        .map_err(database)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| Fault::new("STATE_FORMAT"))
    }
    pub fn receipt(
        &self,
        owner: &PrincipalId,
        id: Option<&str>,
        request: Option<&str>,
    ) -> Result<Option<Receipt>> {
        self.connection().query_row(&format!("SELECT {COLUMNS},hash,intent,request FROM operation WHERE owner=? AND ((? IS NOT NULL AND id=?) OR (? IS NOT NULL AND request=?))"),params![owner.as_str(),id,id,request,request],|r| {
            let intent: String = r.get(8)?;
            Ok(Receipt{operation:operation(r)?,hash:r.get(7)?,intent:serde_json::from_str(&intent).map_err(|e|rusqlite::Error::FromSqlConversionFailure(8,rusqlite::types::Type::Text,Box::new(e)))?,request:r.get(9)?})
        }).optional().map_err(|_|Fault::new("STATE_FORMAT"))
    }
    pub fn task_operations(
        &self,
        owner: &PrincipalId,
        id: &TaskId,
        before: u64,
        limit: u64,
    ) -> Result<Vec<(u64, Json)>> {
        let mut stmt = self.connection().prepare(&format!("SELECT {COLUMNS},request,rowid FROM operation WHERE owner=? AND task=? AND rowid<? ORDER BY rowid DESC LIMIT ?")).map_err(database)?;
        stmt.query_map(
            params![
                owner.as_str(),
                id.as_str(),
                i64::try_from(before).map_err(|_| Fault::new("SCHEMA"))?,
                i64::try_from(limit).map_err(|_| Fault::new("SCHEMA"))?
            ],
            |r| {
                let op = operation(r)?;
                let mut value = serde_json::to_value(op).unwrap();
                value["requestId"] = json!(r.get::<_, String>(7)?);
                Ok((r.get::<_, i64>(8)? as u64, value))
            },
        )
        .map_err(database)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| Fault::new("STATE_FORMAT"))
    }
    pub fn pending_tasks(
        &self,
        owner: &PrincipalId,
        workspace: &str,
        after: u64,
        limit: u64,
    ) -> Result<Vec<(u64, Json)>> {
        let mut stmt = self.connection().prepare(&format!("SELECT {COLUMNS},request,rowid FROM operation WHERE owner=? AND kind='task' AND task IS NULL AND status IN ('running','unknown') AND json_extract(intent,'$.workspaceId')=? AND rowid>? ORDER BY rowid LIMIT ?")).map_err(database)?;
        stmt.query_map(params![owner.as_str(),workspace,i64::try_from(after).map_err(|_|Fault::new("SCHEMA"))?,i64::try_from(limit).map_err(|_|Fault::new("SCHEMA"))?],|r|Ok((r.get::<_,i64>(8)? as u64,json!({"operationId":r.get::<_,String>(0)?,"requestId":r.get::<_,String>(7)?,"operation":operation(r)?})))).map_err(database)?.collect::<std::result::Result<Vec<_>,_>>().map_err(|_|Fault::new("STATE_FORMAT"))
    }
    pub fn admit_open(
        &mut self,
        admission: &Admission,
        input: &Json,
        repo: &str,
        identity: &str,
        proposed_workspace: &str,
    ) -> Result<(Admitted, String)> {
        let mut workspace = String::new();
        let admitted = self.admit(admission, |db| {
            workspace = workspace::bind(
                db,
                &admission.owner,
                input["workspaceId"].as_str(),
                proposed_workspace,
                repo,
                identity,
            )?;
            let mut intent: Json = serde_json::from_slice(&admission.intent.canonical()?)
                .map_err(|_| Fault::new("STATE_FORMAT"))?;
            intent["workspaceId"] = json!(workspace);
            db.execute(
                "UPDATE operation SET repo=?,ref=?,intent=? WHERE id=?",
                params![
                    repo,
                    input["ref"].as_str(),
                    encoded(&intent)?,
                    admission.operation.id.as_str()
                ],
            )
            .map_err(database)?;
            Ok(())
        })?;
        Ok((admitted, workspace))
    }
    pub fn reserve_task(
        &mut self,
        admission: &Admission,
        task: &Task,
        expected: &Checkpoint,
    ) -> Result<Admitted> {
        self.admit(admission, |db| {
            workspace::available_member(
                db,
                &admission.owner,
                &task.workspace,
                &task.repo,
                &task.identity,
            )?;
            let current = db
                .query_row(
                    &format!("SELECT {TASK_COLUMNS} FROM task WHERE id=? AND owner=?"),
                    params![task.id.as_str(), admission.owner.as_str()],
                    self::task,
                )
                .map_err(database)?;
            if current.closed != 0 {
                return Err(Fault::new("TASK_CLOSED"));
            }
            if current.busy.is_some() {
                return Err(Fault::new("TASK_BUSY"));
            }
            if &current.checkpoint != expected {
                return Err(Fault::new("STALE_CHECKPOINT"));
            }
            db.execute(
                "UPDATE task SET busy=? WHERE id=?",
                params![admission.operation.id.as_str(), task.id.as_str()],
            )
            .map_err(database)?;
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
    pub fn complete_open(&mut self, admission: &Admission, task: &Task) -> Result<Operation> {
        let result = json!({"taskId":task.id,"workspaceId":task.workspace,"repo":task.repo,"ref":task.branch,"base":task.base,"checkpoint":task.checkpoint});
        self.finish(&admission.operation.id,Status::Succeeded,Effect::Committed,result,None,|db,_| {
            db.execute("INSERT INTO task(id,owner,repo,ref,identity,base,checkpoint,workspace) VALUES(?,?,?,?,?,?,?,?)",params![task.id.as_str(),task.owner.as_str(),task.repo,task.branch.as_str(),task.identity,task.base.as_str(),task.checkpoint.as_str(),task.workspace]).map_err(database)?;
            db.execute("UPDATE operation SET task=? WHERE id=?",params![task.id.as_str(),admission.operation.id.as_str()]).map_err(database)?;
            Ok(())
        })?;
        Ok(self
            .receipt(
                &admission.owner,
                Some(admission.operation.id.as_str()),
                None,
            )?
            .unwrap()
            .operation)
    }
    pub fn complete_source(
        &mut self,
        id: &OperationId,
        result: Result<Json>,
        checkpoint: Option<&Checkpoint>,
        close: bool,
    ) -> Result<Operation> {
        let (status, effect, value, error) = match result {
            Ok(value) => (Status::Succeeded, Effect::Committed, value, None),
            Err(mut error) => {
                error.effect = Effect::None;
                error.operation_id = Some(id.clone());
                (Status::Failed, Effect::None, Json::Null, Some(error))
            }
        };
        let succeeded = status == Status::Succeeded;
        self.finish(id,status,effect,value,error,|db,old| {
            if let Some(task)=&old.task {
                let changed=db.execute("UPDATE task SET checkpoint=COALESCE(?,checkpoint),closed=CASE WHEN ? THEN 1 ELSE closed END,busy=NULL WHERE id=? AND busy=?",params![checkpoint.map(Checkpoint::as_str),close && succeeded,task.as_str(),id.as_str()]).map_err(database)?;
                if changed!=1 { return Err(Fault::new("OPERATION_STATE")); }
            }
            Ok(())
        })
    }
    /// Only private source construction can be terminalized without an external
    /// effect reconciliation. Never infer this policy from operation kind alone.
    pub fn recover_source(&mut self) -> Result<usize> {
        let mut stmt=self.connection().prepare("SELECT id FROM operation WHERE status='running' AND effect='none' AND kind IN ('task','edit') AND json_extract(intent,'$.construction')='private-source'").map_err(database)?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(database)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(database)?;
        drop(stmt);
        for id in &ids {
            self.complete_source(
                &OperationId::new(id)?,
                Err(Fault::new("INTERRUPTED")),
                None,
                false,
            )?;
        }
        Ok(ids.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::OperationKind;

    fn admission(id: &str, kind: OperationKind, construction: &str) -> Admission {
        let intent = Value::parse(
            &json!({"construction":construction,"input":{"requestId":id}}).to_string(),
        )
        .unwrap();
        Admission {
            owner: PrincipalId::new("alice").unwrap(),
            request: RequestId::new(id).unwrap(),
            fingerprint: intent.fingerprint().unwrap(),
            intent,
            operation: Operation {
                id: OperationId::new(id).unwrap(),
                kind,
                task: None,
                status: Status::Running,
                effect: Effect::None,
                result: None,
                error: None,
            },
        }
    }

    #[test]
    fn recovery_does_not_reinterpret_unknown_execution_or_unowned_intents() {
        let root = tempfile::tempdir().unwrap();
        let mut store = Store::open(&root.path().join("state")).unwrap();
        for (id, kind, construction) in [
            ("source", OperationKind::Edit, "private-source"),
            ("execution", OperationKind::Exec, "private-source"),
            ("other-task", OperationKind::Task, "external-ref"),
            ("unknown", OperationKind::Edit, "private-source"),
        ] {
            store
                .admit(&admission(id, kind, construction), |_| Ok(()))
                .unwrap();
        }
        store
            .connection()
            .execute(
                "UPDATE operation SET status='unknown',effect='unknown' WHERE id='unknown'",
                [],
            )
            .unwrap();
        drop(store);
        let mut store = Store::open(&root.path().join("state")).unwrap();
        assert_eq!(store.recover_source().unwrap(), 1);
        let owner = PrincipalId::new("alice").unwrap();
        let source = store
            .receipt(&owner, Some("source"), None)
            .unwrap()
            .unwrap()
            .operation;
        assert_eq!(source.status, Status::Failed);
        assert_eq!(source.error.unwrap().code, "INTERRUPTED");
        for id in ["execution", "other-task"] {
            assert_eq!(
                store
                    .receipt(&owner, Some(id), None)
                    .unwrap()
                    .unwrap()
                    .operation
                    .status,
                Status::Running
            );
        }
        let unknown = store
            .receipt(&owner, Some("unknown"), None)
            .unwrap()
            .unwrap()
            .operation;
        assert_eq!(
            (unknown.status, unknown.effect),
            (Status::Unknown, Effect::Unknown)
        );
        assert_eq!(store.recover_source().unwrap(), 0);
    }
}
