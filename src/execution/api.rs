//! Public execution uses the task/operation authority and the original supervisor proof.
use super::{checkpoint, evidence, prepare, retire};
use crate::{
    admission::Context,
    application::Application,
    identity,
    model::*,
    storage::{Admitted, source::Receipt},
    supervisor::{Environment, Input, Job, Observation, Outcome, Request},
    wire,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Frozen {
    input: Value,
    identity: String,
    construction: String,
    mode: String,
    checkpoint: Checkpoint,
    request: Request,
    capture_paths: Vec<SourcePath>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    job_digest: Option<Digest>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    validation: Option<Validation>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Validation {
    pub base: Checkpoint,
    pub checkpoint: Checkpoint,
    pub policy: Digest,
    pub timeout_source: String,
    pub candidate: Option<Checkpoint>,
}

pub(crate) fn policy(repo: &crate::admission::Repository) -> Result<Digest> {
    let command = wire::string(&repo.config, "validation")?;
    identity::Value::parse(
        &json!({"command":command,
        "executor":repo.config.get("executor").cloned().unwrap_or(json!({"kind":"native"})),
        "toolingEnvironment":repo.config.get("toolingEnvironment").cloned().unwrap_or(json!({}))})
        .to_string(),
    )?
    .fingerprint()
}

pub(crate) fn validated(receipt: &Receipt) -> Result<Validation> {
    if receipt.operation.kind != OperationKind::Validate
        || receipt.operation.status != Status::Succeeded
        || receipt.operation.effect != Effect::Committed
        || receipt.operation.result.as_ref().is_none_or(|r| {
            r["exitCode"] != 0
                || r["id"] != json!(receipt.operation.id)
                || r["terminal"] != true
                || r.get("captureError").is_some_and(|v| !v.is_null())
                || r["stopped"] != true
                || r["cancelled"] != false
                || r["timedOut"] != false
        })
    {
        return Err(Fault::new("VALIDATION_REQUIRED"));
    }
    let frozen = frozen(receipt)?;
    let validation = frozen
        .validation
        .ok_or_else(|| Fault::new("SOURCE_VALIDATION_REQUIRED"))?;
    if validation.candidate.is_none()
        || frozen.job_digest.is_none()
        || receipt.operation.result.as_ref().unwrap()["checkpoint"] != json!(validation.checkpoint)
        || receipt.operation.result.as_ref().unwrap()["candidate"] != json!(validation.candidate)
    {
        return Err(Fault::new("STATE_FORMAT"));
    }
    Ok(validation)
}

impl Frozen {
    fn source(&self) -> Result<&Checkpoint> {
        match &self.validation {
            Some(validation) => validation
                .candidate
                .as_ref()
                .ok_or_else(|| Fault::new("STATE_FORMAT")),
            None => Ok(&self.checkpoint),
        }
    }
}

// The intent uses the wire-style field name in existing storage queries.
fn frozen(receipt: &Receipt) -> Result<Frozen> {
    let mut value = receipt.intent.clone();
    if let Some(digest) = value.as_object_mut().and_then(|v| v.remove("jobDigest")) {
        value["job_digest"] = digest;
    }
    let frozen: Frozen = serde_json::from_value(value).map_err(|_| Fault::new("STATE_FORMAT"))?;
    let validating = receipt.operation.kind == OperationKind::Validate;
    if frozen.construction
        != if validating {
            "source-validation"
        } else {
            "native-execution"
        }
        || validating != frozen.validation.is_some()
        || (validating && frozen.mode != "command")
        || frozen.validation.as_ref().is_some_and(|v| {
            v.checkpoint != frozen.checkpoint
                || !["request", "repository", "default"].contains(&v.timeout_source.as_str())
        })
        || !["command", "process"].contains(&frozen.mode.as_str())
        || frozen.request.source.is_some()
        || frozen.request.capture != (frozen.mode == "command")
    {
        return Err(Fault::new("STATE_FORMAT"));
    }
    Ok(frozen)
}

fn effect_input(original: &identity::Value) -> identity::Value {
    let mut result = original.clone();
    if let identity::Value::Object(values) = &mut result {
        values.remove(&"waitMs".chars().map(u32::from).collect::<Vec<_>>());
    }
    result
}

pub fn call(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    submit(app, context, input, original, false)
}

pub(crate) fn validate(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    submit(app, context, input, original, true)
}

fn submit(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
    validating: bool,
) -> Result<Value> {
    let original = effect_input(original);
    if let Some(op) = app.replay(
        context,
        input,
        if validating { "validate" } else { "exec" },
        &original,
    )? {
        return wait(app, context, &op.id, input);
    }
    let (task, repo) = app.ready_task(context, wire::string(input, "taskId")?)?;
    if repo
        .config
        .get("executor")
        .is_some_and(|v| v["kind"] != "native")
    {
        return Err(Fault::new("UNSUPPORTED_EXECUTOR"));
    }
    let mode = input["mode"].as_str().unwrap_or("command");
    let mut env: BTreeMap<String, String> = repo
        .config
        .get("toolingEnvironment")
        .map(|v| serde_json::from_value(v.clone()).map_err(|_| Fault::new("CONFIG")))
        .transpose()?
        .unwrap_or_default();
    if let Some(selected) = input.get("env") {
        env.extend(
            serde_json::from_value::<BTreeMap<String, String>>(selected.clone())
                .map_err(|_| Fault::new("ENV"))?,
        );
    }
    crate::supervisor::validate_env(&env).map_err(|_| Fault::new("RESERVED_ENV"))?;
    let checkpoint = Checkpoint::new(wire::string(input, "expected")?)?;
    let environment = if input["environment"] == "fresh" {
        None
    } else {
        Some(Environment::new(&app.root.join("environments"), task.id.clone()).map_err(evidence)?)
    };
    let timeout_source = if input.get("timeout").is_some() {
        "request"
    } else if validating && repo.config.get("validationTimeoutSeconds").is_some() {
        "repository"
    } else {
        "default"
    };
    let request = Request {
        command: wire::string(
            if validating { &repo.config } else { input },
            if validating { "validation" } else { "command" },
        )?
        .into(),
        cwd: input["cwd"].as_str().unwrap_or(".").into(),
        timeout_seconds: input
            .get("timeout")
            .or_else(|| {
                if validating {
                    repo.config.get("validationTimeoutSeconds")
                } else {
                    None
                }
            })
            .map(|v| wire::integer(v, 3600))
            .transpose()?
            .or(if mode == "process" { None } else { Some(300) }),
        working_bytes: context.working_bytes()?,
        stdin: input["stdin"].as_str().unwrap_or("").into(),
        environment,
        source: None,
        capture: mode == "command",
        env,
    };
    request.validate().map_err(evidence)?;
    if request.cwd != "." {
        let cwd = SourcePath::new(&request.cwd)?;
        let prefix = format!("{cwd}/");
        if !app
            .git(&repo)?
            .entries(&checkpoint)?
            .keys()
            .any(|p| p.as_str().starts_with(&prefix))
        {
            return Err(Fault::new("CWD"));
        }
    }
    let capture_paths = input["capturePaths"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|p| SourcePath::new(p.as_str().ok_or_else(|| Fault::new("PATH"))?))
        .collect::<Result<Vec<_>>>()?;
    let mut admission = app.admission(
        context,
        input,
        &original,
        if validating {
            OperationKind::Validate
        } else {
            OperationKind::Exec
        },
        Some(task.id.clone()),
        Some(&task.identity),
    )?;
    let frozen = Frozen {
        input: input.clone(),
        identity: task.identity.clone(),
        construction: if validating {
            "source-validation"
        } else {
            "native-execution"
        }
        .into(),
        mode: mode.into(),
        checkpoint: checkpoint.clone(),
        request: request.clone(),
        capture_paths: capture_paths.clone(),
        job_digest: None,
        validation: if validating {
            Some(Validation {
                base: task.base.clone(),
                checkpoint: checkpoint.clone(),
                policy: policy(&repo)?,
                timeout_source: timeout_source.into(),
                candidate: None,
            })
        } else {
            None
        },
    };
    admission.intent = identity::Value::parse(
        &serde_json::to_string(&frozen).map_err(|_| Fault::new("STATE_FORMAT"))?,
    )?;
    let mut work = None;
    let admitted =
        app.store()?
            .admit_execution(&admission, &task, &checkpoint, mode == "process", || {
                work = app.reserve_execution_work(&admission.operation.id)?;
                if work.is_none() {
                    return Err(Fault::new("OPERATION_BUSY"));
                }
                Ok(())
            })?;
    let operation = match admitted {
        Admitted::Replay(op) => {
            drop(work);
            op
        }
        Admitted::New(op) => {
            let id = op.id.clone();
            if let Err(mut error) = spawn_work(
                app,
                context,
                work.ok_or_else(|| Fault::new("OPERATION_BUSY"))?,
                id.clone(),
                move |app, context| construct(app, context, &id, repo, frozen),
            ) {
                error.operation_id = Some(op.id.clone());
                app.store()?.complete_execution(
                    &op.id,
                    None,
                    Status::Failed,
                    Effect::None,
                    Value::Null,
                    Some(error),
                )?;
            }
            op
        }
    };
    wait(app, context, &operation.id, input)
}

fn spawn_work(
    app: &Application,
    context: &Context,
    work: crate::application::ExecutionWork,
    id: OperationId,
    step: impl FnOnce(&Application, &Context) -> Result<()> + Send + 'static,
) -> Result<()> {
    let app = app.clone();
    let context = context.clone();
    std::thread::Builder::new()
        .name("execution".into())
        .spawn(move || {
            let _work = work;
            if step(&app, &context).is_err() {
                let _ = app.store().and_then(|mut store| {
                    store.execution_observation(&context.principal, &id, false)
                });
            }
        })
        .map(|_| ())
        .map_err(|_| Fault::new("EXECUTION_WORK_UNAVAILABLE"))
}

fn construct(
    app: &Application,
    context: &Context,
    id: &OperationId,
    repo: crate::admission::Repository,
    mut frozen: Frozen,
) -> Result<()> {
    // Only the physical new admission schedules preparation/dispatch. This worker is
    // bounded controller work; actual command lifetime belongs to the independent supervisor.
    let gate = app.operation_work(id)?;
    let _guard = gate.lock().map_err(|_| Fault::new("OPERATION_BUSY"))?;
    match app.git(&repo).and_then(|git| {
        if let Some(validation) = &mut frozen.validation {
            let (task, _) = app.task(context, wire::string(&frozen.input, "taskId")?)?;
            let expected = if task.managed == 1 {
                None
            } else {
                Some(&validation.base)
            };
            if (task.managed == 1 && task.ref_state.as_deref() != Some("reserved"))
                || git.head(&task.branch)?.as_ref() != expected
            {
                return Err(Fault::new("STALE_HEAD"));
            }
            let candidate = git.validation_candidate(
                &validation.checkpoint,
                &validation.base,
                wire::string(&frozen.input, "message")?,
                id,
            )?;
            app.store()?.bind_validation(id, &candidate)?;
            validation.candidate = Some(candidate);
        }
        let source = frozen.source()?.clone();
        prepare(
            &git,
            &source,
            &app.root.join("jobs"),
            id,
            frozen.request,
            frozen.capture_paths,
            frozen.validation.is_some(),
        )
    }) {
        Ok(job) => {
            app.store()?.bind_execution(
                &context.principal,
                id,
                &job.digest().map_err(evidence)?,
            )?;
            let pending = app
                .store()?
                .pending_execution_controls(&context.principal, id)?;
            for receipt in pending {
                let _ = reconcile_control(app, context, &receipt);
            }
            if job
                .launch(&std::env::current_exe().map_err(evidence)?)
                .is_err()
            {
                app.store()?
                    .execution_observation(&context.principal, id, false)?;
            }
        }
        Err(mut error) => {
            error.operation_id = Some(id.clone());
            app.store()?.complete_execution(
                id,
                None,
                Status::Failed,
                Effect::None,
                Value::Null,
                Some(error),
            )?;
        }
    }
    Ok(())
}

fn job(app: &Application, receipt: &Receipt, frozen: &Frozen) -> Result<Job> {
    let job =
        Job::open(&app.root.join("jobs").join(receipt.operation.id.as_str())).map_err(evidence)?;
    if frozen.job_digest.as_ref() != Some(&job.digest().map_err(evidence)?) {
        return Err(Fault::new("EXECUTION_IDENTITY"));
    }
    let original = job.request().map_err(evidence)?;
    let source = original
        .source
        .as_ref()
        .ok_or_else(|| Fault::new("EXECUTION_SOURCE"))?;
    if &source.checkpoint != frozen.source()?
        || source.capture_paths != frozen.capture_paths
        || source.readonly != frozen.validation.is_some()
    {
        return Err(Fault::new("EXECUTION_IDENTITY"));
    }
    let mut request = frozen.request.clone();
    request.source = original.source.clone();
    if request != original {
        return Err(Fault::new("EXECUTION_IDENTITY"));
    }
    Ok(job)
}

pub fn reconcile(app: &Application, context: &Context, receipt: &Receipt) -> Result<Operation> {
    let current = app
        .store()?
        .receipt(
            &context.principal,
            Some(receipt.operation.id.as_str()),
            None,
        )?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    if current.operation.status.is_terminal() || app.execution_pending(&current.operation.id)? {
        return Ok(current.operation);
    }
    let frozen = frozen(&current)?;
    match job(app, &current, &frozen).and_then(|job| job.observe().map_err(evidence)) {
        Ok(Observation::Complete(_)) => {
            if let Some(work) = app.reserve_execution_work(&current.operation.id)? {
                let id = current.operation.id.clone();
                spawn_work(app, context, work, id.clone(), move |app, context| {
                    let receipt = app
                        .store()?
                        .receipt(&context.principal, Some(id.as_str()), None)?
                        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
                    complete(app, context, &receipt).map(|_| ())
                })?;
            }
            Ok(app
                .store()?
                .receipt(
                    &context.principal,
                    Some(current.operation.id.as_str()),
                    None,
                )?
                .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?
                .operation)
        }
        Ok(Observation::Running(_)) => {
            app.store()?
                .execution_observation(&context.principal, &current.operation.id, true)
        }
        _ => app
            .store()?
            .execution_observation(&context.principal, &current.operation.id, false),
    }
}

fn complete(app: &Application, context: &Context, receipt: &Receipt) -> Result<Operation> {
    let gate = app.operation_work(&receipt.operation.id)?;
    let _guard = gate.lock().map_err(|_| Fault::new("OPERATION_BUSY"))?;
    let receipt = app
        .store()?
        .receipt(
            &context.principal,
            Some(receipt.operation.id.as_str()),
            None,
        )?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    if receipt.operation.status.is_terminal() {
        return Ok(receipt.operation);
    }
    let frozen = frozen(&receipt)?;
    let observation = job(app, &receipt, &frozen).and_then(|j| j.observe().map_err(evidence));
    let report = match observation {
        Ok(Observation::Complete(report)) => report,
        Ok(Observation::Running(_)) => {
            return app.store()?.execution_observation(
                &context.principal,
                &receipt.operation.id,
                true,
            );
        }
        _ => {
            return app.store()?.execution_observation(
                &context.principal,
                &receipt.operation.id,
                false,
            );
        }
    };
    let job = job(app, &receipt, &frozen)?;
    let mut captured = None;
    let mut capture_error = None;
    if frozen.validation.is_some()
        && (report.capture.is_some() || report.outcome == Outcome::Exited)
    {
        if let Err(error) = super::validation_proof(&job, &report) {
            capture_error = Some(error);
        }
    } else if frozen.mode == "command" && report.capture.is_some() {
        let (_, repo) = app.task(
            context,
            receipt
                .operation
                .task
                .as_ref()
                .ok_or_else(|| Fault::new("STATE_FORMAT"))?
                .as_str(),
        )?;
        match checkpoint(&app.git(&repo)?, &job, &receipt.operation.id) {
            Ok(value) => captured = Some(value),
            Err(error) => capture_error = Some(error),
        }
    } else if frozen.mode == "command" && report.outcome == Outcome::Exited {
        capture_error = Some(Fault::new("CAPTURE_MISSING"));
    }
    let mut error = capture_error.clone().or_else(|| match report.outcome {
        Outcome::Exited if report.exit_code == Some(0) => None,
        Outcome::Exited => Some(Fault::new("COMMAND_FAILED")),
        Outcome::Cancelled => Some(Fault::new("CANCELLED")),
        Outcome::Deadline => Some(Fault::new("TIMEOUT")),
        Outcome::EnvironmentBusy => Some(Fault::new("ENVIRONMENT_BUSY")),
        Outcome::WorkingBudget | Outcome::DependencyBudget => Some(Fault::message(
            "EXECUTION_LIMIT",
            report.budget.as_ref().map_or_else(
                || "Missing budget evidence".into(),
                |b| {
                    format!(
                        "budget={} configured={} observed={}",
                        b.budget, b.configured, b.observed
                    )
                },
            ),
        )),
    });
    if let Some(error) = &mut error {
        error.effect = Effect::Committed;
        error.operation_id = Some(receipt.operation.id.clone());
    }
    let status = if report.outcome == Outcome::Cancelled {
        Status::Cancelled
    } else if error.is_some() {
        Status::Failed
    } else {
        Status::Succeeded
    };
    let mut result = json!({"id":receipt.operation.id,"terminal":true,"stopped":true,"exitCode":report.exit_code,"checkpoint":captured.as_ref().unwrap_or(&frozen.checkpoint),"candidate":frozen.validation.as_ref().and_then(|v| v.candidate.as_ref()),"cancelled":report.outcome==Outcome::Cancelled,"timedOut":report.outcome==Outcome::Deadline,"discardedBytes":report.discarded_bytes});
    if let Some(error) = capture_error {
        result["captureError"] = json!(error.message);
    }
    app.store()?.complete_execution(
        &receipt.operation.id,
        captured.as_ref(),
        status,
        Effect::Committed,
        result,
        error,
    )
}

pub fn summary(receipt: &Receipt, operation: Operation) -> Result<Value> {
    let mut value = json!(operation);
    if matches!(
        receipt.operation.kind,
        OperationKind::Exec | OperationKind::Validate
    ) {
        let frozen = frozen(receipt)?;
        value["execution"] = json!({"mode":frozen.mode,"checkpoint":frozen.checkpoint,"environment":if frozen.request.environment.is_some(){"task"}else{"fresh"},"timeout":frozen.request.timeout_seconds,"timeoutSource":frozen.validation.as_ref().map(|v|v.timeout_source.as_str()).unwrap_or(if frozen.input.get("timeout").is_some(){"request"}else{"default"})});
    }
    Ok(value)
}

pub fn project(
    app: &Application,
    context: &Context,
    receipt: &Receipt,
    operation: Operation,
    input: &Value,
) -> Result<Value> {
    let mut value = summary(receipt, operation)?;
    if receipt.operation.kind == OperationKind::Operation
        && receipt.intent["input"]["action"] == "stdin"
        && value["result"].is_object()
    {
        let target = app.store()?.receipt(
            &context.principal,
            receipt.intent["input"]["operationId"].as_str(),
            None,
        )?;
        if let Some(target) = target {
            let frozen = frozen(&target)?;
            if let Ok(job) = job(app, &target, &frozen)
                && let Some(delivery) = job
                    .input_delivery(
                        wire::bounded(&receipt.intent["input"], "sequence", 0, 1023)? as u16,
                    )
                    .map_err(evidence)?
            {
                value["result"]["delivery"] = json!(delivery);
            }
        }
    }
    if !matches!(
        receipt.operation.kind,
        OperationKind::Exec | OperationKind::Validate
    ) {
        return Ok(value);
    }
    let frozen = frozen(receipt)?;
    if frozen.job_digest.is_none() {
        return Ok(value);
    }
    let output = (|| -> Result<Value> {
        let job = job(app, receipt, &frozen)?;
        let offset = wire::Offset::new(input.get("offset"))?;
        let available = match job.log_length() {
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => 0,
            Err(e) => return Err(evidence(e)),
        };
        let at = offset.index(available as usize) as u64;
        let data = if available == 0 {
            vec![]
        } else {
            job.log(at, wire::bounded(input, "limit", 24000, 65536)? as usize)
                .map_err(evidence)?
        };
        let mut next = 0;
        let mut deliveries = Vec::new();
        for sequence in 0..1024 {
            let Some(delivery) = job.input_delivery(sequence).map_err(evidence)? else {
                break;
            };
            next = sequence + 1;
            deliveries.push(json!({"sequence":sequence,"delivery":delivery}));
            if deliveries.len() > 16 {
                deliveries.remove(0);
            }
        }
        Ok(
            json!({"offset":offset.original,"nextOffset":offset.plus(data.len())?,"availableBytes":available,"encoding":"base64","data":STANDARD.encode(data),"stdin":{"nextSequence":next,"deliveries":deliveries}}),
        )
    })();
    match output {
        Ok(output) => value["output"] = output,
        Err(error) => value["outputError"] = json!(error),
    }
    Ok(value)
}

fn wait(app: &Application, context: &Context, id: &OperationId, input: &Value) -> Result<Value> {
    let millis = if input["mode"] == "process" {
        0
    } else {
        wire::bounded(input, "waitMs", 0, 30000)?
    };
    let deadline = Instant::now() + Duration::from_millis(millis);
    loop {
        let receipt = app
            .store()?
            .receipt(&context.principal, Some(id.as_str()), None)?
            .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
        app.authorize_receipt(context, &receipt)?;
        let operation = reconcile(app, context, &receipt)?;
        if operation.status.is_terminal() || Instant::now() >= deadline {
            let latest = app
                .store()?
                .receipt(&context.principal, Some(id.as_str()), None)?
                .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
            return project(app, context, &latest, operation, input);
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

pub fn control(
    app: &Application,
    context: &Context,
    input: &Value,
    original: &identity::Value,
) -> Result<Value> {
    if let Some(op) = app.replay(context, input, "operation", original)? {
        return Ok(json!(op));
    }
    let target = app
        .store()?
        .receipt(
            &context.principal,
            Some(wire::string(input, "operationId")?),
            None,
        )?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    app.authorize_receipt(context, &target)?;
    if !matches!(
        target.operation.kind,
        OperationKind::Exec | OperationKind::Validate
    ) {
        return Err(Fault::new("UNSUPPORTED_OPERATION"));
    }
    reconcile(app, context, &target)?;
    let target = app
        .store()?
        .receipt(&context.principal, Some(target.operation.id.as_str()), None)?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    let frozen = frozen(&target)?;
    if input["action"] == "retire" && !target.operation.status.is_terminal() {
        return Err(Fault::new("EXECUTION_NOT_STOPPED"));
    }
    // Validate original proof before retaining a control. Unknown cancellation may record
    // intent, but stdin and retirement require their supervisor-specific stop/input gates.
    if !app.execution_pending(&target.operation.id)? {
        job(app, &target, &frozen)?;
    }
    let mut admission = app.admission(
        context,
        input,
        original,
        OperationKind::Operation,
        target.operation.task.clone(),
        Some(&frozen.identity),
    )?;
    admission.intent = identity::Value::parse(
        &json!({"input":input,"identity":frozen.identity,"construction":"native-control"})
            .to_string(),
    )?;
    let op = match app.store()?.admit(&admission, |db| {
        let count: i64 = db.query_row("SELECT count(*) FROM operation WHERE owner=? AND kind='operation' AND status IN ('running','unknown') AND json_extract(intent,'$.input.operationId')=?",rusqlite::params![context.principal.as_str(),target.operation.id.as_str()],|r|r.get(0)).map_err(|_|Fault::new("STORAGE"))?;
        if count > 64 { return Err(Fault::message("CONTROL_LIMIT",format!("budget=pendingControls configured=64 observed={count}"))); }
        Ok(())
    })? {
        Admitted::New(op) | Admitted::Replay(op) => op,
    };
    let receipt = app
        .store()?
        .receipt(&context.principal, Some(op.id.as_str()), None)?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    Ok(json!(reconcile_control(app, context, &receipt)?))
}

pub fn reconcile_control(
    app: &Application,
    context: &Context,
    receipt: &Receipt,
) -> Result<Operation> {
    let target = app
        .store()?
        .receipt(
            &context.principal,
            Some(wire::string(&receipt.intent["input"], "operationId")?),
            None,
        )?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    app.authorize_receipt(context, &target)?;
    reconcile(app, context, &target)?;
    let gate = app.operation_work(&receipt.operation.id)?;
    let _guard = gate.lock().map_err(|_| Fault::new("OPERATION_BUSY"))?;
    let current = app
        .store()?
        .receipt(
            &context.principal,
            Some(receipt.operation.id.as_str()),
            None,
        )?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    if current.operation.status.is_terminal() {
        return Ok(current.operation);
    }
    let target = app
        .store()?
        .receipt(&context.principal, Some(target.operation.id.as_str()), None)?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    let frozen = frozen(&target)?;
    if frozen.job_digest.is_none() && app.execution_pending(&target.operation.id)? {
        return Ok(current.operation);
    }
    let job = match job(app, &target, &frozen) {
        Ok(job) => job,
        Err(_) => {
            return app.store()?.execution_observation(
                &context.principal,
                &receipt.operation.id,
                false,
            );
        }
    };
    let input = &receipt.intent["input"];
    let result = match wire::string(input, "action")? {
        "stdin" => job
            .enqueue(Input {
                request_id: RequestId::new(&receipt.request)?,
                sequence: wire::bounded(input, "sequence", 0, 1023)? as u16,
                text: wire::string(input, "text")?.into(),
                eof: input["eof"].as_bool().unwrap_or(false),
            })
            .map(|r| json!({"delivery":"queued","nextSequence":r.next_sequence})),
        "cancel" => job.cancel().map(|_| json!({"cancelRequested":true})),
        "retire" => {
            if !reconcile(app, context, &target)?.status.is_terminal() {
                return Err(Fault::new("EXECUTION_NOT_STOPPED"));
            }
            retire(&job)
                .map(|_| json!({"retired":true}))
                .map_err(std::io::Error::other)
        }
        _ => return Err(Fault::new("STATE_FORMAT")),
    };
    match result {
        Ok(result) => app.store()?.finish(
            &receipt.operation.id,
            Status::Succeeded,
            Effect::Committed,
            result,
            None,
            |_, _| Ok(()),
        ),
        // An interrupted external control remains observable and is never inferred
        // absent from an unreadable record. Idempotent spool methods reconcile it.
        Err(error)
            if error
                .get_ref()
                .is_some_and(|e| e.downcast_ref::<Fault>().is_some()) =>
        {
            let mut fault = evidence(error);
            fault.operation_id = Some(receipt.operation.id.clone());
            app.store()?.finish(
                &receipt.operation.id,
                Status::Failed,
                Effect::None,
                Value::Null,
                Some(fault),
                |_, _| Ok(()),
            )
        }
        Err(_) => {
            app.store()?
                .execution_observation(&context.principal, &receipt.operation.id, false)
        }
    }
}
