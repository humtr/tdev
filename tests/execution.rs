//! Real Rust supervisor, immutable Git inputs, sealed stopped capture and retirement.
use std::collections::BTreeSet;
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};
use tdev::execution;
use tdev::git::{FileMode, Git, LocalRepository};
use tdev::model::{BranchRef, Checkpoint, OperationId, SourcePath};
use tdev::supervisor::{Capture, Job, Observation, Report, Request};

const EXECUTABLE: &str = env!("CARGO_BIN_EXE_tdev");

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
    fixture.start(&job);
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
