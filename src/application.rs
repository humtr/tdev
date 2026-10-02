//! Request routing joins feature owners; it never owns provider or SQL mechanics.
use crate::{
    admission::{Context, Repository},
    contract::{Contract, Surface},
    git::Git,
    identity,
    model::*,
    storage::{
        Admission, Store,
        source::{Receipt, Task},
    },
    wire,
};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

pub struct Application {
    pub contract: Contract,
    pub surface: Surface,
    pub config: PathBuf,
    pub root: PathBuf,
    store: Mutex<Store>,
}
impl Application {
    pub fn open(root: &Path, config: &Path) -> Result<Self> {
        if !root.is_absolute() || !config.is_absolute() {
            return Err(Fault::new("CONFIG_PATH"));
        }
        let contract = Contract::embedded()?;
        let surface = Surface::source(&contract)?;
        let mut store = Store::open(root)?;
        store.recover_source()?;
        Ok(Self {
            contract,
            surface,
            config: config.into(),
            root: root.into(),
            store: Mutex::new(store),
        })
    }
    pub(crate) fn store(&self) -> Result<MutexGuard<'_, Store>> {
        self.store.lock().map_err(|_| Fault::new("STORAGE"))
    }
    pub(crate) fn git(&self, repo: &Repository) -> Result<Git> {
        // Git construction and identity verification must never hold Store's mutex.
        Git::open(&self.root.join("sources").join(&repo.name), repo.local()?)
    }
    pub(crate) fn task(&self, context: &Context, id: &str) -> Result<(Task, Repository)> {
        let task = self.store()?.task(&context.principal, id)?;
        let repo = context.repository(&task.repo, Some(&task.identity))?;
        let permitted = if task.managed == 0 {
            repo.refs.contains(&task.branch)
        } else {
            task.source_ref
                .as_ref()
                .is_some_and(|r| repo.refs.contains(r))
                && task.namespace.as_ref().is_some_and(|ns| {
                    repo.namespaces.contains(ns) && task.branch.as_str().starts_with(ns)
                })
        };
        if !permitted {
            return Err(Fault::new("PERMISSION_DENIED"));
        }
        Ok((task, repo))
    }
    pub(crate) fn authorize_receipt(&self, context: &Context, receipt: &Receipt) -> Result<()> {
        // Authority belongs to each feature. Do not infer it for receipts whose
        // feature has not been connected to this executable yet.
        if !matches!(
            receipt.operation.kind,
            OperationKind::Workspace | OperationKind::Task | OperationKind::Edit
        ) {
            return Err(Fault::new("UNSUPPORTED_OPERATION"));
        }
        if let Some(task) = &receipt.operation.task {
            self.task(context, task.as_str())?;
        }
        if let Some(repo) = receipt.intent["input"]["repo"].as_str() {
            let repository = context.repository(repo, receipt.intent["identity"].as_str())?;
            if let Some(branch) = receipt.intent["input"]["ref"].as_str()
                && !repository.refs.contains(&BranchRef::new(branch)?)
            {
                return Err(Fault::new("PERMISSION_DENIED"));
            }
        }
        if let Some(id) = receipt.intent["workspaceId"]
            .as_str()
            .or_else(|| receipt.intent["input"]["workspaceId"].as_str())
        {
            self.store()?.workspace(&context.principal, id, false)?;
        }
        Ok(())
    }
    pub(crate) fn replay(
        &self,
        context: &Context,
        input: &Value,
        kind: &str,
        original: &identity::Value,
    ) -> Result<Option<Operation>> {
        let request = wire::string(input, "requestId")?;
        let receipt = self
            .store()?
            .receipt(&context.principal, None, Some(request))?;
        if let Some(receipt) = receipt {
            self.authorize_receipt(context, &receipt)?;
            if receipt.hash != wire::fingerprint(kind, original)?.as_str() {
                return Err(Fault::new("IDEMPOTENCY_MISMATCH"));
            }
            return Ok(Some(receipt.operation));
        }
        Ok(None)
    }
    pub(crate) fn admission(
        &self,
        context: &Context,
        input: &Value,
        original: &identity::Value,
        kind: OperationKind,
        task: Option<TaskId>,
        identity: Option<&str>,
    ) -> Result<Admission> {
        let kind_name = serde_json::to_value(&kind).unwrap();
        let intent = json!({"input":input,"identity":identity,"construction":"private-source"});
        Ok(Admission {
            owner: context.principal.clone(),
            request: RequestId::new(wire::string(input, "requestId")?)?,
            fingerprint: wire::fingerprint(kind_name.as_str().unwrap(), original)?,
            intent: identity::Value::parse(&serde_json::to_string(&intent).unwrap())?,
            operation: Operation {
                id: OperationId::new(uuid::Uuid::new_v4().to_string())?,
                kind,
                task,
                status: Status::Running,
                effect: Effect::None,
                result: None,
                error: None,
            },
        })
    }
    pub fn call(
        &self,
        context: &Context,
        name: &str,
        arguments: &Value,
        original: &identity::Value,
    ) -> Value {
        let outcome = (|| {
            let input = self.surface.input(name, arguments)?;
            match name {
                "tdev_task" => crate::source::task(self, context, input, original),
                "tdev_edit" => crate::source::edit(self, context, input, original),
                "tdev_read" => crate::source::read(self, context, input),
                "tdev_workspace" => crate::workspace::call(self, context, input, original),
                "tdev_project" => crate::project::call(self, context, input),
                "tdev_operation" => self.status(context, input),
                _ => Err(Fault::new("SCHEMA")),
            }
        })();
        let value = match outcome {
            Ok(result) => json!({"ok":true,"result":result}),
            Err(error) => json!({"ok":false,"error":error}),
        };
        if self.contract.output(name, &value).is_err() {
            return json!({"ok":false,"error":Fault::new("CONTRACT_OUTPUT")});
        }
        value
    }
    fn status(&self, context: &Context, input: &Value) -> Result<Value> {
        let deadline = std::time::Instant::now()
            + std::time::Duration::from_millis(wire::bounded(input, "waitMs", 0, 30000)?);
        loop {
            let receipt = self
                .store()?
                .receipt(
                    &context.principal,
                    input["operationId"].as_str(),
                    input["lookupRequestId"].as_str(),
                )?
                .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
            self.authorize_receipt(context, &receipt)?;
            let terminal = receipt.operation.status.is_terminal();
            if terminal || std::time::Instant::now() >= deadline {
                let mut value = serde_json::to_value(receipt.operation)
                    .map_err(|_| Fault::new("STATE_FORMAT"))?;
                wire::observe(&mut value, input["since"].as_str(), &["operation"])?;
                return Ok(value);
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn unsupported_receipts_cannot_bypass_their_unimplemented_authority_owner() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("config.json");
        let token = identity::digest(b"test-token").unwrap();
        let config = json!({"version":1,"principals":{"alice":{"tokenHash":token,"repos":{}}},"repositories":{}});
        std::fs::write(&path, config.to_string()).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        let app = Application::open(&root.path().join("state"), &path).unwrap();
        let context = Context::load(&path, "test-token", &app.contract).unwrap();
        let input = json!({"requestId":"legacy-project","policy":"revoked","name":"private"});
        let original = identity::Value::parse(&input.to_string()).unwrap();
        let admission = app
            .admission(
                &context,
                &input,
                &original,
                OperationKind::Project,
                None,
                None,
            )
            .unwrap();
        app.store().unwrap().admit(&admission, |_| Ok(())).unwrap();
        let arguments = json!({"request":{"action":"status","operationId":admission.operation.id}});
        let output = app.call(
            &context,
            "tdev_operation",
            &arguments,
            &identity::Value::Null,
        );
        assert_eq!(output["error"]["code"], "UNSUPPORTED_OPERATION");
        assert_eq!(
            app.store()
                .unwrap()
                .lookup(&context.principal, &admission.request)
                .unwrap()
                .unwrap()
                .status,
            Status::Running
        );
    }
}
