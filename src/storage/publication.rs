//! One publication per validation; aliases retain request identity without another effect.
use super::*;
use crate::{
    model::{Checkpoint, OperationKind},
    storage::source::Receipt,
};
use serde_json::{Value as Json, json};

impl Store {
    pub fn publication_alias(
        &mut self,
        admission: &Admission,
        validation: &OperationId,
    ) -> Result<Option<Operation>> {
        let original: Option<String> = self
            .connection()
            .query_row(
                "SELECT id FROM operation WHERE owner=? AND publication=?",
                params![admission.owner.as_str(), validation.as_str()],
                |r| r.get(0),
            )
            .optional()
            .map_err(database)?;
        let Some(original) = original else {
            return Ok(None);
        };
        let receipt = self
            .receipt(&admission.owner, Some(&original), None)?
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
        let mut requested: Json = serde_json::from_str(
            &String::from_utf8(admission.intent.canonical()?)
                .map_err(|_| Fault::new("STATE_FORMAT"))?,
        )
        .map_err(|_| Fault::new("STATE_FORMAT"))?;
        requested["input"]["requestId"] = receipt.intent["input"]["requestId"].clone();
        if requested["input"] != receipt.intent["input"] {
            return Err(Fault::new("IDEMPOTENCY_MISMATCH"));
        }
        let mut alias = Admission {
            owner: admission.owner.clone(),
            request: admission.request.clone(),
            fingerprint: admission.fingerprint.clone(),
            operation: admission.operation.clone(),
            intent: admission.intent.clone(),
        };
        requested["input"]["requestId"] = json!(admission.request);
        requested["aliasOf"] = json!(receipt.operation.id);
        alias.intent = Value::parse(&requested.to_string())?;
        if let Admitted::New(op) = self.admit(&alias, |_| Ok(()))? {
            self.finish(
                &op.id,
                Status::Succeeded,
                Effect::Committed,
                json!({"originalOperationId":receipt.operation.id}),
                None,
                |_, _| Ok(()),
            )?;
        }
        Ok(Some(receipt.operation))
    }

    pub fn admit_publication(
        &mut self,
        admission: &Admission,
        task: &source::Task,
        validation: &Receipt,
    ) -> Result<Admitted> {
        if let Some(original) = self.publication_alias(admission, &validation.operation.id)? {
            return Ok(Admitted::Replay(original));
        }
        self.admit(admission, |db| {
            execution::reserve_execution(db, admission, task, &task.checkpoint, false)?;
            db.execute("UPDATE operation SET repo=?,ref=?,publication=? WHERE id=?",params![task.repo,task.branch.as_str(),validation.operation.id.as_str(),admission.operation.id.as_str()]).map_err(database)?;
            let current: (String,String) = db.query_row("SELECT status,intent FROM operation WHERE id=? AND owner=? AND kind='validate'",params![validation.operation.id.as_str(),admission.owner.as_str()],|r|Ok((r.get(0)?,r.get(1)?))).map_err(database)?;
            if current.0 != "succeeded" || serde_json::from_str::<Json>(&current.1).map_err(|_|Fault::new("STATE_FORMAT"))? != validation.intent {return Err(Fault::new("VALIDATION_REQUIRED"));}
            Ok(())
        })
    }

    pub fn publication_dispatch(&mut self, id: &OperationId) -> Result<()> {
        self.transaction(|db| {
            let changed = db.execute("UPDATE operation SET intent=json_set(intent,'$.dispatched',json('true')),status='unknown',effect='unknown' WHERE id=? AND kind='publish' AND status='running' AND effect='none' AND EXISTS(SELECT 1 FROM task WHERE task.id=operation.task AND task.busy=operation.id)",[id.as_str()]).map_err(database)?;
            if changed != 1 {return Err(Fault::new("OPERATION_STATE"));}
            Ok(())
        })
    }

    pub fn complete_publication(
        &mut self,
        id: &OperationId,
        result: Result<Json>,
        candidate: &Checkpoint,
        checkpoint: &Checkpoint,
    ) -> Result<Operation> {
        let (status, effect, value, error) = match result {
            Ok(value) => (Status::Succeeded, Effect::Committed, value, None),
            Err(mut error) => {
                error.operation_id = Some(id.clone());
                error.effect = Effect::None;
                (Status::Failed, Effect::None, Json::Null, Some(error))
            }
        };
        let succeeded = status == Status::Succeeded;
        self.finish(id,status,effect,value,error,|db,old| {
            if old.kind != OperationKind::Publish {return Err(Fault::new("OPERATION_STATE"));}
            let task = old.task.as_ref().ok_or_else(||Fault::new("OPERATION_STATE"))?;
            let changed = db.execute("UPDATE task SET busy=NULL,closed=CASE WHEN ? THEN 1 ELSE closed END,published_oid=CASE WHEN ? AND managed=1 THEN ? ELSE published_oid END,ref_state=CASE WHEN ? AND managed=1 THEN 'published' ELSE ref_state END WHERE id=? AND busy=? AND checkpoint=?",params![succeeded,succeeded,candidate.as_str(),succeeded,task.as_str(),id.as_str(),checkpoint.as_str()]).map_err(database)?;
            if changed != 1 {return Err(Fault::new("OPERATION_STATE"));}
            Ok(())
        })
    }
}
