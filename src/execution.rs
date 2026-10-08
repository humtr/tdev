//! Accepted execution's source lifecycle. API admission and SQLite completion remain owners
//! of task authority and pointers; this module only prepares, observes, imports and retires.
use crate::git::{Entry, Git};
use crate::model::{Checkpoint, Digest, Fault, OperationId, Result, SourcePath};
use crate::supervisor::source;
use crate::supervisor::{
    Bound, Capture, Job, Manifest, Observation, Pack, Request, Source, SourceFile, lock_file,
};
use sha2::{Digest as _, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{self, Seek, SeekFrom, Write};
use std::path::Path;
pub(crate) mod api;
pub(crate) mod reset;

fn evidence(error: io::Error) -> Fault {
    error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<Fault>())
        .cloned()
        .unwrap_or_else(|| Fault::new("EXECUTION_EVIDENCE"))
}

struct HashSink<'a> {
    file: &'a mut File,
    hash: Sha256,
    bytes: u64,
}
impl Write for HashSink<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.file.write_all(bytes)?;
        self.hash.update(bytes);
        self.bytes += bytes.len() as u64;
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

/// Immutable source and command binding. An existing reservation is observed, never repaired
/// by reconstructing its mutable work directory or substituting newer Git inputs.
pub fn prepare(
    git: &Git,
    checkpoint: &Checkpoint,
    root: &Path,
    operation: &OperationId,
    mut request: Request,
    capture_paths: Vec<SourcePath>,
    readonly: bool,
) -> Result<Job> {
    if request.source.is_some() {
        return Err(Fault::new("EXECUTION_SOURCE"));
    }
    let path = root.join(operation.as_str());
    if path.try_exists().map_err(evidence)? {
        let job = Job::open(&path).map_err(evidence)?;
        let original = job.request().map_err(evidence)?;
        let binding = original
            .source
            .as_ref()
            .ok_or_else(|| Fault::new("EXECUTION_SOURCE"))?;
        if binding.checkpoint != *checkpoint
            || binding.capture_paths != capture_paths
            || binding.readonly != readonly
        {
            return Err(Fault::new("REQUEST_CONFLICT"));
        }
        request.source = Some(binding.clone());
        if request != original {
            return Err(Fault::new("REQUEST_CONFLICT"));
        }
        match job.read::<Digest>("retired.json") {
            Ok(retired) if retired == job.digest().map_err(evidence)? => (),
            Ok(_) => return Err(Fault::new("EXECUTION_IDENTITY")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                source::input_manifest(&job).map_err(evidence)?;
            }
            Err(error) => return Err(evidence(error)),
        }
        return Ok(job);
    }
    let entries = git.entries(checkpoint)?;
    // Construction is private. Pending operation admission must precede this call.
    let staging = tempfile::tempdir_in(
        root.parent()
            .ok_or_else(|| Fault::new("EXECUTION_SOURCE"))?,
    )
    .map_err(evidence)?;
    let mut files = BTreeMap::new();
    for (path, entry) in entries {
        let mut temporary = tempfile::tempfile().map_err(evidence)?;
        let mut sink = HashSink {
            file: &mut temporary,
            hash: Sha256::new(),
            bytes: 0,
        };
        git.blob_to(&entry.blob, &mut sink)?;
        let file = SourceFile {
            mode: entry.mode,
            bytes: sink.bytes,
            digest: Digest::new(format!("{:x}", sink.hash.finalize()))?,
        };
        temporary.seek(SeekFrom::Start(0)).map_err(evidence)?;
        source::put(staging.path(), &path, entry.mode, &mut temporary).map_err(evidence)?;
        files.insert(path, file);
    }
    let manifest = Manifest {
        checkpoint: checkpoint.clone(),
        files,
    };
    manifest.validate()?;
    let mut pack_file = tempfile::NamedTempFile::new_in(
        root.parent()
            .ok_or_else(|| Fault::new("EXECUTION_SOURCE"))?,
    )
    .map_err(evidence)?;
    let mut sink = HashSink {
        file: pack_file.as_file_mut(),
        hash: Sha256::new(),
        bytes: 0,
    };
    git.source_pack_to(checkpoint, &mut sink)?;
    let pack = Pack {
        bytes: sink.bytes,
        digest: Digest::new(format!("{:x}", sink.hash.finalize()))?,
    };
    pack_file.as_file().sync_all().map_err(evidence)?;
    request.source = Some(Source {
        checkpoint: checkpoint.clone(),
        manifest: manifest.digest().map_err(evidence)?,
        capture_paths,
        readonly,
        pack,
    });
    let job = Job::reserve_prepared(root, operation, request, |job| {
        fs::remove_dir(job.work())?;
        fs::rename(staging.path(), job.work())?;
        fs::rename(pack_file.path(), job.path().join("source.pack"))?;
        source::write_manifest(&job.path().join("source.json"), &manifest)?;
        source::initialize_git(job)?;
        source::initialize_ignore(job, &manifest)?;
        source::ready(job, &manifest)?;
        Ok(())
    })
    .map_err(evidence)?;
    // If another constructor won, require its complete original proof; never replace it.
    source::input_manifest(&job).map_err(evidence)?;
    Ok(job)
}

/// Validation consumes sealed unchanged-source proof without importing test outputs.
pub(crate) fn validation_proof(job: &Job, report: &crate::supervisor::Report) -> Result<()> {
    if job.request().map_err(evidence)?.artifact.is_some() {
        return Err(Fault::new("SOURCE_VALIDATION_REQUIRED"));
    }
    let capture = report
        .capture
        .as_ref()
        .ok_or_else(|| Fault::new("CAPTURE_MISSING"))?;
    let seal: Bound<Capture> = job.read("capture.json").map_err(evidence)?;
    if seal.digest != job.digest().map_err(evidence)? || &seal.value != capture {
        return Err(Fault::new("CAPTURE_IDENTITY"));
    }
    let expected = match capture {
        Capture::Sealed { manifest } => manifest,
        Capture::Rejected { error } => return Err(error.clone()),
    };
    let input = source::input_manifest(job)
        .map_err(evidence)?
        .ok_or_else(|| Fault::new("EXECUTION_SOURCE"))?;
    let manifest =
        source::read_manifest(&job.path().join("capture/manifest.json")).map_err(evidence)?;
    if manifest.digest().map_err(evidence)? != *expected || manifest != input {
        return Err(Fault::new("VALIDATION_SOURCE_CHANGED"));
    }
    Ok(())
}

/// Require original worker/stop/source proof before importing any blob into private Git.
/// The caller subsequently commits this checkpoint with its operation receipt using SQLite CAS.
pub fn checkpoint(git: &Git, job: &Job, operation: &OperationId) -> Result<Checkpoint> {
    if job.request().map_err(evidence)?.artifact.is_some() {
        return Err(Fault::new("ARTIFACT_EXECUTION"));
    }
    if job.path().file_name().and_then(|n| n.to_str()) != Some(operation.as_str()) {
        return Err(Fault::new("EXECUTION_IDENTITY"));
    }
    let gate = lock_file(&job.path().join("capture-import.lock")).map_err(evidence)?;
    gate.lock().map_err(evidence)?;
    let report = match job.observe().map_err(evidence)? {
        Observation::Complete(report) => report,
        _ => return Err(Fault::new("EXECUTION_NOT_STOPPED")),
    };
    let Some(capture) = report.capture else {
        return Err(Fault::new("CAPTURE_MISSING"));
    };
    let seal: Bound<Capture> = job.read("capture.json").map_err(evidence)?;
    if seal.digest != job.digest().map_err(evidence)? || seal.value != capture {
        return Err(Fault::new("CAPTURE_IDENTITY"));
    }
    let expected = match capture {
        Capture::Sealed { manifest } => manifest,
        Capture::Rejected { error } => return Err(error),
    };
    match job.read::<Bound<(Digest, Checkpoint)>>("candidate.json") {
        Ok(candidate)
            if candidate.digest == job.digest().map_err(evidence)?
                && candidate.value.0 == expected =>
        {
            git.retain_commit(&candidate.value.1)?;
            return Ok(candidate.value.1);
        }
        Ok(_) => return Err(Fault::new("CAPTURE_IDENTITY")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => (),
        Err(error) => return Err(evidence(error)),
    }
    let source = job
        .request()
        .map_err(evidence)?
        .source
        .ok_or_else(|| Fault::new("EXECUTION_SOURCE"))?;
    let manifest =
        source::read_manifest(&job.path().join("capture/manifest.json")).map_err(evidence)?;
    if manifest.checkpoint != source.checkpoint || manifest.digest().map_err(evidence)? != expected
    {
        return Err(Fault::new("CAPTURE_IDENTITY"));
    }
    let root = job.path().join("capture/files");
    let mut entries = BTreeMap::new();
    for (path, expected) in manifest.files {
        let mut temporary = tempfile::tempfile().map_err(evidence)?;
        let observed = source::body(&root, &path, Some(&mut temporary))?;
        if observed != expected {
            return Err(Fault::new("CAPTURE_CHANGED"));
        }
        temporary.seek(SeekFrom::Start(0)).map_err(evidence)?;
        let blob = git.hash_blob_file(&temporary)?;
        entries.insert(
            path,
            Entry {
                mode: expected.mode,
                blob,
            },
        );
    }
    let checkpoint = git.capture_entries(&source.checkpoint, &entries, operation)?;
    if !job
        .once(
            "candidate.json",
            &Bound {
                digest: job.digest().map_err(evidence)?,
                value: (expected, &checkpoint),
            },
        )
        .map_err(evidence)?
    {
        return Err(Fault::new("CAPTURE_IDENTITY"));
    }
    Ok(checkpoint)
}

/// Only explicitly stopped jobs may lose payload copies. Results, controls and output survive.
pub fn retire(job: &Job) -> Result<()> {
    if job.request().map_err(evidence)?.artifact.is_some() {
        return Err(Fault::new("ARTIFACT_EXECUTION"));
    }
    let gate = lock_file(&job.path().join("capture-import.lock")).map_err(evidence)?;
    gate.lock().map_err(evidence)?;
    if !matches!(job.observe().map_err(evidence)?, Observation::Complete(_)) {
        return Err(Fault::new("EXECUTION_NOT_STOPPED"));
    }
    let digest = job.digest().map_err(evidence)?;
    if !job.once("retired.json", &digest).map_err(evidence)? {
        let previous: Digest = job.read("retired.json").map_err(evidence)?;
        if previous != digest {
            return Err(Fault::new("EXECUTION_IDENTITY"));
        }
    }
    for name in ["work", "home", "tmp", "config", "cache", "input", "capture"] {
        let path = job.path().join(name);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                fs::remove_dir_all(path).map_err(evidence)?
            }
            Ok(_) => return Err(Fault::new("EXECUTION_COPY_IDENTITY")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => (),
            Err(error) => return Err(evidence(error)),
        }
    }
    for name in ["source.json", "source-ready.json", "source.pack"] {
        match fs::remove_file(job.path().join(name)) {
            Ok(()) => (),
            Err(error) if error.kind() == io::ErrorKind::NotFound => (),
            Err(error) => return Err(evidence(error)),
        }
    }
    File::open(job.path())
        .and_then(|f| f.sync_all())
        .map_err(evidence)?;
    Ok(())
}
