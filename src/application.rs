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
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, Weak},
};

#[derive(Clone)]
pub struct Application {
    pub contract: Arc<Contract>,
    pub surface: Arc<Surface>,
    pub config: PathBuf,
    pub root: PathBuf,
    store: Arc<Mutex<Store>>,
    operation_work: Arc<Mutex<BTreeMap<OperationId, Weak<Mutex<()>>>>>,
    execution_work: Arc<Mutex<BTreeSet<OperationId>>>,
}
pub(crate) struct ExecutionWork {
    active: Arc<Mutex<BTreeSet<OperationId>>>,
    id: OperationId,
}
impl Drop for ExecutionWork {
    fn drop(&mut self) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(&self.id);
        }
    }
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
            contract: Arc::new(contract),
            surface: Arc::new(surface),
            config: config.into(),
            root: root.into(),
            store: Arc::new(Mutex::new(store)),
            operation_work: Arc::new(Mutex::new(BTreeMap::new())),
            execution_work: Arc::new(Mutex::new(BTreeSet::new())),
        })
    }
    pub(crate) fn store(&self) -> Result<MutexGuard<'_, Store>> {
        self.store.lock().map_err(|_| Fault::new("STORAGE"))
    }
    pub(crate) fn execution_pending(&self, id: &OperationId) -> Result<bool> {
        Ok(self
            .execution_work
            .lock()
            .map_err(|_| Fault::new("EXECUTION_BUSY"))?
            .contains(id))
    }
    pub(crate) fn reserve_execution_work(&self, id: &OperationId) -> Result<Option<ExecutionWork>> {
        let mut active = self
            .execution_work
            .lock()
            .map_err(|_| Fault::new("EXECUTION_BUSY"))?;
        if active.contains(id) {
            return Ok(None);
        }
        if active.len() >= 8 {
            return Err(Fault::message(
                "EXECUTION_BUSY",
                format!(
                    "budget=executionWork configured=8 observed={}",
                    active.len() + 1
                ),
            ));
        }
        active.insert(id.clone());
        Ok(Some(ExecutionWork {
            active: self.execution_work.clone(),
            id: id.clone(),
        }))
    }
    pub(crate) fn context(&self, bearer: &str) -> Result<Context> {
        let context = Context::load(&self.config, bearer, &self.contract)?;
        let projects = self.store()?.projects(&context.principal)?;
        context.enroll(projects)
    }
    pub(crate) fn operation_work(&self, id: &OperationId) -> Result<Arc<Mutex<()>>> {
        let mut work = self
            .operation_work
            .lock()
            .map_err(|_| Fault::new("OPERATION_STATE"))?;
        work.retain(|_, entry| entry.strong_count() > 0);
        let lock = work
            .get(id)
            .and_then(Weak::upgrade)
            .unwrap_or_else(|| Arc::new(Mutex::new(())));
        work.insert(id.clone(), Arc::downgrade(&lock));
        Ok(lock)
    }
    pub(crate) fn git(&self, repo: &Repository) -> Result<Git> {
        // Git construction and identity verification must never hold Store's mutex.
        Git::open(&self.root.join("sources").join(&repo.name), repo.git()?)
    }
    pub(crate) fn task(&self, context: &Context, id: &str) -> Result<(Task, Repository)> {
        let task = self.store()?.task(&context.principal, id)?;
        let repo = Self::authorize_task(context, &task)?;
        Ok((task, repo))
    }
    pub(crate) fn authorize_task(context: &Context, task: &Task) -> Result<Repository> {
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
        Ok(repo)
    }
    pub(crate) fn authorize_receipt(&self, context: &Context, receipt: &Receipt) -> Result<()> {
        let store = self.store()?;
        Self::authorize_retained(context, receipt, &store)
    }
    /// Local authority checks against an already locked, coherent ledger view.
    pub(crate) fn authorize_retained(
        context: &Context,
        receipt: &Receipt,
        store: &Store,
    ) -> Result<()> {
        let task_authority =
            |id: &str| Self::authorize_task(context, &store.task(&context.principal, id)?);
        if receipt.operation.kind == OperationKind::Project {
            context.policy(
                wire::string(&receipt.intent["input"], "policy")?,
                Some(wire::string(&receipt.intent, "authority")?),
            )?;
            return Ok(());
        }
        // Authority belongs to each feature. Do not infer it for receipts whose
        // feature has not been connected to this executable yet.
        if !matches!(
            receipt.operation.kind,
            OperationKind::Workspace
                | OperationKind::Task
                | OperationKind::Edit
                | OperationKind::Exec
                | OperationKind::Validate
                | OperationKind::Publish
                | OperationKind::Operation
        ) {
            return Err(Fault::new("UNSUPPORTED_OPERATION"));
        }
        let expected = match receipt.operation.kind {
            OperationKind::Exec => Some("native-execution"),
            OperationKind::Validate => Some("source-validation"),
            OperationKind::Publish => Some("source-publication"),
            OperationKind::Operation => Some("native-control"),
            OperationKind::Task if receipt.intent["input"]["action"] == "resetEnvironment" => {
                Some("native-environment-reset")
            }
            _ => None,
        };
        if expected.is_some_and(|expected| receipt.intent["construction"] != expected) {
            return Err(Fault::new("UNSUPPORTED_OPERATION"));
        }
        if let Some(task) = &receipt.operation.task {
            task_authority(task.as_str())?;
        }
        if receipt.operation.kind == OperationKind::Task {
            if receipt.intent["input"]["action"] == "integrate" {
                task_authority(wire::string(
                    &receipt.intent["integrationSource"],
                    "taskId",
                )?)?;
            }
            if receipt.intent["input"]["action"] == "compose" {
                for source in receipt.intent["input"]["sources"]
                    .as_array()
                    .ok_or_else(|| Fault::new("STATE_FORMAT"))?
                {
                    task_authority(wire::string(source, "taskId")?)?;
                }
            }
        }
        if receipt.operation.kind == OperationKind::Task
            && receipt.intent["input"]["action"] == "start"
        {
            if let Some(id) = receipt.intent["input"]["fromTaskId"].as_str() {
                task_authority(id)?;
            }
            let resolved = &receipt.intent["resolved"];
            let repo = context.repository(
                wire::string(resolved, "repo")?,
                Some(wire::string(&receipt.intent, "identity")?),
            )?;
            if !repo
                .refs
                .contains(&BranchRef::new(wire::string(resolved, "sourceRef")?)?)
            {
                return Err(Fault::new("PERMISSION_DENIED"));
            }
            let namespace = wire::string(resolved, "namespace")?;
            if receipt.intent["input"]["localChanges"] == true
                && (resolved["checkout"] != repo.config["checkout"]
                    || resolved["checkoutIdentity"] != repo.config["checkoutIdentity"])
            {
                return Err(Fault::new("CHECKOUT_IDENTITY"));
            }
            if !repo.namespaces.iter().any(|ns| ns == namespace)
                || !wire::string(resolved, "ref")?.starts_with(namespace)
            {
                return Err(Fault::new("MANAGED_REF_DENIED"));
            }
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
            store.workspace(&context.principal, id, false)?;
        }
        Ok(())
    }
    pub(crate) fn ready_task(&self, context: &Context, id: &str) -> Result<(Task, Repository)> {
        let (task, repo) = self.task(context, id)?;
        if let Some(busy) = &task.busy {
            let receipt = self
                .store()?
                .receipt(&context.principal, Some(busy.as_str()), None)?
                .ok_or_else(|| Fault::new("STATE_FORMAT"))?;
            if let Err(error) = self.authorize_receipt(context, &receipt) {
                // A retained writer from an unconnected feature stays busy. Task
                // authority permits its summary, not reinterpretation of its effect.
                if error.code == "UNSUPPORTED_OPERATION" {
                    return Ok((task, repo));
                }
                return Err(error);
            }
            self.reconcile(context, &receipt)?;
            self.task(context, id)
        } else {
            Ok((task, repo))
        }
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
            return Ok(Some(self.reconcile(context, &receipt)?));
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
    pub(crate) fn reconcile(&self, context: &Context, receipt: &Receipt) -> Result<Operation> {
        if receipt.operation.kind == OperationKind::Project {
            crate::project::reconcile(self, context, receipt)
        } else if matches!(
            receipt.operation.kind,
            OperationKind::Exec | OperationKind::Validate
        ) {
            crate::execution::api::reconcile(self, context, receipt)
        } else if receipt.operation.kind == OperationKind::Publish {
            crate::source::publication::reconcile(self, context, receipt)
        } else if receipt.operation.kind == OperationKind::Operation {
            crate::execution::api::reconcile_control(self, context, receipt)
        } else if receipt.operation.kind == OperationKind::Task
            && receipt.intent["input"]["action"] == "resetEnvironment"
        {
            crate::execution::reset::reconcile(self, context, receipt)
        } else if receipt.operation.kind == OperationKind::Task
            && receipt.intent["input"]["action"] == "cleanup"
        {
            crate::source::cleanup::reconcile(self, context, receipt)
        } else {
            Ok(receipt.operation.clone())
        }
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
                "tdev_find" => crate::source::continuation::call(self, context, input),
                "tdev_task" => crate::source::task(self, context, input, original),
                "tdev_edit" => crate::source::edit(self, context, input, original),
                "tdev_read" => crate::source::read(self, context, input),
                "tdev_workspace" => crate::workspace::call(self, context, input, original),
                "tdev_project" => crate::project::call(self, context, input, original),
                "tdev_validate" => crate::execution::api::validate(self, context, input, original),
                "tdev_publish" => crate::source::publication::call(self, context, input, original),
                "tdev_exec" => crate::execution::api::call(self, context, input, original),
                "tdev_operation" if input["action"] == "status" => self.status(context, input),
                "tdev_operation" => crate::execution::api::control(self, context, input, original),
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
            let operation = self.reconcile(context, &receipt)?;
            let terminal = operation.status.is_terminal();
            if terminal || std::time::Instant::now() >= deadline {
                let latest = self
                    .store()?
                    .receipt(
                        &context.principal,
                        Some(receipt.operation.id.as_str()),
                        None,
                    )?
                    .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
                let mut value =
                    crate::execution::api::project(self, context, &latest, operation, input)?;
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
    fn revoked_project_receipts_cannot_bypass_their_authority_owner() {
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
        let mut admission = app
            .admission(
                &context,
                &input,
                &original,
                OperationKind::Project,
                None,
                None,
            )
            .unwrap();
        admission.intent =
            identity::Value::parse(&json!({"input":input,"authority":"a".repeat(64)}).to_string())
                .unwrap();
        app.store().unwrap().admit(&admission, |_| Ok(())).unwrap();
        let arguments = json!({"request":{"action":"status","operationId":admission.operation.id}});
        let output = app.call(
            &context,
            "tdev_operation",
            &arguments,
            &identity::Value::Null,
        );
        assert_eq!(output["error"]["code"], "PROJECT_POLICY_DENIED");
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
