//! Real Rust supervisor, immutable Git inputs, sealed stopped capture and retirement.
use serde_json::json;
use sha2::{Digest as _, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tdev::artifact::build::{Plan, platform};
use tdev::contract::Contract;
use tdev::execution;
use tdev::git::{FileMode, Git, LocalRepository};
use tdev::model::{BranchRef, Checkpoint, OperationId, SourcePath};
use tdev::supervisor::{Capture, Job, Observation, Report, Request};

const EXECUTABLE: &str = env!("CARGO_BIN_EXE_tdev");

fn build_plan(command: &str) -> Plan {
    let shell = if let Some(prefix) = std::env::var_os("PREFIX") {
        PathBuf::from(prefix).join("bin/sh")
    } else {
        PathBuf::from("/bin/sh")
    };
    let hash = format!(
        "{:x}",
        Sha256::digest(fs::read(fs::canonicalize(shell).unwrap()).unwrap())
    );
    Plan::new(
        &Contract::embedded().unwrap(),
        &json!({"format":1,"kind":"files","inputs":["a"],"dependencies":[],
        "build":{"command":command,"platform":platform(),"tools":[{"name":"sh","sha256":hash}]},
        "exports":["dist"],"target":platform()}),
        64 * 1024 * 1024,
    )
    .unwrap()
}

fn private_build(f: &Fixture, plan: Plan, timeout: u64, budget: u64) -> Job {
    let mut request = f.request(plan.command());
    request.artifact = Some(plan);
    request.timeout_seconds = Some(timeout);
    request.working_bytes = budget;
    execution::prepare(
        &f.store,
        &f.base,
        &f.spool,
        &f.operation,
        request,
        vec![],
        true,
    )
    .unwrap()
}

#[test]
fn private_build_uses_frozen_tools_fresh_inputs_and_scratch_without_source_import() {
    let f = Fixture::new("sha1");
    let job = private_build(
        &f,
        build_plan(
            "test -d \"$TDEV_INPUT_DIR\"; test -d \"$TDEV_BUILD_DIR\"; test -z \"$TDEV_ENV_DIR\"; printf intermediate >\"$TDEV_BUILD_DIR/temporary\"; mkdir dist; printf built >dist/out; printf done",
        ),
        10,
        128 * 1024 * 1024,
    );
    let record: serde_json::Value =
        serde_json::from_slice(&fs::read(job.path().join("request.json")).unwrap()).unwrap();
    assert_eq!(record["format"], 5);
    let before = job.digest().unwrap();
    let report = f.start(&job);
    assert_eq!(report.outcome, tdev::supervisor::Outcome::Exited);
    assert_eq!(report.exit_code, Some(0));
    assert!(report.stopped && report.artifact_error.is_none());
    assert!(matches!(report.capture, Some(Capture::Sealed { .. })));
    assert_eq!(fs::read(job.work().join("dist/out")).unwrap(), b"built");
    assert_eq!(
        fs::read(job.path().join("build/temporary")).unwrap(),
        b"intermediate"
    );
    assert!(job.path().join("inputs").is_dir());
    assert_eq!(job.digest().unwrap(), before);
    assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
    assert_eq!(
        execution::checkpoint(&f.store, &job, &f.operation)
            .unwrap_err()
            .code,
        "ARTIFACT_EXECUTION"
    );
    assert_eq!(
        execution::retire(&job).unwrap_err().code,
        "ARTIFACT_EXECUTION"
    );
}

#[test]
fn private_build_tool_rejection_never_dispatches_a_recipe_child_and_cannot_relaunch() {
    let f = Fixture::new("sha1");
    let plan = build_plan("touch MUST-NOT-BUILD");
    let mut value = serde_json::to_value(&plan).unwrap();
    value["recipe"]["build"]["tools"][0]["sha256"] = json!("a".repeat(64));
    let plan = serde_json::from_value(value).unwrap();
    let job = private_build(&f, plan, 10, 128 * 1024 * 1024);
    let report = f.start(&job);
    assert_eq!(
        report.outcome,
        tdev::supervisor::Outcome::PreparationRejected
    );
    assert!(report.stopped);
    assert_eq!(report.artifact_error.unwrap().code, "ARTIFACT_TOOL_CHANGED");
    assert!(!job.path().join("child-dispatch.json").exists());
    assert!(!job.work().join("MUST-NOT-BUILD").exists());
    assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
}

#[test]
fn private_build_cancel_deadline_source_integrity_and_final_scratch_budget_use_original_proof() {
    for case in 0..4 {
        let f = Fixture::new("sha1");
        let (command, timeout, budget) = match case {
            0 => ("touch MUST-NOT-BUILD", 10, 128 * 1024 * 1024),
            1 => ("exec sleep 60", 1, 128 * 1024 * 1024),
            2 => ("printf changed >a", 10, 128 * 1024 * 1024),
            _ => (
                "dd if=/dev/zero of=\"$TDEV_BUILD_DIR/full\" bs=65536 count=8 2>/dev/null",
                10,
                256 * 1024,
            ),
        };
        let job = private_build(&f, build_plan(command), timeout, budget);
        if case == 0 {
            job.cancel().unwrap();
        }
        let report = f.start(&job);
        assert!(report.stopped);
        match case {
            0 => {
                assert_eq!(report.outcome, tdev::supervisor::Outcome::Cancelled);
                assert!(!job.path().join("child-dispatch.json").exists());
            }
            1 => assert_eq!(report.outcome, tdev::supervisor::Outcome::Deadline),
            2 => assert!(matches!(report.capture, Some(Capture::Rejected { .. }))),
            _ => {
                assert_eq!(report.outcome, tdev::supervisor::Outcome::WorkingBudget);
                assert_eq!(report.budget.unwrap().budget, "workingBytes");
            }
        }
        assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
    }
}

#[test]
fn private_build_plan_cannot_be_relabelled_as_legacy_execution_or_override_environment() {
    let f = Fixture::new("sha1");
    let plan = build_plan("true");
    let job = private_build(&f, plan.clone(), 10, 128 * 1024 * 1024);
    let file = job.path().join("request.json");
    let raw = fs::read(&file).unwrap();
    let mut record: serde_json::Value = serde_json::from_slice(&raw).unwrap();
    record["format"] = json!(4);
    fs::write(&file, record.to_string()).unwrap();
    assert!(Job::open(job.path()).is_err());
    fs::write(&file, &raw).unwrap();
    let mut request = f.request("true");
    request.artifact = Some(plan);
    request.env.insert("PATH".into(), "/foreign".into());
    assert!(Job::reserve(&f.spool, &OperationId::new("bad-build").unwrap(), request).is_err());
    let ordinary = f.request("true");
    let ordinary =
        Job::reserve(&f.spool, &OperationId::new("ordinary").unwrap(), ordinary).unwrap();
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(ordinary.path().join("request.json")).unwrap()).unwrap();
    assert_eq!(value["format"], 4);
    assert!(value["request"].get("artifact").is_none());
    assert!(Job::open(ordinary.path()).is_ok());
}

struct BuildHttps {
    root: tempfile::TempDir,
    child: Child,
    port: u16,
}
impl BuildHttps {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        assert!(
            Command::new("openssl")
                .args([
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-days",
                    "1",
                    "-subj",
                    "/CN=fixture.invalid",
                    "-addext",
                    "subjectAltName=DNS:fixture.invalid",
                    "-keyout",
                    "key.pem",
                    "-out",
                    "cert.pem"
                ])
                .current_dir(root.path())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .unwrap()
                .success()
        );
        let child = Command::new("python")
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/artifact_https.py"
            ))
            .arg(root.path())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let mut fixture = Self {
            root,
            child,
            port: 0,
        };
        let until = Instant::now() + Duration::from_secs(10);
        fixture.port = loop {
            if let Ok(port) = fs::read_to_string(fixture.root.path().join("port"))
                && let Ok(port) = port.parse()
            {
                break port;
            }
            assert!(Instant::now() < until && fixture.child.try_wait().unwrap().is_none());
            std::thread::sleep(Duration::from_millis(20));
        };
        fixture
    }
    fn selected(&self, command: &str, path: &str, size: usize) -> Plan {
        let mut value = serde_json::to_value(build_plan(command)).unwrap();
        value["recipe"]["dependencies"] = json!([{"name":"pkg","url":format!("https://fixture.invalid{path}"),
            "sha256":format!("{:x}",Sha256::digest(vec![b'x';size]))}]);
        serde_json::from_value(value).unwrap()
    }
    fn requests(&self) -> usize {
        fs::read_to_string(self.root.path().join("requests.jsonl"))
            .unwrap_or_default()
            .lines()
            .count()
    }
    fn route_owned_job(&self, job: &Job) {
        // Own-file fixture routing, not a production option. Bind a private native tool
        // directory using the actual identity codec, including its original ready envelope.
        // curl remains the real native client, with only test CA/loopback routing appended.
        let file = job.path().join("request.json");
        let mut record: serde_json::Value =
            serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
        let original = PathBuf::from(record["shell"].as_str().unwrap());
        let tools = job.path().join("tools");
        fs::create_dir(&tools).unwrap();
        fs::copy(fs::canonicalize(&original).unwrap(), tools.join("sh")).unwrap();
        std::os::unix::fs::symlink(original.with_file_name("git"), tools.join("git")).unwrap();
        let quote = |p: &Path| format!("'{}'", p.to_str().unwrap().replace('\'', "'\\''"));
        fs::write(
            tools.join("curl"),
            format!(
                "#!{}\nexec {} \"$@\" --cacert {} --connect-to fixture.invalid:443:127.0.0.1:{}\n",
                original.display(),
                quote(&original.with_file_name("curl")),
                quote(&self.root.path().join("cert.pem")),
                self.port
            ),
        )
        .unwrap();
        fs::set_permissions(tools.join("curl"), fs::Permissions::from_mode(0o700)).unwrap();
        record["shell"] = json!(tools.join("sh"));
        let digest =
            tdev::identity::Value::parse(&json!([record["request"], record["shell"]]).to_string())
                .unwrap()
                .fingerprint()
                .unwrap();
        record["digest"] = json!(digest);
        fs::write(&file, record.to_string()).unwrap();
        let ready = job.path().join("source-ready.json");
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&ready).unwrap()).unwrap();
        value["digest"] = json!(digest);
        fs::write(ready, value.to_string()).unwrap();
        assert_eq!(Job::open(job.path()).unwrap().digest().unwrap(), digest);
    }
}
impl Drop for BuildHttps {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn private_build_acquires_real_https_with_frozen_native_tools_after_parent_environment_is_cleared()
{
    let tls = BuildHttps::new();
    let f = Fixture::new("sha1");
    let plan = tls.selected(
        "test -s \"$TDEV_INPUT_DIR/pkg\"; printf used >out",
        "/chunked/2097152",
        2097152,
    );
    let job = private_build(&f, plan, 15, 128 * 1024 * 1024);
    tls.route_owned_job(&job);
    let report = f.start(&job);
    assert_eq!(report.exit_code, Some(0));
    assert!(report.stopped && report.artifact_error.is_none());
    assert_eq!(
        fs::metadata(job.path().join("inputs/pkg")).unwrap().len(),
        2097152
    );
    assert_eq!(tls.requests(), 1);
    assert_eq!(fs::read(job.work().join("out")).unwrap(), b"used");
    assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
    assert_eq!(tls.requests(), 1);
}

#[test]
fn private_build_inflight_https_cancel_stops_without_recipe_dispatch_or_refetch() {
    let tls = BuildHttps::new();
    let f = Fixture::new("sha1");
    let job = private_build(
        &f,
        tls.selected("touch MUST-NOT-BUILD", "/slow", 1),
        15,
        128 * 1024 * 1024,
    );
    tls.route_owned_job(&job);
    assert!(job.launch(Path::new(EXECUTABLE)).unwrap());
    let until = Instant::now() + Duration::from_secs(10);
    while tls.requests() == 0 {
        assert!(Instant::now() < until);
        std::thread::sleep(Duration::from_millis(20));
    }
    let stopped = Instant::now();
    job.cancel().unwrap();
    let report = f.complete(&job);
    assert_eq!(report.outcome, tdev::supervisor::Outcome::Cancelled);
    assert!(report.stopped);
    assert!(stopped.elapsed() < Duration::from_secs(3));
    assert!(!job.path().join("child-dispatch.json").exists());
    assert!(!job.work().join("MUST-NOT-BUILD").exists());
    assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
    assert_eq!(tls.requests(), 1);
}

#[test]
fn private_build_https_deadline_covers_acquisition_before_recipe_child() {
    let tls = BuildHttps::new();
    let f = Fixture::new("sha1");
    let job = private_build(
        &f,
        tls.selected("touch MUST-NOT-BUILD", "/slow", 1),
        1,
        128 * 1024 * 1024,
    );
    tls.route_owned_job(&job);
    let report = f.start(&job);
    assert_eq!(report.outcome, tdev::supervisor::Outcome::Deadline);
    assert!(report.stopped);
    assert!(!job.path().join("child-dispatch.json").exists());
    assert!(!job.work().join("MUST-NOT-BUILD").exists());
    assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
    assert!(tls.requests() <= 1);
}

#[test]
fn private_build_zero_exit_cannot_hide_changed_acquired_inputs() {
    let tls = BuildHttps::new();
    let f = Fixture::new("sha1");
    let job=private_build(&f,tls.selected("chmod u+w \"$TDEV_INPUT_DIR/pkg\"; printf altered >\"$TDEV_INPUT_DIR/pkg\"; printf PASS","/data/3",3),15,128*1024*1024);
    tls.route_owned_job(&job);
    let report = f.start(&job);
    assert_eq!(report.exit_code, Some(0));
    assert!(report.stopped);
    assert_eq!(
        report.artifact_error.unwrap().code,
        "ARTIFACT_DEPENDENCY_CHANGED"
    );
    assert_eq!(job.log(0, 65536).unwrap(), b"PASS");
    assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
    assert_eq!(tls.requests(), 1);
}

fn git(directory: Option<&Path>, args: &[&str]) -> String {
    let mut command = Command::new("git");
    command
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_AUTHOR_NAME", "Fixture")
        .env("GIT_COMMITTER_NAME", "Fixture")
        .env("GIT_AUTHOR_EMAIL", "fixture@localhost")
        .env("GIT_COMMITTER_EMAIL", "fixture@localhost")
        .env("GIT_AUTHOR_DATE", "2026-01-01T00:00:00Z")
        .env("GIT_COMMITTER_DATE", "2026-01-01T00:00:00Z");
    if let Some(directory) = directory {
        command.current_dir(directory);
    }
    let output = command
        .args(["-c", "core.hooksPath=/dev/null"])
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().into()
}

struct Fixture {
    _root: tempfile::TempDir,
    spool: PathBuf,
    authored: PathBuf,
    store: Git,
    base: Checkpoint,
    operation: OperationId,
}

impl Fixture {
    fn new(format: &str) -> Self {
        let root = tempfile::tempdir().unwrap();
        let authored = root.path().join("authored");
        git(
            None,
            &[
                "init",
                "--template=",
                &format!("--object-format={format}"),
                "-b",
                "main",
                authored.to_str().unwrap(),
            ],
        );
        fs::write(authored.join("a"), b"before\n").unwrap();
        fs::write(authored.join("removed"), b"delete\n").unwrap();
        fs::write(
            authored.join("manifest.json"),
            b"ordinary source filename\n",
        )
        .unwrap();
        fs::write(authored.join(".gitignore"), b"ignored/\n*.cache\n").unwrap();
        fs::create_dir(authored.join("nested")).unwrap();
        fs::write(authored.join("nested/script"), b"original\n").unwrap();
        git(Some(&authored), &["add", "."]);
        git(Some(&authored), &["commit", "-m", "initial"]);
        let base = Checkpoint::new(git(Some(&authored), &["rev-parse", "HEAD"])).unwrap();
        let remote = authored.join(".git");
        let metadata = fs::metadata(&remote).unwrap();
        let enrolled = LocalRepository::new(
            remote,
            format!("local:{}:{}", metadata.dev(), metadata.ino()),
            true,
            BTreeSet::from([BranchRef::new("refs/heads/main").unwrap()]),
            vec![],
        )
        .unwrap();
        let store = Git::open(&root.path().join("objects"), enrolled).unwrap();
        store
            .fetch(&BranchRef::new("refs/heads/main").unwrap(), &base)
            .unwrap();
        Self {
            spool: root.path().join("spool"),
            authored,
            store,
            base,
            operation: OperationId::new("source-job").unwrap(),
            _root: root,
        }
    }

    fn request(&self, command: &str) -> Request {
        Request {
            command: command.into(),
            cwd: ".".into(),
            timeout_seconds: Some(10),
            working_bytes: 2 * 1024 * 1024 * 1024,
            stdin: String::new(),
            environment: None,
            source: None,
            artifact: None,
            capture: true,
            env: Default::default(),
        }
    }

    fn prepare(&self, command: &str) -> Job {
        execution::prepare(
            &self.store,
            &self.base,
            &self.spool,
            &self.operation,
            self.request(command),
            vec![],
            false,
        )
        .unwrap()
    }

    fn complete(&self, job: &Job) -> Report {
        let started = Instant::now();
        let until = started + Duration::from_secs(360);
        let mut peak_kib = 0u64;
        loop {
            match job.observe().unwrap() {
                Observation::Complete(report) => {
                    assert!(
                        peak_kib < 128 * 1024,
                        "Source worker peak unexpectedly exceeded 128 MiB: {peak_kib} KiB"
                    );
                    eprintln!(
                        "source worker: elapsed={:.3}s sampledVmHWM={}KiB",
                        started.elapsed().as_secs_f64(),
                        peak_kib
                    );
                    return report;
                }
                Observation::Running(identity) => {
                    if let Ok(status) = fs::read_to_string(format!("/proc/{}/status", identity.pid))
                        && let Some(value) = status
                            .lines()
                            .find(|line| line.starts_with("VmHWM:"))
                            .and_then(|line| line.split_whitespace().nth(1))
                            .and_then(|n| n.parse::<u64>().ok())
                    {
                        peak_kib = peak_kib.max(value);
                    }
                }
                Observation::Unknown if job.path().join("failure.json").exists() => panic!(
                    "{}",
                    fs::read_to_string(job.path().join("failure.json")).unwrap()
                ),
                _ => (),
            }
            assert!(Instant::now() < until, "execution/capture did not complete");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn start(&self, job: &Job) -> Report {
        assert!(job.launch(Path::new(EXECUTABLE)).unwrap());
        self.complete(job)
    }
}

#[test]
fn stopped_capture_preserves_modes_deletes_links_and_frozen_ignore_in_both_formats() {
    for format in ["sha1", "sha256"] {
        let fixture = Fixture::new(format);
        let original_index = fs::read(fixture.authored.join(".git/index")).unwrap();
        let command = "printf after >a; rm removed; chmod +x nested/script; ln -s nested/script link; mkdir ignored; printf ignored >ignored/output; printf include >explicit.cache; printf hide >ordinary.cache; printf '\n' >.gitignore; printf new >new";
        let job = execution::prepare(
            &fixture.store,
            &fixture.base,
            &fixture.spool,
            &fixture.operation,
            fixture.request(command),
            vec![SourcePath::new("explicit.cache").unwrap()],
            false,
        )
        .unwrap();
        let report = fixture.start(&job);
        assert_eq!(report.exit_code, Some(0));
        assert!(report.stopped && matches!(report.capture, Some(Capture::Sealed { .. })));
        let checkpoint = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap();
        assert_ne!(checkpoint, fixture.base);
        assert!(
            fixture
                .store
                .is_ancestor(&fixture.base, &checkpoint)
                .unwrap()
        );
        let entries = fixture.store.entries(&checkpoint).unwrap();
        assert_eq!(
            fixture
                .store
                .blob(&entries[&SourcePath::new("a").unwrap()].blob)
                .unwrap(),
            b"after"
        );
        assert_eq!(
            entries[&SourcePath::new("nested/script").unwrap()].mode,
            FileMode::Executable
        );
        assert_eq!(
            entries[&SourcePath::new("link").unwrap()].mode,
            FileMode::Symlink
        );
        for absent in ["removed", "ignored/output", "ordinary.cache"] {
            assert!(!entries.contains_key(&SourcePath::new(absent).unwrap()));
        }
        for present in ["new", "explicit.cache", "manifest.json"] {
            assert!(entries.contains_key(&SourcePath::new(present).unwrap()));
        }
        assert_eq!(
            fs::read(fixture.authored.join(".git/index")).unwrap(),
            original_index
        );
        assert_eq!(fs::read(fixture.authored.join("a")).unwrap(), b"before\n");
        assert_eq!(
            execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap(),
            checkpoint
        );
    }
}

#[test]
fn unchanged_source_keeps_checkpoint_and_retirement_keeps_original_receipts() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("printf output");
    let report = fixture.start(&job);
    assert_eq!(
        execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap(),
        fixture.base
    );
    let result = fs::read(job.path().join("result.json")).unwrap();
    let request = fs::read(job.path().join("request.json")).unwrap();
    execution::retire(&job).unwrap();
    execution::retire(&job).unwrap();
    for name in ["work", "input", "capture", "home", "tmp", "cache", "config"] {
        assert!(!job.path().join(name).exists());
    }
    assert_eq!(fs::read(job.path().join("result.json")).unwrap(), result);
    assert_eq!(fs::read(job.path().join("request.json")).unwrap(), request);
    assert_eq!(job.log(0, 65536).unwrap(), b"output");
    assert_eq!(job.observe().unwrap(), Observation::Complete(report));
    assert_eq!(
        execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap(),
        fixture.base
    );
    let replay = fixture.prepare("printf output");
    assert!(!replay.launch(Path::new(EXECUTABLE)).unwrap());
    assert!(!replay.work().exists());
}

#[test]
fn failure_and_deadline_still_capture_only_proved_stopped_bytes() {
    for (command, expected_exit) in [
        ("printf failed-change >a; exit 7", Some(7)),
        ("printf deadline-change >a; sleep 60", None),
    ] {
        let fixture = Fixture::new("sha1");
        let mut request = fixture.request(command);
        request.timeout_seconds = Some(1);
        let job = execution::prepare(
            &fixture.store,
            &fixture.base,
            &fixture.spool,
            &fixture.operation,
            request,
            vec![],
            false,
        )
        .unwrap();
        let report = fixture.start(&job);
        assert_eq!(report.exit_code, expected_exit);
        assert!(report.stopped);
        assert_ne!(
            execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap(),
            fixture.base
        );
    }
}

#[test]
fn descendants_are_stopped_before_capture_seal() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("(sleep 60; printf late >a) & printf early >a");
    fixture.start(&job);
    let checkpoint = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap();
    let entry = &fixture.store.entries(&checkpoint).unwrap()[&SourcePath::new("a").unwrap()];
    assert_eq!(fixture.store.blob(&entry.blob).unwrap(), b"early");
}

#[test]
fn readonly_capture_rejects_tracked_changes_and_preserves_stop_proof() {
    let fixture = Fixture::new("sha1");
    let job = execution::prepare(
        &fixture.store,
        &fixture.base,
        &fixture.spool,
        &fixture.operation,
        fixture.request("printf changed >a; printf new >extra"),
        vec![],
        true,
    )
    .unwrap();
    fixture.start(&job);
    let report = fixture.complete(&job);
    assert!(report.stopped);
    assert_eq!(report.exit_code, Some(0));
    let error = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap_err();
    assert_eq!(error.code, "VALIDATION_SOURCE_CHANGED");
    assert!(!job.path().join("candidate.json").exists());
}

#[test]
fn source_overflow_keeps_stop_proof_and_reports_exact_budget_without_checkpoint() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("truncate -s 536870913 huge");
    let report = fixture.start(&job);
    assert_eq!(report.exit_code, Some(0));
    assert!(report.stopped);
    let error = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap_err();
    assert_eq!(error.code, "CAPTURE_LIMIT");
    assert_eq!(
        error.message,
        "budget=sourceFileBytes configured=536870912 observed=536870913"
    );
    execution::retire(&job).unwrap();
}

#[test]
fn unsafe_symlinks_and_special_files_reject_capture_without_hanging() {
    for command in [
        "ln -s /outside unsafe",
        "ln -s ../outside unsafe",
        "mkfifo special",
    ] {
        let fixture = Fixture::new("sha1");
        let job = fixture.prepare(command);
        let report = fixture.start(&job);
        assert!(report.stopped && matches!(report.capture, Some(Capture::Rejected { .. })));
        assert!(execution::checkpoint(&fixture.store, &job, &fixture.operation).is_err());
    }
}

#[test]
fn dispatch_gap_never_recaptures_rebuilds_relaunches_or_retires() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("printf once >>a");
    assert!(job.launch(Path::new("/missing-executable")).is_err());
    fs::write(job.work().join("a"), b"uncertain mutable bytes").unwrap();
    let replay = fixture.prepare("printf once >>a");
    assert_eq!(
        fs::read(replay.work().join("a")).unwrap(),
        b"uncertain mutable bytes"
    );
    assert!(!replay.launch(Path::new(EXECUTABLE)).unwrap());
    assert_eq!(replay.observe().unwrap(), Observation::Unknown);
    assert!(execution::checkpoint(&fixture.store, &replay, &fixture.operation).is_err());
    assert!(execution::retire(&replay).is_err());
    assert!(!replay.path().join("retired.json").exists());
}

#[test]
fn incomplete_preparation_and_changed_input_cannot_dispatch_or_replace_original() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("true");
    fs::remove_file(job.path().join("source-ready.json")).unwrap();
    let bytes = fs::read(job.path().join("request.json")).unwrap();
    assert!(
        execution::prepare(
            &fixture.store,
            &fixture.base,
            &fixture.spool,
            &fixture.operation,
            fixture.request("true"),
            vec![],
            false
        )
        .is_err()
    );
    assert!(job.launch(Path::new(EXECUTABLE)).is_err());
    assert!(!job.path().join("dispatch.json").exists());
    assert_eq!(fs::read(job.path().join("request.json")).unwrap(), bytes);
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("true");
    fs::write(job.work().join("a"), b"wrong bytes").unwrap();
    assert!(job.launch(Path::new(EXECUTABLE)).is_err());
    assert!(!job.path().join("dispatch.json").exists());
}

#[test]
fn forged_capture_and_wrong_operation_cannot_import() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("printf after >a");
    fixture.start(&job);
    assert!(
        execution::checkpoint(&fixture.store, &job, &OperationId::new("other").unwrap()).is_err()
    );
    fs::write(job.path().join("capture/files/a"), b"wrong").unwrap();
    assert_eq!(
        execution::checkpoint(&fixture.store, &job, &fixture.operation)
            .unwrap_err()
            .code,
        "CAPTURE_CHANGED"
    );
    assert_eq!(fs::read(fixture.authored.join("a")).unwrap(), b"before\n");
}

#[test]
fn single_173_mib_streams_through_capture_checkpoint_and_cleanup() {
    let fixture = Fixture::new("sha256");
    let job = fixture.prepare("truncate -s 181403679 large");
    fixture.start(&job);
    let checkpoint = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap();
    let entries = fixture.store.entries(&checkpoint).unwrap();
    assert_eq!(
        fixture
            .store
            .blob_size(&entries[&SourcePath::new("large").unwrap()].blob)
            .unwrap(),
        181403679
    );
    execution::retire(&job).unwrap();
    assert_eq!(fixture.store.entries(&checkpoint).unwrap(), entries);
    let operation = OperationId::new("retained-large-source").unwrap();
    let next = execution::prepare(
        &fixture.store,
        &checkpoint,
        &fixture.spool,
        &operation,
        fixture.request("true"),
        vec![],
        false,
    )
    .unwrap();
    fixture.start(&next);
    assert_eq!(
        execution::checkpoint(&fixture.store, &next, &operation).unwrap(),
        checkpoint
    );
    execution::retire(&next).unwrap();
}

#[test]
fn concurrent_candidate_imports_return_one_original_checkpoint() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("printf after >a");
    fixture.start(&job);
    let results = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..6)
            .map(|_| {
                scope.spawn(|| {
                    execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap()
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .collect::<Vec<_>>()
    });
    assert!(results.iter().all(|r| r == &results[0]));
    std::thread::sleep(Duration::from_millis(1100));
    assert_eq!(
        execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap(),
        results[0]
    );
}

#[test]
fn seal_without_terminal_worker_proof_is_not_a_checkpoint_or_retirement_authority() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("printf after >a");
    let report = fixture.start(&job);
    // Terminal child/capture proof can be published before the supervisor exits.
    // This case removes that proof from a dead worker, not a still-live worker.
    let until = Instant::now() + Duration::from_secs(360);
    while report.worker.is_live().unwrap() {
        assert!(Instant::now() < until, "terminal supervisor did not exit");
        std::thread::sleep(Duration::from_millis(20));
    }
    fs::remove_file(job.path().join("result.json")).unwrap();
    assert_eq!(job.observe().unwrap(), Observation::Unknown);
    assert!(job.path().join("capture.json").exists());
    assert!(execution::checkpoint(&fixture.store, &job, &fixture.operation).is_err());
    assert!(execution::retire(&job).is_err());
    assert!(!job.launch(Path::new(EXECUTABLE)).unwrap());
}

#[test]
fn replaced_source_directories_and_extra_prelaunch_files_are_rejected() {
    for replace in [true, false] {
        let fixture = Fixture::new("sha1");
        let job = fixture.prepare("true");
        if replace {
            let replacement = job.path().join("replacement");
            fs::rename(job.work(), &replacement).unwrap();
            fs::create_dir(job.work()).unwrap();
            fs::set_permissions(
                job.work(),
                std::os::unix::fs::PermissionsExt::from_mode(0o700),
            )
            .unwrap();
        } else {
            fs::write(job.work().join("extra"), b"not admitted").unwrap();
        }
        assert!(job.launch(Path::new(EXECUTABLE)).is_err());
        assert!(!job.path().join("dispatch.json").exists());
    }
}

#[test]
fn exact_shallow_head_and_index_are_available_without_controller_or_provider_state() {
    for format in ["sha1", "sha256"] {
        let fixture = Fixture::new(format);
        let command = format!(
            "test \"$(git rev-parse HEAD)\" = {} && test \"$(git rev-parse --is-shallow-repository)\" = true && git diff --exit-code && test -z \"$(git status --porcelain)\"",
            fixture.base
        );
        let job = fixture.prepare(&command);
        assert!(job.path().join("source.pack").is_file());
        assert!(!job.path().join("input/a").exists());
        assert!(job.path().join("input/.gitignore").is_file());
        let report = fixture.start(&job);
        assert_eq!(report.exit_code, Some(0));
        assert_eq!(
            execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap(),
            fixture.base
        );
        execution::retire(&job).unwrap();
        assert!(!job.path().join("source.pack").exists());
    }
}

#[test]
fn corrupted_pack_cannot_dispatch_or_replace_frozen_source() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("true");
    let path = job.path().join("source.pack");
    let mut bytes = fs::read(&path).unwrap();
    bytes[20] ^= 1;
    fs::write(&path, bytes).unwrap();
    assert!(job.launch(Path::new(EXECUTABLE)).is_err());
    assert!(!job.path().join("dispatch.json").exists());
}

#[test]
fn many_files_materialize_capture_and_retire_without_body_json() {
    let fixture = Fixture::new("sha1");
    let job = fixture.prepare("i=0; while [ $i -lt 1024 ]; do printf x >file$i; i=$((i+1)); done");
    fixture.start(&job);
    let checkpoint = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap();
    assert_eq!(fixture.store.entries(&checkpoint).unwrap().len(), 1029);
    execution::retire(&job).unwrap();
    let operation = OperationId::new("many-inputs").unwrap();
    let next = execution::prepare(
        &fixture.store,
        &checkpoint,
        &fixture.spool,
        &operation,
        fixture.request("true"),
        vec![],
        false,
    )
    .unwrap();
    fixture.start(&next);
    assert_eq!(
        execution::checkpoint(&fixture.store, &next, &operation).unwrap(),
        checkpoint
    );
    execution::retire(&next).unwrap();
}

#[test]
fn aggregate_512_mib_roundtrips_and_one_byte_growth_preserves_source_boundary() {
    let fixture = Fixture::new("sha256");
    let initial: usize = fixture
        .store
        .entries(&fixture.base)
        .unwrap()
        .values()
        .map(|e| fixture.store.blob_size(&e.blob).unwrap())
        .sum();
    let first = 64 * 1024 * 1024 - initial;
    let command = format!(
        "truncate -s {first} chunk0; i=1; while [ $i -lt 8 ]; do truncate -s 67108864 chunk$i; i=$((i+1)); done"
    );
    let job = fixture.prepare(&command);
    fixture.start(&job);
    let checkpoint = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap();
    let entries = fixture.store.entries(&checkpoint).unwrap();
    let bytes: usize = entries
        .values()
        .map(|e| fixture.store.blob_size(&e.blob).unwrap())
        .sum();
    assert_eq!(bytes, 536870912);
    execution::retire(&job).unwrap();
    let operation = OperationId::new("full-source-growth").unwrap();
    let next = execution::prepare(
        &fixture.store,
        &checkpoint,
        &fixture.spool,
        &operation,
        fixture.request("printf x >>chunk7"),
        vec![],
        false,
    )
    .unwrap();
    let report = fixture.start(&next);
    assert!(report.stopped);
    let error = execution::checkpoint(&fixture.store, &next, &operation).unwrap_err();
    assert_eq!(error.code, "CAPTURE_LIMIT");
    assert_eq!(
        error.message,
        "budget=sourceBytes configured=536870912 observed=536870913"
    );
    assert_eq!(fixture.store.entries(&checkpoint).unwrap(), entries);
    execution::retire(&next).unwrap();
}

#[test]
fn corpus_inputs_materialize_capture_and_cleanup_with_retained_git_evidence() {
    let mut fixture = Fixture::new("sha1");
    let destination = fixture.authored.join("corpus");
    fs::create_dir(&destination).unwrap();
    let mut count = 0usize;
    let mut bytes = 0u64;
    if let Some(source) = std::env::var_os("TDEV_CAPACITY_CORPUS") {
        let source = PathBuf::from(source);
        let mut pending = vec![PathBuf::new()];
        while let Some(relative) = pending.pop() {
            for entry in fs::read_dir(source.join(&relative)).unwrap() {
                let entry = entry.unwrap();
                let path = relative.join(entry.file_name());
                let metadata = fs::symlink_metadata(entry.path()).unwrap();
                if metadata.is_dir() {
                    fs::create_dir(destination.join(&path)).unwrap();
                    pending.push(path);
                } else {
                    assert!(
                        metadata.is_file(),
                        "Corpus evidence must contain regular files"
                    );
                    fs::copy(entry.path(), destination.join(&path)).unwrap();
                    count += 1;
                    bytes += metadata.len();
                }
            }
        }
    } else {
        for index in 0..190 {
            fs::File::create(destination.join(format!("input-{index:03}")))
                .unwrap()
                .set_len(208896)
                .unwrap();
        }
        count = 190;
        bytes = 39690240;
    }
    assert!(count >= 190 && bytes >= 37724943);
    git(Some(&fixture.authored), &["add", "."]);
    git(Some(&fixture.authored), &["commit", "-m", "corpus input"]);
    fixture.base = Checkpoint::new(git(Some(&fixture.authored), &["rev-parse", "HEAD"])).unwrap();
    fixture
        .store
        .fetch(&BranchRef::new("refs/heads/main").unwrap(), &fixture.base)
        .unwrap();
    let job = fixture.prepare("printf captured >a");
    fixture.start(&job);
    let checkpoint = execution::checkpoint(&fixture.store, &job, &fixture.operation).unwrap();
    assert_eq!(fixture.store.entries(&checkpoint).unwrap().len(), count + 5);
    execution::retire(&job).unwrap();
    assert!(
        fixture
            .store
            .is_ancestor(&fixture.base, &checkpoint)
            .unwrap()
    );
    eprintln!("corpus source lifecycle: {count} files / {bytes} bytes");
}
