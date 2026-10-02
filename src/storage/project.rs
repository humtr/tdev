//! Enrollment and receipt commit together; provider work never runs in a transaction.
use super::*;
use crate::model::ProjectId;
use serde_json::Value as Json;

#[derive(Clone)]
pub struct Project {
    pub id: ProjectId,
    pub owner: PrincipalId,
    pub policy: String,
    pub authority: Digest,
    pub identity: String,
    pub config: Json,
}

impl Store {
    pub fn projects(&self, owner: &PrincipalId) -> Result<Vec<Project>> {
        let mut stmt = self
            .connection()
            .prepare(
                "SELECT id,policy,authority,identity,config FROM project WHERE owner=? ORDER BY id",
            )
            .map_err(database)?;
        let rows = stmt
            .query_map([owner.as_str()], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(database)?;
        rows.map(|row| {
            let (id, policy, authority, identity, config) = row.map_err(database)?;
            let config = crate::wire::Json::parse(config.as_bytes())
                .map_err(|_| Fault::new("STATE_FORMAT"))?
                .value;
            if config["identity"].as_str() != Some(&identity) || !config.is_object() {
                return Err(Fault::new("STATE_FORMAT"));
            }
            Ok(Project {
                id: ProjectId::new(id)?,
                owner: owner.clone(),
                policy,
                authority: Digest::new(authority)?,
                identity,
                config,
            })
        })
        .collect()
    }

    /// Persist dispatch uncertainty or exact creation evidence before its next boundary.
    pub fn project_intent(&mut self, id: &OperationId, intent: &Json) -> Result<()> {
        self.transaction(|db| {
            let changed = db.execute("UPDATE operation SET intent=?,status='unknown',effect='unknown' WHERE id=? AND kind='project' AND status IN ('running','unknown')", params![encoded(intent)?,id.as_str()]).map_err(database)?;
            if changed != 1 { return Err(Fault::new("OPERATION_STATE")); }
            Ok(())
        })
    }

    pub fn project_unknown(&mut self, id: &OperationId, error: Fault) -> Result<Operation> {
        self.transaction(|db| {
            db.execute("UPDATE operation SET status='unknown',effect='unknown',error=? WHERE id=? AND kind='project' AND status IN ('running','unknown')", params![encoded(&error)?,id.as_str()]).map_err(database)?;
            db.query_row(&format!("SELECT {COLUMNS} FROM operation WHERE id=?"), [id.as_str()], operation).map_err(database)
        })
    }

    pub fn complete_project(
        &mut self,
        id: &OperationId,
        project: &Project,
        result: Json,
    ) -> Result<Operation> {
        self.finish(id, Status::Succeeded, Effect::Committed, result, None, |db, old| {
            let owner: String = db.query_row("SELECT owner FROM operation WHERE id=?",[id.as_str()],|r|r.get(0)).map_err(database)?;
            if old.kind != crate::model::OperationKind::Project || owner != project.owner.as_str() || project.config["identity"].as_str() != Some(&project.identity) {
                return Err(Fault::new("OPERATION_STATE"));
            }
            let existing: Option<(String,String,String,String)> = db.query_row("SELECT id,policy,authority,config FROM project WHERE owner=? AND identity=?", params![project.owner.as_str(),project.identity], |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(database)?;
            if let Some((key,policy,authority,config)) = existing {
                let config: Json = serde_json::from_str(&config).map_err(|_|Fault::new("STATE_FORMAT"))?;
                if key != project.id.as_str() || policy != project.policy || authority != project.authority.as_str() || config != project.config {
                    return Err(Fault::new("PROJECT_ALREADY_CONNECTED"));
                }
            } else {
                db.execute("INSERT INTO project(id,owner,policy,authority,identity,config) VALUES(?,?,?,?,?,?)",params![project.id.as_str(),project.owner.as_str(),project.policy,project.authority.as_str(),project.identity,encoded(&project.config)?]).map_err(database)?;
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::OperationKind;
    use serde_json::json;

    fn admission(request: &str) -> Admission {
        let intent =
            Value::parse(&json!({"input":{"requestId":request,"policy":"local"}}).to_string())
                .unwrap();
        Admission {
            owner: PrincipalId::new("alice").unwrap(),
            request: RequestId::new(request).unwrap(),
            fingerprint: intent.fingerprint().unwrap(),
            intent,
            operation: Operation {
                id: OperationId::new(request).unwrap(),
                kind: OperationKind::Project,
                task: None,
                status: Status::Running,
                effect: Effect::None,
                result: None,
                error: None,
            },
        }
    }
    fn project() -> Project {
        Project {
            id: ProjectId::new("project").unwrap(),
            owner: PrincipalId::new("alice").unwrap(),
            policy: "local".into(),
            authority: Digest::new("a".repeat(64)).unwrap(),
            identity: "local:1:2".into(),
            config: json!({"identity":"local:1:2","checkout":"/owned"}),
        }
    }

    #[test]
    fn enrollment_and_receipt_are_atomic_and_terminal_evidence_cannot_regress() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = Store::open(&directory.path().join("state")).unwrap();
        let first = admission("first");
        store.admit(&first, |_| Ok(())).unwrap();
        let project = project();
        let original = store
            .complete_project(&first.operation.id, &project, json!({"repo":project.id}))
            .unwrap();
        let later = store
            .project_unknown(&first.operation.id, Fault::new("LATE"))
            .unwrap();
        assert_eq!(
            serde_json::to_value(original).unwrap(),
            serde_json::to_value(later).unwrap()
        );
        assert_eq!(
            store
                .project_intent(&first.operation.id, &json!({}))
                .unwrap_err()
                .code,
            "OPERATION_STATE"
        );
        let second = admission("second");
        store.admit(&second, |_| Ok(())).unwrap();
        let mut different = project.clone();
        different.config["checkout"] = json!("/other");
        assert_eq!(
            store
                .complete_project(&second.operation.id, &different, json!({}))
                .unwrap_err()
                .code,
            "PROJECT_ALREADY_CONNECTED"
        );
        assert_eq!(
            store
                .lookup(&second.owner, &second.request)
                .unwrap()
                .unwrap()
                .status,
            Status::Running
        );
        assert_eq!(
            store.projects(&first.owner).unwrap()[0].config,
            project.config
        );
        drop(store);
        let store = Store::open(&directory.path().join("state")).unwrap();
        assert_eq!(store.projects(&first.owner).unwrap().len(), 1);
        assert_eq!(
            store
                .lookup(&first.owner, &first.request)
                .unwrap()
                .unwrap()
                .status,
            Status::Succeeded
        );
    }

    #[test]
    fn completion_cannot_enroll_for_another_operation_owner_or_feature() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = Store::open(&directory.path().join("state")).unwrap();
        let first = admission("owner");
        store.admit(&first, |_| Ok(())).unwrap();
        let mut project = project();
        project.owner = PrincipalId::new("bob").unwrap();
        assert_eq!(
            store
                .complete_project(&first.operation.id, &project, json!({}))
                .unwrap_err()
                .code,
            "OPERATION_STATE"
        );
        let mut other = admission("feature");
        other.operation.kind = OperationKind::Exec;
        store.admit(&other, |_| Ok(())).unwrap();
        project.owner = first.owner.clone();
        assert_eq!(
            store
                .complete_project(&other.operation.id, &project, json!({}))
                .unwrap_err()
                .code,
            "OPERATION_STATE"
        );
        assert!(store.projects(&first.owner).unwrap().is_empty());
    }
}
