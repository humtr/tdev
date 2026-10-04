//! Independent OS-process qualification of the executable's private supervisor role.
//! Python is used only to manufacture a real double fork; no reference worker is invoked.
use std::fs;
use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt, symlink};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tdev::model::{OperationId, RequestId, TaskId};
use tdev::supervisor::{
    DEPENDENCY_LIMIT, Delivery, Environment, Input, Job, OUTPUT_LIMIT, Observation, Outcome,
    ProcessIdentity, Report, Request,
};

const EXECUTABLE: &str = env!("CARGO_BIN_EXE_tdev");

struct Fixture {
    _directory: tempfile::TempDir,
    root: PathBuf,
    job: Job,
}

impl Fixture {
    fn new(command: &str, timeout: Option<u64>, budget: u64) -> Self {
        Self::with_request(Request {
            command: command.into(),
            cwd: ".".into(),
            timeout_seconds: timeout,
            working_bytes: budget,
            stdin: String::new(),
            environment: None,
        })
    }

    fn with_request(request: Request) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(directory.path()).unwrap().join("spool");
        let job =
            Job::reserve(&root, &OperationId::new("test-operation").unwrap(), request).unwrap();
        Self {
            _directory: directory,
            root,
            job,
        }
    }

    fn start(&self) {
        assert!(self.job.launch(Path::new(EXECUTABLE)).unwrap());
    }

    fn complete(&self) -> Report {
        wait(|| match self.job.observe().unwrap() {
            Observation::Complete(report) => Some(report),
            Observation::Unknown if self.job.path().join("failure.json").exists() => {
                panic!(
                    "Worker retained incomplete evidence: {}",
                    fs::read_to_string(self.job.path().join("failure.json")).unwrap()
                );
            }
            _ => None,
        })
    }

    fn worker(&self) -> ProcessIdentity {
        wait(|| match self.job.observe().unwrap() {
            Observation::Running(identity) => Some(identity),
            _ => None,
        })
    }

    fn double_fork(&self) {
        fs::write(
            self.job.work().join("double.py"),
            "import os, time, pathlib, json\n\
             if os.fork(): os._exit(0)\n\
             os.setsid()\n\
             if os.fork(): os._exit(0)\n\
             stat = pathlib.Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()\n\
             pathlib.Path('descendant.json').write_text(json.dumps(dict(pid=os.getpid(), start_ticks=int(stat[19]), boot_id=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip())))\n\
             while True: time.sleep(1)\n",
        )
        .unwrap();
    }

    fn descendant(&self) -> ProcessIdentity {
        wait(|| {
            let bytes = fs::read(self.job.work().join("descendant.json")).ok()?;
            serde_json::from_slice(&bytes).ok()
        })
    }
}

fn input(id: &str, sequence: u16, text: &str, eof: bool) -> Input {
    Input {
        request_id: RequestId::new(id).unwrap(),
        sequence,
        text: text.into(),
        eof,
    }
}

fn command_request(command: &str) -> Request {
    Request {
        command: command.into(),
        ..fixture_request()
    }
}

fn environment(root: &Path, task: &str) -> Environment {
    Environment::new(root, TaskId::new(task).unwrap()).unwrap()
}

fn log_ready(fixture: &Fixture) {
    wait(|| {
        fixture
            .job
            .log(0, 65536)
            .ok()
            .filter(|bytes| bytes.starts_with(b"ready"))
            .map(|_| ())
    });
}

fn private_dir(path: &Path) {
    fs::DirBuilder::new().mode(0o700).create(path).unwrap();
}

fn sparse(path: &Path, length: u64) {
    fs::File::create(path).unwrap().set_len(length).unwrap();
}

#[test]
fn initial_input_then_sequenced_eof_replays_one_pipe_effect() {
    let mut request = command_request("cat");
    request.stdin = "처음🙂\0\n".into();
    let fixture = Fixture::with_request(request);
    let control = input("input-once", 0, "다음🙂\n", true);
    let accepted = fixture.job.enqueue(control.clone()).unwrap();
    assert_eq!(accepted.next_sequence, 1);
    assert_eq!(
        fixture.job.input_delivery(0).unwrap(),
        Some(Delivery::Queued)
    );
    fixture.start();
    assert_eq!(fixture.complete().exit_code, Some(0));
    let fresh = Job::open(fixture.job.path()).unwrap();
    assert_eq!(fresh.enqueue(control.clone()).unwrap(), accepted);
    assert_eq!(fresh.initial_delivery().unwrap(), Delivery::Committed);
    assert_eq!(fresh.input_delivery(0).unwrap(), Some(Delivery::Committed));
    assert_eq!(
        fresh.log(0, 65536).unwrap(),
        "처음🙂\0\n다음🙂\n".as_bytes()
    );
    let mut conflict = control;
    conflict.text.push('!');
    assert!(fresh.enqueue(conflict).is_err());
    assert!(fresh.enqueue(input("other", 0, "other", false)).is_err());
    assert!(fresh.enqueue(input("later", 1, "later", false)).is_err());
    assert!(!fresh.path().join("stdin-1.json").exists());
}

#[test]
fn blocked_initial_input_does_not_starve_output_or_deadline() {
    let mut request = command_request("yes busy");
    request.stdin = "🙂".repeat(65536);
    request.timeout_seconds = Some(1);
    let fixture = Fixture::with_request(request);
    let control = input("after-initial", 0, "later", true);
    fixture.job.enqueue(control.clone()).unwrap();
    fixture.start();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::Deadline);
    assert!(report.stopped);
    assert_eq!(report.retained_bytes, OUTPUT_LIMIT);
    assert_eq!(fixture.job.initial_delivery().unwrap(), Delivery::Unknown);
    assert_eq!(
        fixture.job.input_delivery(0).unwrap(),
        Some(Delivery::Queued)
    );
    assert_eq!(fixture.job.enqueue(control).unwrap().sequence, 0);
}

#[test]
fn partial_input_supervisor_death_retains_unknown_without_resend() {
    let fixture = Fixture::new(
        "IFS= read -r line; printf received > saw; exec sleep 60",
        None,
        128 * 1024 * 1024,
    );
    let text = format!("first\n{}", "🙂".repeat(65530));
    let control = input("partial", 0, &text, false);
    let receipt = fixture.job.enqueue(control.clone()).unwrap();
    fixture.start();
    wait(|| fixture.job.work().join("saw").exists().then_some(()));
    let worker = fixture.worker();
    assert_eq!(
        fixture.job.input_delivery(0).unwrap(),
        Some(Delivery::Unknown)
    );
    signal(&worker, libc::SIGKILL);
    wait(|| (!worker.is_live().unwrap()).then_some(()));
    let fresh = Job::open(fixture.job.path()).unwrap();
    assert_eq!(fresh.observe().unwrap(), Observation::Unknown);
    assert_eq!(fresh.enqueue(control).unwrap(), receipt);
    assert_eq!(fresh.input_delivery(0).unwrap(), Some(Delivery::Unknown));
    assert!(fresh.enqueue(input("new-input", 1, "again", true)).is_err());
    assert!(!fresh.launch(Path::new(EXECUTABLE)).unwrap());
    let mut duplicate = direct_worker(&fresh);
    assert!(duplicate.wait().unwrap().success());
    assert_eq!(
        fs::read(fixture.job.work().join("saw")).unwrap(),
        b"received"
    );
}

#[test]
fn input_admission_rejects_gaps_bounds_eof_and_control_identity_reuse() {
    let fixture = Fixture::new("cat", Some(5), 128 * 1024 * 1024);
    assert!(fixture.job.enqueue(input("gap", 1, "gap", false)).is_err());
    assert!(
        fixture
            .job
            .enqueue(input("too-many", 1024, "x", false))
            .is_err()
    );
    assert!(
        fixture
            .job
            .enqueue(input("too-long", 0, &"x".repeat(65537), false))
            .is_err()
    );
    fixture
        .job
        .enqueue(input("first", 0, "first", false))
        .unwrap();
    assert!(
        fixture
            .job
            .enqueue(input("first", 1, "first", false))
            .is_err()
    );
    fixture.job.enqueue(input("eof", 1, "", true)).unwrap();
    assert!(
        fixture
            .job
            .enqueue(input("closed", 2, "closed", false))
            .is_err()
    );
    // A persistence gap is not repaired into another delivery opportunity.
    fs::remove_file(fixture.job.path().join("stdin-0.json")).unwrap();
    assert!(
        fixture
            .job
            .enqueue(input("replace", 0, "replace", false))
            .is_err()
    );
    assert!(!fixture.job.path().join("stdin-0.json").exists());
}

#[test]
fn concurrent_input_controls_reserve_one_sequence() {
    let fixture = Fixture::new("cat", Some(5), 128 * 1024 * 1024);
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
    let threads: Vec<_> = (0..8)
        .map(|number| {
            let job = fixture.job.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let control = input(
                    &format!("control-{number}"),
                    0,
                    &format!("{number}\n"),
                    true,
                );
                barrier.wait();
                job.enqueue(control.clone())
                    .ok()
                    .map(|receipt| (control, receipt))
            })
        })
        .collect();
    let accepted: Vec<_> = threads
        .into_iter()
        .filter_map(|thread| thread.join().unwrap())
        .collect();
    assert_eq!(accepted.len(), 1);
    let (control, receipt) = &accepted[0];
    fixture.start();
    assert_eq!(fixture.complete().exit_code, Some(0));
    assert_eq!(fixture.job.log(0, 65536).unwrap(), control.text.as_bytes());
    assert_eq!(fixture.job.enqueue(control.clone()).unwrap(), *receipt);
}

#[test]
fn closed_child_pipe_keeps_delivery_unknown_and_corrupt_ack_cannot_commit() {
    let fixture = Fixture::new(
        "exec 0<&-; printf ready; sleep 0.6",
        Some(5),
        128 * 1024 * 1024,
    );
    fixture.start();
    log_ready(&fixture);
    fixture
        .job
        .enqueue(input("closed-pipe", 0, "bytes", true))
        .unwrap();
    assert_eq!(fixture.complete().exit_code, Some(0));
    assert_eq!(
        fixture.job.input_delivery(0).unwrap(),
        Some(Delivery::Unknown)
    );
    fs::write(
        fixture.job.path().join("delivery-0.json"),
        b"{\"delivery\":\"committed\"}",
    )
    .unwrap();
    assert_eq!(
        fixture.job.input_delivery(0).unwrap(),
        Some(Delivery::Unknown)
    );
}

#[test]
fn shared_consumers_keep_one_task_leased_until_all_stop() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let environment = environment(&root, "task");
    let mut request = command_request("printf ready; read -r line");
    request.environment = Some(environment.clone());
    let first = Fixture::with_request(request.clone());
    let second = Fixture::with_request(request);
    first.start();
    second.start();
    log_ready(&first);
    log_ready(&second);
    assert_eq!(
        environment.try_exclusive().err().unwrap().kind(),
        std::io::ErrorKind::WouldBlock
    );
    first.job.cancel().unwrap();
    assert!(first.complete().stopped);
    assert!(environment.try_exclusive().is_err());
    second.job.cancel().unwrap();
    assert!(second.complete().stopped);
    let guard = wait(|| environment.try_exclusive().ok());
    let inode = fs::metadata(root.join(".leases/task")).unwrap().ino();
    fs::remove_dir_all(guard.path()).unwrap();
    private_dir(guard.path());
    assert_eq!(
        fs::metadata(root.join(".leases/task")).unwrap().ino(),
        inode
    );
}

#[test]
fn exclusive_environment_blocks_dispatch_without_fresh_fallback_or_retry() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let environment = environment(&root, "task");
    let guard = environment.try_exclusive().unwrap();
    let mut request = command_request("touch ran");
    request.environment = Some(environment.clone());
    let fixture = Fixture::with_request(request.clone());
    fixture.start();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::EnvironmentBusy);
    assert!(report.stopped);
    assert_eq!(report.exit_code, None);
    assert!(!fixture.job.path().join("child-dispatch.json").exists());
    assert!(!fixture.job.work().join("ran").exists());
    drop(guard);
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
    let new_admission = Fixture::with_request(request);
    new_admission.start();
    assert_eq!(new_admission.complete().exit_code, Some(0));
    assert!(new_admission.job.work().join("ran").exists());
}

#[test]
fn task_caches_and_tool_path_persist_while_home_and_fresh_cache_stay_private() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let environment = environment(&root, "task");
    let guard = environment.try_exclusive().unwrap();
    private_dir(guard.path());
    for name in ["bin", "venv", "venv/bin"] {
        private_dir(&guard.path().join(name));
    }
    let prefix = std::env::var("PREFIX").unwrap_or_else(|_| "/usr".into());
    for (path, message) in [("venv/bin/tool", "venv"), ("bin/tool", "bin")] {
        let path = guard.path().join(path);
        fs::write(&path, format!("#!{prefix}/bin/sh\nprintf '{message}\\n'\n")).unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
    }
    drop(guard);
    let mut request = command_request(
        "tool; printf '%s|%s|%s|%s|%s' \"$TDEV_ENV_DIR\" \"$HOME\" \"$PIP_CACHE_DIR\" \"$npm_config_cache\" \"$XDG_CACHE_HOME\"; printf kept > \"$PIP_CACHE_DIR/sentinel\"",
    );
    request.environment = Some(environment.clone());
    let first = Fixture::with_request(request);
    first.start();
    assert_eq!(first.complete().exit_code, Some(0));
    let log = String::from_utf8(first.job.log(0, 65536).unwrap()).unwrap();
    assert!(log.starts_with("venv\n"));
    assert!(log.contains(&format!("{}/home", first.job.path().display())));
    for cache in ["pip-cache", "npm-cache", "xdg-cache"] {
        assert!(log.contains(&environment.path().join(cache).to_string_lossy().to_string()));
    }
    let mut request = command_request("cat \"$PIP_CACHE_DIR/sentinel\"");
    request.environment = Some(environment.clone());
    let second = Fixture::with_request(request);
    second.start();
    assert_eq!(second.complete().exit_code, Some(0));
    assert_eq!(second.job.log(0, 65536).unwrap(), b"kept");
    let fresh = Fixture::new("env", Some(5), 128 * 1024 * 1024);
    fresh.start();
    assert_eq!(fresh.complete().exit_code, Some(0));
    let log = String::from_utf8(fresh.job.log(0, 65536).unwrap()).unwrap();
    assert!(!log.contains("TDEV_ENV_DIR="));
    assert!(!log.contains("PIP_CACHE_DIR="));
    assert!(log.contains(&format!(
        "XDG_CACHE_HOME={}/cache",
        fresh.job.path().display()
    )));
    let guard = wait(|| environment.try_exclusive().ok());
    fs::remove_dir_all(guard.path()).unwrap();
    // Retained receipts bind environment strings, not its current contents/existence.
    assert_eq!(
        Job::open(first.job.path()).unwrap().observe().unwrap(),
        Observation::Complete(first.complete())
    );
}

#[test]
fn task_ids_ending_in_lock_do_not_collide_with_lease_files() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let first = environment(&root, "task");
    let second = environment(&root, "task.lock");
    let guard = first.try_exclusive().unwrap();
    let mut request = command_request("printf distinct");
    request.environment = Some(second);
    let fixture = Fixture::with_request(request);
    fixture.start();
    assert_eq!(fixture.complete().exit_code, Some(0));
    assert_eq!(fixture.job.log(0, 65536).unwrap(), b"distinct");
    assert!(!guard.path().exists());
}

#[test]
fn dependency_tool_path_separator_is_rejected_before_child_dispatch() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let environment = environment(&root, "task:other");
    let mut request = command_request("touch never");
    request.environment = Some(environment);
    let fixture = Fixture::with_request(request);
    fixture.start();
    wait(|| {
        fixture
            .job
            .path()
            .join("failure.json")
            .exists()
            .then_some(())
    });
    wait(|| matches!(fixture.job.observe().unwrap(), Observation::Unknown).then_some(()));
    assert!(!fixture.job.path().join("child-dispatch.json").exists());
    assert!(!fixture.job.work().join("never").exists());
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
}

#[test]
fn dependency_budget_rejects_preflight_and_fast_exit_growth_separately_from_working() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let environment = environment(&root, "task");
    let guard = environment.try_exclusive().unwrap();
    private_dir(guard.path());
    sparse(&guard.path().join("oversize"), DEPENDENCY_LIMIT + 1);
    drop(guard);
    let mut request = command_request("touch ran");
    request.environment = Some(environment.clone());
    let fixture = Fixture::with_request(request);
    fixture.start();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::DependencyBudget);
    assert!(report.stopped);
    assert_eq!(report.exit_code, None);
    assert!(!fixture.job.path().join("child-dispatch.json").exists());
    let guard = wait(|| environment.try_exclusive().ok());
    fs::remove_file(guard.path().join("oversize")).unwrap();
    drop(guard);
    let mut request = command_request("printf ready; read -r value");
    request.environment = Some(environment.clone());
    let fast = Fixture::with_request(request);
    fast.start();
    log_ready(&fast);
    sparse(&environment.path().join("oversize"), DEPENDENCY_LIMIT + 1);
    fast.job
        .enqueue(input("finish", 0, "finish\n", true))
        .unwrap();
    let report = fast.complete();
    assert_eq!(report.exit_code, Some(0));
    assert_eq!(report.outcome, Outcome::DependencyBudget);
    assert!(report.stopped);
}

#[test]
fn dependency_sampling_stops_a_live_consumer() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let environment = environment(&root, "task");
    let mut request = command_request("printf ready; exec sleep 60");
    request.environment = Some(environment.clone());
    request.timeout_seconds = None;
    let fixture = Fixture::with_request(request);
    fixture.start();
    log_ready(&fixture);
    sparse(&environment.path().join("oversize"), DEPENDENCY_LIMIT + 1);
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::DependencyBudget);
    assert!(report.stopped);
}

#[test]
fn lost_supervisor_releases_kernel_lease_but_never_proves_consumer_stop() {
    let directory = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(directory.path())
        .unwrap()
        .join("dependencies");
    let environment = environment(&root, "task");
    let mut request = command_request("printf ready; exec sleep 60");
    request.environment = Some(environment.clone());
    request.timeout_seconds = None;
    let fixture = Fixture::with_request(request);
    fixture.start();
    log_ready(&fixture);
    let worker = fixture.worker();
    let child: serde_json::Value =
        serde_json::from_slice(&fs::read(fixture.job.path().join("child.json")).unwrap()).unwrap();
    let child: ProcessIdentity = serde_json::from_value(child["value"].clone()).unwrap();
    signal(&worker, libc::SIGKILL);
    wait(|| (!worker.is_live().unwrap()).then_some(()));
    let _kernel_guard = wait(|| environment.try_exclusive().ok());
    assert!(child.is_live().unwrap());
    assert_eq!(fixture.job.observe().unwrap(), Observation::Unknown);
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
    // The guard alone grants no reset; admission must retain this unknown consumer fence.
}

#[test]
fn unsupported_spool_and_linked_dependency_paths_preserve_existing_bytes() {
    let fixture = Fixture::new("touch never", Some(5), 128 * 1024 * 1024);
    let path = fixture.job.path().join("request.json");
    let mut value: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    value["format"] = 1.into();
    let bytes = serde_json::to_vec(&value).unwrap();
    fs::write(&path, &bytes).unwrap();
    assert!(Job::open(fixture.job.path()).is_err());
    assert!(fixture.job.launch(Path::new(EXECUTABLE)).is_err());
    assert_eq!(fs::read(path).unwrap(), bytes);
    assert!(!fixture.job.path().join("dispatch.json").exists());
    let root = fixture.root.parent().unwrap().join("dependencies");
    let environment = environment(&root, "task");
    symlink(fixture.job.work(), environment.path()).unwrap();
    assert!(environment.try_exclusive().is_ok());
    let mut request = command_request("touch never");
    request.environment = Some(environment);
    let rejected = Fixture::with_request(request);
    rejected.start();
    wait(|| {
        rejected
            .job
            .path()
            .join("failure.json")
            .exists()
            .then_some(())
    });
    wait(|| matches!(rejected.job.observe().unwrap(), Observation::Unknown).then_some(()));
    assert!(!rejected.job.path().join("child-dispatch.json").exists());
    assert!(!fixture.job.work().join("never").exists());
}

impl Drop for Fixture {
    fn drop(&mut self) {
        // Preserve the directory until consumers stop, including assertion failure paths.
        let _ = self.job.cancel();
        let deadline = Instant::now() + Duration::from_secs(7);
        while Instant::now() < deadline {
            if !matches!(self.job.observe(), Ok(Observation::Running(_))) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        for path in [
            self.job.path().join("child.json"),
            self.job.path().join("worker.json"),
            self.job.work().join("descendant.json"),
        ] {
            if let Ok(bytes) = fs::read(path) {
                let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_default();
                let identity = value.get("value").unwrap_or(&value);
                if let Ok(identity) = serde_json::from_value::<ProcessIdentity>(identity.clone()) {
                    signal(&identity, libc::SIGKILL);
                }
            }
        }
    }
}

fn wait<T>(mut observation: impl FnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(12);
    loop {
        if let Some(value) = observation() {
            return value;
        }
        assert!(
            Instant::now() < deadline,
            "Timed out waiting for actual process evidence"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn signal(identity: &ProcessIdentity, signal: i32) {
    if identity.is_live().unwrap_or(false) {
        // SAFETY: this fixture's positive PID/start/boot identity was just checked.
        unsafe { libc::kill(identity.pid as i32, signal) };
    }
}

fn python() -> String {
    let prefix = std::env::var("PREFIX").unwrap_or_else(|_| "/usr".into());
    format!("'{prefix}/bin/python' double.py")
}

fn direct_worker(job: &Job) -> Child {
    let mut command = Command::new(EXECUTABLE);
    command.args(["supervise", "--job"]).arg(job.path());
    for key in [
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "SSH_AUTH_SOCK",
        "HTTPS_PROXY",
        "TUNNEL_TOKEN",
    ] {
        command.env(key, "fixture-secret");
    }
    command.env("HOME", "/fixture/credential-home");
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());
    command.spawn().unwrap()
}

#[test]
fn executes_once_with_private_environment_and_does_not_parse_stdout() {
    let fixture = Fixture::new(
        "printf '%s\\n' '{\"stopped\":true,\"exit_code\":0}' ; env; grep NoNewPrivs /proc/self/status; exit 7",
        Some(5),
        128 * 1024 * 1024,
    );
    // Manufacture only the dispatch gap; the actual worker then starts with secret-bearing
    // controller environment to exercise the child environment boundary independently.
    assert!(
        fixture
            .job
            .launch(Path::new("/does-not-exist/tdev"))
            .is_err()
    );
    let mut worker = direct_worker(&fixture.job);
    let report = fixture.complete();
    assert!(worker.wait().unwrap().success());
    assert!(report.stopped);
    assert_eq!(report.outcome, Outcome::Exited);
    assert_eq!(report.exit_code, Some(7));
    let bytes = fixture.job.log(0, 65536).unwrap();
    let text = String::from_utf8(bytes).unwrap();
    assert!(text.contains("{\"stopped\":true,\"exit_code\":0}"));
    assert!(text.contains(&format!("HOME={}/home", fixture.job.path().display())));
    assert!(text.contains("GIT_CONFIG_GLOBAL=/dev/null"));
    assert!(text.contains("NoNewPrivs:\t1"));
    assert!(!text.contains("fixture-secret"));
    assert!(!text.contains("credential-home"));
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
    let mut duplicate = direct_worker(&fixture.job);
    assert!(duplicate.wait().unwrap().success());
    assert_eq!(fixture.complete(), report);
    assert_eq!(fixture.job.log(u64::MAX, 10).unwrap(), b"");
}

#[test]
fn dispatch_gap_and_dead_claim_never_authorize_relaunch() {
    let fixture = Fixture::new("touch duplicate", Some(5), 128 * 1024 * 1024);
    assert_eq!(fixture.job.observe().unwrap(), Observation::Reserved);
    assert!(
        fixture
            .job
            .launch(Path::new("/does-not-exist/tdev"))
            .is_err()
    );
    assert_eq!(fixture.job.observe().unwrap(), Observation::Unknown);
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
    fs::write(fixture.job.path().join("claim.json"), b"partial claim").unwrap();
    let mut worker = direct_worker(&fixture.job);
    assert!(worker.wait().unwrap().success());
    assert_eq!(fixture.job.observe().unwrap(), Observation::Unknown);
    assert!(!fixture.job.work().join("duplicate").exists());
}

#[test]
fn simultaneous_launches_dispatch_one_effect() {
    let fixture = Fixture::new("printf once >> effect", Some(5), 128 * 1024 * 1024);
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
    let threads: Vec<_> = (0..8)
        .map(|_| {
            let job = fixture.job.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                job.launch(Path::new(EXECUTABLE))
            })
        })
        .collect();
    let launched = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .filter(|result| matches!(result, Ok(true)))
        .count();
    assert_eq!(launched, 1);
    assert_eq!(fixture.complete().exit_code, Some(0));
    assert_eq!(
        fs::read(fixture.job.work().join("effect")).unwrap(),
        b"once"
    );
}

#[test]
fn frozen_input_conflict_and_corrupt_reservations_preserve_original() {
    let fixture = Fixture::new("printf original", Some(5), 128 * 1024 * 1024);
    let operation = OperationId::new("test-operation").unwrap();
    let original = fixture.job.request().unwrap();
    let replay = Job::reserve(&fixture.root, &operation, original.clone()).unwrap();
    assert_eq!(replay.digest().unwrap(), fixture.job.digest().unwrap());
    let mut changed = original;
    changed.working_bytes *= 2;
    assert!(Job::reserve(&fixture.root, &operation, changed).is_err());
    fs::write(fixture.job.path().join("request.json"), b"{}").unwrap();
    assert!(Job::open(fixture.job.path()).is_err());
    assert!(Job::reserve(&fixture.root, &operation, fixture_request()).is_err());
}

fn fixture_request() -> Request {
    Request {
        command: "printf original".into(),
        cwd: ".".into(),
        timeout_seconds: Some(5),
        working_bytes: 128 * 1024 * 1024,
        stdin: String::new(),
        environment: None,
    }
}

#[test]
fn rejects_linked_or_nonprivate_spool_and_escaping_cwd() {
    let fixture = Fixture::new("printf safe", Some(5), 128 * 1024 * 1024);
    let linked = fixture.root.parent().unwrap().join("linked");
    symlink(fixture.job.path(), &linked).unwrap();
    assert!(Job::open(&linked).is_err());
    fs::set_permissions(fixture.job.path(), fs::Permissions::from_mode(0o755)).unwrap();
    assert!(Job::open(fixture.job.path()).is_err());
    fs::set_permissions(fixture.job.path(), fs::Permissions::from_mode(0o700)).unwrap();
    let mut request = fixture_request();
    request.cwd = "../home".into();
    assert!(Job::reserve(&fixture.root, &OperationId::new("other").unwrap(), request).is_err());
    let foreign = fixture.root.parent().unwrap().join("foreign");
    fs::write(&foreign, b"foreign bytes").unwrap();
    symlink(&foreign, fixture.job.path().join("dispatch.json")).unwrap();
    assert!(fixture.job.launch(Path::new(EXECUTABLE)).is_err());
    assert_eq!(fs::read(&foreign).unwrap(), b"foreign bytes");
}

#[test]
fn controller_sigkill_does_not_stop_worker_or_repeat_effect() {
    let fixture = Fixture::new(
        "sleep 1; printf once >> effect; printf completed",
        Some(5),
        128 * 1024 * 1024,
    );
    assert!(
        fixture
            .job
            .launch(Path::new("/does-not-exist/tdev"))
            .is_err()
    );
    // An actual separate launcher/controller process owns a detached worker. Killing the
    // launcher leaves the worker alive; a fresh observer reads the same durable job.
    let prefix = std::env::var("PREFIX").unwrap_or_else(|_| "/usr".into());
    let mut controller = Command::new(format!("{prefix}/bin/sh"))
        .arg("-c")
        .arg("\"$1\" supervise --job \"$2\" & wait")
        .arg("fixture-controller")
        .arg(EXECUTABLE)
        .arg(fixture.job.path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let worker = fixture.worker();
    controller.kill().unwrap();
    controller.wait().unwrap();
    assert!(worker.is_live().unwrap());
    let fresh = Job::open(fixture.job.path()).unwrap();
    assert!(!fresh.launch(Path::new(EXECUTABLE)).unwrap());
    let report = fixture.complete();
    assert_eq!(report.exit_code, Some(0));
    assert_eq!(
        fs::read(fixture.job.work().join("effect")).unwrap(),
        b"once"
    );
    assert_eq!(fresh.log(0, 65536).unwrap(), b"completed");
}

#[test]
fn bounded_output_remains_drained_and_deadline_is_not_starved() {
    let fixture = Fixture::new("yes x", Some(1), 128 * 1024 * 1024);
    fixture.start();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::Deadline);
    assert!(report.stopped);
    assert_eq!(report.retained_bytes, OUTPUT_LIMIT);
    assert!(report.discarded_bytes > 0);
    assert_eq!(
        fs::metadata(fixture.job.path().join("output.bin"))
            .unwrap()
            .len(),
        OUTPUT_LIMIT
    );
    assert_eq!(fixture.job.log(OUTPUT_LIMIT - 2, 65536).unwrap().len(), 2);
}

#[test]
fn working_storage_is_checked_after_fast_exit() {
    let fixture = Fixture::new("printf 12345678 > a; printf 12345678 > b", Some(5), 10);
    fixture.start();
    let report = fixture.complete();
    assert!(report.stopped);
    assert_eq!(report.exit_code, Some(0));
    assert_eq!(report.outcome, Outcome::WorkingBudget);
}

#[test]
fn sampled_working_budget_stops_a_live_command_and_child_file_limits_apply() {
    let fixture = Fixture::new(
        "printf 12345678 > a; printf 12345678 > b; exec sleep 30",
        Some(5),
        10,
    );
    fixture.start();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::WorkingBudget);
    assert!(report.stopped);
    let limited = Fixture::new("head -c 100000 /dev/zero > big", Some(5), 1024);
    limited.start();
    let report = limited.complete();
    assert!(report.stopped);
    assert_ne!(report.exit_code, Some(0));
    assert!(fs::metadata(limited.job.work().join("big")).unwrap().len() <= 1024);
}

#[test]
fn replay_survives_removed_cwd_and_frozen_shell_ignores_worker_environment() {
    let fixture = Fixture::new(
        "printf stable; cd ..; rmdir work",
        Some(5),
        128 * 1024 * 1024,
    );
    assert!(
        fixture
            .job
            .launch(Path::new("/does-not-exist/tdev"))
            .is_err()
    );
    let mut worker = Command::new(EXECUTABLE)
        .args(["supervise", "--job"])
        .arg(fixture.job.path())
        .env("PREFIX", "/does-not-exist")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let report = fixture.complete();
    assert!(worker.wait().unwrap().success());
    assert_eq!(report.exit_code, Some(0));
    assert!(!fixture.job.work().exists());
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
    assert_eq!(fixture.job.log(0, 65536).unwrap(), b"stable");
}

#[test]
fn exited_shell_double_fork_children_are_stopped_and_reaped() {
    let fixture = Fixture::new(
        &format!(
            "{}; while [ ! -f descendant.json ]; do sleep 0.01; done",
            python()
        ),
        Some(5),
        128 * 1024 * 1024,
    );
    fixture.double_fork();
    fixture.start();
    let descendant = fixture.descendant();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::Exited);
    assert!(report.stopped);
    assert!(!descendant.is_live().unwrap());
    assert!(
        !Path::new(&format!("/proc/{}", descendant.pid)).exists(),
        "Adopted child was not reaped"
    );
}

#[test]
fn cancel_stops_detached_double_fork_without_affecting_other_job() {
    let fixture = Fixture::new(
        &format!("{}; while :; do sleep 1; done", python()),
        None,
        128 * 1024 * 1024,
    );
    let unrelated = Fixture::new(
        "i=0; while [ \"$i\" -lt 64 ]; do true & i=$((i+1)); done; wait; sleep 0.5; printf unaffected",
        Some(5),
        128 * 1024 * 1024,
    );
    fixture.double_fork();
    fixture.start();
    unrelated.start();
    let descendant = fixture.descendant();
    fixture.job.cancel().unwrap();
    fixture.job.cancel().unwrap();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::Cancelled);
    assert!(report.stopped);
    assert!(!descendant.is_live().unwrap());
    assert_eq!(unrelated.complete().exit_code, Some(0));
    assert_eq!(unrelated.job.log(0, 65536).unwrap(), b"unaffected");
}

#[test]
fn supervisor_sigkill_keeps_unknown_and_preserves_live_descendant() {
    let fixture = Fixture::new(
        &format!("{}; exec sleep 60", python()),
        None,
        128 * 1024 * 1024,
    );
    fixture.double_fork();
    fixture.start();
    let descendant = fixture.descendant();
    let worker = fixture.worker();
    signal(&worker, libc::SIGKILL);
    wait(|| (!worker.is_live().unwrap()).then_some(()));
    assert!(descendant.is_live().unwrap());
    assert_eq!(fixture.job.observe().unwrap(), Observation::Unknown);
    fixture.job.cancel().unwrap();
    assert_eq!(fixture.job.observe().unwrap(), Observation::Unknown);
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
    let mut duplicate = direct_worker(&fixture.job);
    assert!(duplicate.wait().unwrap().success());
    assert!(descendant.is_live().unwrap());
    // Only the fixture owner performs explicit recovery; product observation/cancel does
    // not invent stop proof or adopt possibly live bytes after losing its supervisor.
    signal(&descendant, libc::SIGKILL);
    wait(|| (!descendant.is_live().unwrap()).then_some(()));
}

#[test]
fn identity_requires_start_ticks_and_boot_id() {
    let fixture = Fixture::new("sleep 5", None, 128 * 1024 * 1024);
    fixture.start();
    let identity = fixture.worker();
    assert!(identity.is_live().unwrap());
    let mut stale = identity.clone();
    stale.start_ticks += 1;
    assert!(!stale.is_live().unwrap());
    stale = identity;
    stale.boot_id = "00000000-0000-0000-0000-000000000000".into();
    assert!(!stale.is_live().unwrap());
    fixture.job.cancel().unwrap();
    assert_eq!(fixture.complete().outcome, Outcome::Cancelled);
}

#[test]
fn cancellation_before_dispatch_proves_no_child_and_terminal_evidence_is_bound() {
    let fixture = Fixture::new("touch never", Some(5), 128 * 1024 * 1024);
    fixture.job.cancel().unwrap();
    fixture.start();
    let report = fixture.complete();
    assert_eq!(report.outcome, Outcome::Cancelled);
    assert!(report.stopped);
    assert_eq!(report.exit_code, None);
    assert!(!fixture.job.path().join("child-dispatch.json").exists());
    assert!(!fixture.job.work().join("never").exists());
    let mut corrupted = report;
    corrupted.worker.start_ticks += 1;
    fs::write(
        fixture.job.path().join("result.json"),
        serde_json::to_vec(&corrupted).unwrap(),
    )
    .unwrap();
    assert_eq!(fixture.job.observe().unwrap(), Observation::Unknown);
    assert!(!fixture.job.launch(Path::new(EXECUTABLE)).unwrap());
}
