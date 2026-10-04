//! Independent OS-process qualification of the executable's private supervisor role.
//! Python is used only to manufacture a real double fork; no reference worker is invoked.
use std::fs;
use std::os::unix::fs::{PermissionsExt, symlink};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tdev::model::OperationId;
use tdev::supervisor::{Job, OUTPUT_LIMIT, Observation, Outcome, ProcessIdentity, Report, Request};

const EXECUTABLE: &str = env!("CARGO_BIN_EXE_tdev");

struct Fixture {
    _directory: tempfile::TempDir,
    root: PathBuf,
    job: Job,
}

impl Fixture {
    fn new(command: &str, timeout: Option<u64>, budget: u64) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(directory.path()).unwrap().join("spool");
        let job = Job::reserve(
            &root,
            &OperationId::new("test-operation").unwrap(),
            Request {
                command: command.into(),
                cwd: ".".into(),
                timeout_seconds: timeout,
                working_bytes: budget,
            },
        )
        .unwrap();
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
