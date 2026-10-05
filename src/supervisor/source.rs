//! Frozen source bodies and stopped capture. No task pointers or API authority live here.
use super::Job;
use super::spool::{Bound, checked_directory, fingerprint};
use crate::git::{
    FileMode, capacity,
    checkout::{open_at, safe_link},
};
use crate::model::{Checkpoint, Digest, Fault, Result, SourcePath};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

const METADATA_LIMIT: u64 = capacity::METADATA_BYTES as u64;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub checkpoint: Checkpoint,
    pub manifest: Digest,
    pub capture_paths: Vec<SourcePath>,
    pub readonly: bool,
    pub pack: Pack,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Pack {
    pub bytes: u64,
    pub digest: Digest,
}

impl Source {
    pub(super) fn validate(&self) -> io::Result<()> {
        if self.pack.bytes == 0
            || self.pack.bytes > capacity::PACK_BYTES as u64
            || self.capture_paths.len() > 64
        {
            return Err(io::Error::other("Invalid frozen capture paths"));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceFile {
    pub mode: FileMode,
    pub bytes: u64,
    pub digest: Digest,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub checkpoint: Checkpoint,
    pub files: BTreeMap<SourcePath, SourceFile>,
}

impl Manifest {
    pub fn digest(&self) -> io::Result<Digest> {
        self.validate().map_err(as_io)?;
        fingerprint(self)
    }

    pub(crate) fn validate(&self) -> Result<()> {
        capacity::check(
            "CAPTURE_LIMIT",
            "sourceFiles",
            capacity::SOURCE_FILES,
            self.files.len(),
        )?;
        let mut total = 0usize;
        let names: BTreeSet<_> = self.files.keys().map(SourcePath::as_str).collect();
        for (path, file) in &self.files {
            let bytes = usize::try_from(file.bytes).unwrap_or(usize::MAX);
            capacity::check(
                "CAPTURE_LIMIT",
                "sourceFileBytes",
                capacity::FILE_BYTES,
                bytes,
            )?;
            total = total.saturating_add(bytes);
            capacity::check(
                "CAPTURE_LIMIT",
                "sourceBytes",
                capacity::SOURCE_BYTES,
                total,
            )?;
            for (index, _) in path.as_str().match_indices('/') {
                if names.contains(&path.as_str()[..index]) {
                    return Err(Fault::new("CAPTURE_PATH_COLLISION"));
                }
            }
        }
        let mut count = MetadataSize { observed: 0 };
        if serde_json::to_writer(&mut count, self).is_err() {
            return Err(Fault::message(
                "CAPTURE_LIMIT",
                format!(
                    "budget=sourceMetadataBytes configured={METADATA_LIMIT} observed={}",
                    count.observed
                ),
            ));
        }
        Ok(())
    }
}

struct MetadataSize {
    observed: u64,
}
impl Write for MetadataSize {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.observed = self.observed.saturating_add(bytes.len() as u64);
        if self.observed > METADATA_LIMIT {
            return Err(io::Error::other("Source metadata budget"));
        }
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase", deny_unknown_fields)]
pub enum Capture {
    Sealed { manifest: Digest },
    Rejected { error: Fault },
}

fn io_fault(error: io::Error) -> Fault {
    error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<Fault>())
        .cloned()
        .unwrap_or_else(|| Fault::new("CAPTURE_CHANGED"))
}

fn as_io(error: Fault) -> io::Error {
    io::Error::other(error)
}

pub(crate) fn read_manifest(path: &Path) -> io::Result<Manifest> {
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)?;
    if !file.metadata()?.is_file() {
        return Err(io::Error::other("Source metadata type"));
    }
    let observed = file.metadata()?.len();
    if observed > METADATA_LIMIT {
        return Err(as_io(Fault::message(
            "CAPTURE_LIMIT",
            format!("budget=sourceMetadataBytes configured={METADATA_LIMIT} observed={observed}"),
        )));
    }
    let manifest: Manifest =
        serde_json::from_reader(file.take(METADATA_LIMIT + 1)).map_err(io::Error::other)?;
    manifest.validate().map_err(as_io)?;
    Ok(manifest)
}

pub(crate) fn write_manifest(path: &Path, manifest: &Manifest) -> io::Result<()> {
    manifest.validate().map_err(as_io)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)?;
    serde_json::to_writer(&mut file, manifest).map_err(io::Error::other)?;
    if file.metadata()?.len() > METADATA_LIMIT {
        return Err(io::Error::other("Source metadata budget exceeded"));
    }
    file.flush()?;
    file.sync_all()
}

type Signature = (u64, u64, u32, u64, i64, i64, i64, i64);
fn signature(m: &fs::Metadata) -> Signature {
    (
        m.dev(),
        m.ino(),
        m.mode(),
        m.len(),
        m.mtime(),
        m.mtime_nsec(),
        m.ctime(),
        m.ctime_nsec(),
    )
}

fn root_file(root: &Path) -> Result<File> {
    if fs::canonicalize(root).map_err(io_fault)? != root {
        return Err(Fault::new("CAPTURE_IDENTITY"));
    }
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW)
        .open(root)
        .map_err(io_fault)
}

fn parent(root: &File, path: &SourcePath) -> Result<(File, String)> {
    let mut directory = root.try_clone().map_err(io_fault)?;
    let mut parts = path.as_str().split('/').peekable();
    while let Some(part) = parts.next() {
        if parts.peek().is_none() {
            return Ok((directory, part.into()));
        }
        directory =
            open_at(&directory, part, libc::O_RDONLY | libc::O_DIRECTORY).map_err(io_fault)?;
    }
    Err(Fault::new("PATH"))
}

/// Copy from a no-follow descriptor into owned bytes; never reread the pathname to import it.
pub(crate) fn body(
    root: &Path,
    path: &SourcePath,
    sink: Option<&mut dyn Write>,
) -> Result<SourceFile> {
    body_until(root, path, sink, Instant::now() + Duration::from_secs(300))
}

fn deadline(until: Instant) -> Result<()> {
    if Instant::now() >= until {
        return Err(Fault::new("CAPTURE_DEADLINE"));
    }
    Ok(())
}

fn body_until(
    root: &Path,
    path: &SourcePath,
    mut sink: Option<&mut dyn Write>,
    until: Instant,
) -> Result<SourceFile> {
    deadline(until)?;
    let root = root_file(root)?;
    let (directory, name) = parent(&root, path)?;
    let leaf = open_at(&directory, &name, libc::O_PATH).map_err(io_fault)?;
    let before = leaf.metadata().map_err(io_fault)?;
    let mut hash = Sha256::new();
    let (bytes, mode) = if before.file_type().is_symlink() {
        let target = fs::read_link(format!("/proc/self/fd/{}/{}", directory.as_raw_fd(), name))
            .map_err(io_fault)?;
        let target = target
            .to_str()
            .ok_or_else(|| Fault::new("CAPTURE_SYMLINK"))?;
        safe_link(path, target)?;
        if target.len() > 4096 {
            return Err(Fault::new("CAPTURE_SYMLINK"));
        }
        hash.update(target.as_bytes());
        if let Some(sink) = sink {
            sink.write_all(target.as_bytes()).map_err(io_fault)?;
        }
        (target.len() as u64, FileMode::Symlink)
    } else if before.is_file() {
        capacity::check(
            "CAPTURE_LIMIT",
            "sourceFileBytes",
            capacity::FILE_BYTES,
            usize::try_from(before.len()).unwrap_or(usize::MAX),
        )?;
        let mut file =
            open_at(&directory, &name, libc::O_RDONLY | libc::O_NONBLOCK).map_err(io_fault)?;
        if signature(&file.metadata().map_err(io_fault)?) != signature(&before) {
            return Err(Fault::new("CAPTURE_CHANGED"));
        }
        let mut seen = 0u64;
        let mut buffer = [0u8; 65536];
        loop {
            deadline(until)?;
            let count = file.read(&mut buffer).map_err(io_fault)?;
            if count == 0 {
                break;
            }
            seen = seen.saturating_add(count as u64);
            capacity::check(
                "CAPTURE_LIMIT",
                "sourceFileBytes",
                capacity::FILE_BYTES,
                usize::try_from(seen).unwrap_or(usize::MAX),
            )?;
            hash.update(&buffer[..count]);
            if let Some(sink) = &mut sink {
                sink.write_all(&buffer[..count]).map_err(io_fault)?;
            }
        }
        if seen != before.len()
            || signature(&file.metadata().map_err(io_fault)?) != signature(&before)
        {
            return Err(Fault::new("CAPTURE_CHANGED"));
        }
        (
            seen,
            if before.mode() & 0o111 != 0 {
                FileMode::Executable
            } else {
                FileMode::File
            },
        )
    } else {
        return Err(Fault::new("CAPTURE_TYPE"));
    };
    let after = open_at(&directory, &name, libc::O_PATH)
        .map_err(io_fault)?
        .metadata()
        .map_err(io_fault)?;
    if signature(&after) != signature(&before) {
        return Err(Fault::new("CAPTURE_CHANGED"));
    }
    Ok(SourceFile {
        mode,
        bytes,
        digest: Digest::new(format!("{:x}", hash.finalize()))?,
    })
}

pub(crate) fn put(
    root: &Path,
    path: &SourcePath,
    mode: FileMode,
    source: &mut dyn Read,
) -> io::Result<()> {
    let destination = root.join(path.as_str());
    fs::create_dir_all(destination.parent().expect("Validated source parent"))?;
    if mode == FileMode::Symlink {
        let mut bytes = Vec::new();
        source.take(4097).read_to_end(&mut bytes)?;
        let target = std::str::from_utf8(&bytes).map_err(io::Error::other)?;
        if bytes.len() > 4096 {
            return Err(io::Error::other("Source symlink limit"));
        }
        safe_link(path, target).map_err(as_io)?;
        std::os::unix::fs::symlink(target, &destination)?;
    } else {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&destination)?;
        io::copy(source, &mut file)?;
        file.set_permissions(fs::Permissions::from_mode(
            if mode == FileMode::Executable {
                0o700
            } else {
                0o600
            },
        ))?;
        file.sync_all()?;
    }
    let mut directory = destination.parent().expect("Source parent");
    loop {
        File::open(directory)?.sync_all()?;
        if directory == root {
            break;
        }
        directory = directory
            .parent()
            .ok_or_else(|| io::Error::other("Source root"))?;
    }
    Ok(())
}

pub(crate) fn copy_files(from: &Path, to: &Path, manifest: &Manifest) -> io::Result<()> {
    for (path, expected) in &manifest.files {
        let mut temporary = tempfile::tempfile()?;
        let observed = body(from, path, Some(&mut temporary)).map_err(as_io)?;
        if observed != *expected {
            return Err(io::Error::other("Frozen source body mismatch"));
        }
        use std::io::{Seek, SeekFrom};
        temporary.seek(SeekFrom::Start(0))?;
        put(to, path, expected.mode, &mut temporary)?;
    }
    File::open(to)?.sync_all()
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Ready {
    manifest: Digest,
    work: (u64, u64),
    input: (u64, u64),
    git: (u64, u64),
}
fn directory_identity(path: &Path) -> io::Result<(u64, u64)> {
    checked_directory(path)?;
    let metadata = fs::metadata(path)?;
    Ok((metadata.dev(), metadata.ino()))
}
pub(crate) fn ready(job: &Job, manifest: &Manifest) -> io::Result<()> {
    let value = Ready {
        manifest: manifest.digest()?,
        work: directory_identity(&job.work())?,
        input: directory_identity(&job.path().join("input"))?,
        git: directory_identity(&job.work().join(".git"))?,
    };
    if !job.once(
        "source-ready.json",
        &Bound {
            digest: job.digest()?,
            value,
        },
    )? {
        return Err(io::Error::other("Source readiness already exists"));
    }
    Ok(())
}
fn check_roots(job: &Job) -> io::Result<()> {
    let seal: Bound<Ready> = job.read("source-ready.json")?;
    if seal.digest != job.digest()?
        || directory_identity(&job.work())? != seal.value.work
        || directory_identity(&job.path().join("input"))? != seal.value.input
        || directory_identity(&job.work().join(".git"))? != seal.value.git
    {
        return Err(io::Error::other("Execution source directory replaced"));
    }
    Ok(())
}

pub(crate) fn input_manifest(job: &Job) -> io::Result<Option<Manifest>> {
    let Some(source) = job.request()?.source else {
        return Ok(None);
    };
    let manifest = read_manifest(&job.path().join("source.json"))?;
    let seal: Bound<Ready> = job.read("source-ready.json")?;
    if manifest.checkpoint != source.checkpoint
        || manifest.digest()? != source.manifest
        || seal.digest != job.digest()?
        || seal.value.manifest != source.manifest
    {
        return Err(io::Error::other("Frozen source identity mismatch"));
    }
    Ok(Some(manifest))
}

pub(crate) fn verify_input(job: &Job) -> io::Result<()> {
    if let Some(manifest) = input_manifest(job)? {
        check_roots(job)?;
        verify_pack(job)?;
        let head = utility(
            job,
            &job.work(),
            &["rev-parse", "--verify", "HEAD"],
            &[],
            true,
        )
        .map_err(as_io)?;
        if std::str::from_utf8(&head.stdout)
            .map_err(io::Error::other)?
            .trim()
            != manifest.checkpoint.as_str()
        {
            return Err(io::Error::other("Execution Git HEAD changed"));
        }
        if selection(job, Instant::now() + Duration::from_secs(300)).map_err(as_io)?
            != manifest.files.keys().cloned().collect()
        {
            return Err(io::Error::other(
                "Execution source selection changed before dispatch",
            ));
        }
        for (path, expected) in &manifest.files {
            if body(&job.work(), path, None).map_err(as_io)? != *expected {
                return Err(io::Error::other("Execution source changed before dispatch"));
            }
        }
    }
    Ok(())
}

fn utility_command(job: &Job, directory: &Path, args: &[&str]) -> Result<Command> {
    let shell = job.shell().map_err(io_fault)?;
    let tools = shell
        .parent()
        .ok_or_else(|| Fault::new("EXECUTABLE_UNAVAILABLE"))?;
    let mut command = Command::new(tools.join("git"));
    command
        .env_clear()
        .env("PATH", tools)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_NO_REPLACE_OBJECTS", "1")
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.excludesFile=/dev/null",
            "-c",
            "core.bigFileThreshold=1m",
            "-c",
            "core.packedGitWindowSize=1m",
            "-c",
            "core.packedGitLimit=16m",
            "-c",
            "core.deltaBaseCacheLimit=16m",
            "-c",
            "pack.threads=1",
            "-C",
        ])
        .arg(directory)
        .args(args);
    Ok(command)
}

fn utility(
    job: &Job,
    directory: &Path,
    args: &[&str],
    input: &[u8],
    check: bool,
) -> Result<crate::git::process::Output> {
    crate::git::process::run(
        &mut utility_command(job, directory, args)?,
        input,
        Duration::from_secs(30),
        METADATA_LIMIT as usize,
        check,
    )
}

fn selection(job: &Job, until: Instant) -> Result<BTreeSet<SourcePath>> {
    let root = root_file(&job.work())?;
    let mut pending = vec![String::new()];
    let mut paths = BTreeSet::new();
    let mut nodes = 0usize;
    while let Some(relative) = pending.pop() {
        deadline(until)?;
        let directory = if relative.is_empty() {
            root.try_clone().map_err(io_fault)?
        } else {
            let path = SourcePath::new(&relative)?;
            let (parent, name) = parent(&root, &path)?;
            open_at(&parent, &name, libc::O_RDONLY | libc::O_DIRECTORY).map_err(io_fault)?
        };
        for entry in
            fs::read_dir(format!("/proc/self/fd/{}", directory.as_raw_fd())).map_err(io_fault)?
        {
            let name = entry.map_err(io_fault)?.file_name();
            let name = name.to_str().ok_or_else(|| Fault::new("CAPTURE_PATH"))?;
            if relative.is_empty() && name == ".git" {
                continue;
            }
            nodes += 1;
            capacity::check("CAPTURE_LIMIT", "captureScanNodes", 1000000, nodes)?;
            let path = SourcePath::new(if relative.is_empty() {
                name.into()
            } else {
                format!("{relative}/{name}")
            })?;
            let metadata = open_at(&directory, name, libc::O_PATH)
                .map_err(io_fault)?
                .metadata()
                .map_err(io_fault)?;
            if metadata.is_dir() {
                pending.push(path.as_str().into());
            } else {
                paths.insert(path);
                capacity::check("CAPTURE_LIMIT", "captureScanFiles", 250000, paths.len())?;
            }
        }
    }
    Ok(paths)
}

fn selected(
    job: &Job,
    initial: &Manifest,
    source: &Source,
    until: Instant,
) -> Result<BTreeSet<SourcePath>> {
    let paths = selection(job, until)?;
    let mut selected = BTreeSet::new();
    let mut candidates = Vec::new();
    for path in paths {
        if initial.files.contains_key(&path) {
            selected.insert(path);
        } else if !source.readonly {
            if source
                .capture_paths
                .iter()
                .any(|p| path == *p || path.as_str().starts_with(&format!("{p}/")))
            {
                selected.insert(path);
            } else {
                candidates.push(path);
            }
        }
    }
    if !candidates.is_empty() {
        let mut input = Vec::new();
        for path in &candidates {
            capacity::check(
                "CAPTURE_LIMIT",
                "sourceMetadataBytes",
                METADATA_LIMIT as usize,
                input.len().saturating_add(path.as_str().len() + 1),
            )?;
            input.extend_from_slice(path.as_str().as_bytes());
            input.push(0);
        }
        let output = utility(
            job,
            &job.path().join("input"),
            &["check-ignore", "--no-index", "-z", "--stdin"],
            &input,
            false,
        )?;
        if !matches!(output.status.code(), Some(0 | 1)) {
            return Err(Fault::new("IGNORE_CHECK"));
        }
        let ignored: BTreeSet<_> = output
            .stdout
            .split(|b| *b == 0)
            .filter(|b| !b.is_empty())
            .collect();
        for path in candidates {
            if !ignored.contains(path.as_str().as_bytes()) {
                selected.insert(path);
            }
        }
    }
    Ok(selected)
}

fn snapshot(
    job: &Job,
    initial: &Manifest,
    source: &Source,
    destination: Option<&Path>,
    until: Instant,
) -> Result<Manifest> {
    let selected = selected(job, initial, source, until)?;
    capacity::check(
        "CAPTURE_LIMIT",
        "sourceFiles",
        capacity::SOURCE_FILES,
        selected.len(),
    )?;
    let mut files = BTreeMap::new();
    let mut total = 0usize;
    for path in selected {
        deadline(until)?;
        let root = root_file(&job.work())?;
        let (directory, name) = parent(&root, &path)?;
        let bytes = open_at(&directory, &name, libc::O_PATH)
            .map_err(io_fault)?
            .metadata()
            .map_err(io_fault)?
            .len();
        capacity::check(
            "CAPTURE_LIMIT",
            "sourceFileBytes",
            capacity::FILE_BYTES,
            usize::try_from(bytes).unwrap_or(usize::MAX),
        )?;
        capacity::check(
            "CAPTURE_LIMIT",
            "sourceBytes",
            capacity::SOURCE_BYTES,
            total.saturating_add(usize::try_from(bytes).unwrap_or(usize::MAX)),
        )?;
        let observed = if let Some(destination) = destination {
            let mut temporary = tempfile::tempfile().map_err(io_fault)?;
            let observed = body_until(&job.work(), &path, Some(&mut temporary), until)?;
            use std::io::{Seek, SeekFrom};
            temporary.seek(SeekFrom::Start(0)).map_err(io_fault)?;
            put(destination, &path, observed.mode, &mut temporary).map_err(io_fault)?;
            observed
        } else {
            body_until(&job.work(), &path, None, until)?
        };
        total = total.saturating_add(usize::try_from(observed.bytes).unwrap_or(usize::MAX));
        capacity::check(
            "CAPTURE_LIMIT",
            "sourceBytes",
            capacity::SOURCE_BYTES,
            total,
        )?;
        files.insert(path, observed);
    }
    Ok(Manifest {
        checkpoint: source.checkpoint.clone(),
        files,
    })
}

pub(super) fn capture(job: &Job) -> io::Result<Option<Capture>> {
    let Some(initial) = input_manifest(job)? else {
        return Ok(None);
    };
    let source = job.request()?.source.expect("Bound source manifest");
    let until = Instant::now() + Duration::from_secs(300);
    let result = (|| -> Result<Digest> {
        check_roots(job).map_err(io_fault)?;
        let staging = tempfile::Builder::new()
            .prefix(".capture-")
            .tempdir_in(job.path())
            .map_err(io_fault)?;
        let bodies = staging.path().join("files");
        fs::create_dir(&bodies).map_err(io_fault)?;
        let manifest = snapshot(job, &initial, &source, Some(&bodies), until)?;
        if snapshot(job, &initial, &source, None, until)? != manifest {
            return Err(Fault::new("CAPTURE_CHANGED"));
        }
        check_roots(job).map_err(io_fault)?;
        write_manifest(&staging.path().join("manifest.json"), &manifest).map_err(io_fault)?;
        File::open(staging.path())
            .and_then(|f| f.sync_all())
            .map_err(io_fault)?;
        if job.path().join("capture").try_exists().map_err(io_fault)? {
            return Err(Fault::new("CAPTURE_CONFLICT"));
        }
        fs::rename(staging.path(), job.path().join("capture")).map_err(io_fault)?;
        File::open(job.path())
            .and_then(|f| f.sync_all())
            .map_err(io_fault)?;
        manifest.digest().map_err(io_fault)
    })();
    let capture = match result {
        Ok(manifest) => Capture::Sealed { manifest },
        Err(error) => Capture::Rejected { error },
    };
    if !job.once(
        "capture.json",
        &Bound {
            digest: job.digest()?,
            value: &capture,
        },
    )? {
        return Err(io::Error::other("Capture evidence already exists"));
    }
    Ok(Some(capture))
}

fn verify_pack(job: &Job) -> io::Result<()> {
    let source = job
        .request()?
        .source
        .ok_or_else(|| io::Error::other("Missing source pack binding"))?;
    let mut file = job.open_file("source.pack")?;
    let observed = file.metadata()?.len();
    capacity::check(
        "CAPTURE_LIMIT",
        "sourceTransferBytes",
        capacity::PACK_BYTES,
        usize::try_from(observed).unwrap_or(usize::MAX),
    )
    .map_err(as_io)?;
    if observed != source.pack.bytes {
        return Err(io::Error::other("Source pack length mismatch"));
    }
    let mut hash = Sha256::new();
    let mut bytes = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        bytes = bytes.saturating_add(count as u64);
        if bytes > source.pack.bytes {
            return Err(io::Error::other("Source pack length mismatch"));
        }
        hash.update(&buffer[..count]);
    }
    if bytes != source.pack.bytes || format!("{:x}", hash.finalize()) != source.pack.digest.as_str()
    {
        return Err(io::Error::other("Source pack digest mismatch"));
    }
    Ok(())
}

pub(crate) fn initialize_git(job: &Job) -> io::Result<()> {
    verify_pack(job)?;
    let source = job
        .request()?
        .source
        .ok_or_else(|| io::Error::other("Missing source binding"))?;
    let format = if source.checkpoint.as_str().len() == 40 {
        "sha1"
    } else {
        "sha256"
    };
    utility(
        job,
        &job.work(),
        &[
            "init",
            "--template=",
            "-q",
            &format!("--object-format={format}"),
        ],
        &[],
        true,
    )
    .map_err(as_io)?;
    let mut output = Vec::new();
    crate::git::process::stream(
        &mut utility_command(job, &job.work(), &["index-pack", "--stdin"]).map_err(as_io)?,
        Some(job.open_file("source.pack")?),
        Duration::from_secs(120),
        METADATA_LIMIT as usize,
        true,
        &mut output,
    )
    .map_err(as_io)?;
    let mut shallow = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(job.work().join(".git/shallow"))?;
    writeln!(shallow, "{}", source.checkpoint)?;
    shallow.sync_all()?;
    utility(
        job,
        &job.work(),
        &[
            "update-ref",
            "--no-deref",
            "HEAD",
            source.checkpoint.as_str(),
        ],
        &[],
        true,
    )
    .map_err(as_io)?;
    utility(
        job,
        &job.work(),
        &["read-tree", "--reset", source.checkpoint.as_str()],
        &[],
        true,
    )
    .map_err(as_io)?;
    fs::set_permissions(job.work().join(".git"), fs::Permissions::from_mode(0o700))?;
    File::open(job.work().join(".git"))?.sync_all()?;
    File::open(job.work())?.sync_all()
}

pub(crate) fn initialize_ignore(job: &Job, manifest: &Manifest) -> io::Result<()> {
    super::spool::private_directory(&job.path().join("input"))?;
    let ignores = Manifest {
        checkpoint: manifest.checkpoint.clone(),
        files: manifest
            .files
            .iter()
            .filter(|(path, file)| {
                path.as_str().rsplit('/').next() == Some(".gitignore")
                    && file.mode != FileMode::Symlink
            })
            .map(|(path, file)| (path.clone(), file.clone()))
            .collect(),
    };
    copy_files(&job.work(), &job.path().join("input"), &ignores)?;
    utility(
        job,
        &job.path().join("input"),
        &["init", "--template=", "-q"],
        &[],
        true,
    )
    .map_err(as_io)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversized_metadata_is_rejected_before_parsing_or_loading_body() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("manifest.json");
        File::create(&path)
            .unwrap()
            .set_len(METADATA_LIMIT + 1)
            .unwrap();
        let error = read_manifest(&path).unwrap_err();
        assert!(
            error
                .to_string()
                .contains("budget=sourceMetadataBytes configured=50331648 observed=50331649")
        );
    }

    #[test]
    fn large_path_metadata_is_bounded_before_canonical_identity_allocation() {
        let file = SourceFile {
            mode: FileMode::File,
            bytes: 0,
            digest: Digest::new("0".repeat(64)).unwrap(),
        };
        let suffix = "a".repeat(4000);
        let manifest = Manifest {
            checkpoint: Checkpoint::new("1".repeat(40)).unwrap(),
            files: (0..13000)
                .map(|n| {
                    (
                        SourcePath::new(format!("path-{n:06}/{suffix}")).unwrap(),
                        file.clone(),
                    )
                })
                .collect(),
        };
        let error = manifest.validate().unwrap_err();
        assert_eq!(error.code, "CAPTURE_LIMIT");
        assert!(
            error
                .message
                .starts_with("budget=sourceMetadataBytes configured=50331648 observed=")
        );
    }
}
