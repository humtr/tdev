use super::{OUTPUT_LIMIT, platform};
use crate::identity;
use crate::model::{Digest, OperationId};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

const FORMAT: u32 = 1;
const RECORD_LIMIT: u64 = 512 * 1024;
const WORKING_MAX: u64 = 2 * 1024 * 1024 * 1024;

/// Frozen internal launch input; the controller supplies owned materialization separately.
/// A command starts with stdin closed.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub command: String,
    pub cwd: String,
    pub timeout_seconds: Option<u64>,
    pub working_bytes: u64,
}

impl Request {
    fn validate(&self) -> io::Result<()> {
        if self.command.is_empty()
            || self.command.chars().count() > 65536
            || self.command.contains('\0')
            || self.cwd.chars().count() > 4096
            || self.cwd.contains('\0')
            || Path::new(&self.cwd).is_absolute()
            || Path::new(&self.cwd)
                .components()
                .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
            || self
                .timeout_seconds
                .is_some_and(|s| !(1..=3600).contains(&s))
            || self.working_bytes == 0
            || self.working_bytes > WORKING_MAX
        {
            return Err(io::Error::other("Invalid frozen execution input"));
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Reservation {
    format: u32,
    operation: OperationId,
    digest: Digest,
    request: Request,
    shell: PathBuf,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Bound<T> {
    digest: Digest,
    value: T,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Exited,
    Cancelled,
    Deadline,
    WorkingBudget,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Report {
    pub worker: platform::ProcessIdentity,
    pub digest: Digest,
    pub outcome: Outcome,
    pub exit_code: Option<i32>,
    pub stopped: bool,
    pub retained_bytes: u64,
    pub discarded_bytes: u64,
}

#[derive(Debug, Eq, PartialEq)]
pub enum Observation {
    Reserved,
    Running(platform::ProcessIdentity),
    Complete(Report),
    Unknown,
}

#[derive(Clone, Debug)]
pub struct Job {
    path: PathBuf,
}

impl Job {
    /// Retains the original bytes. Existing or incomplete reservations are never replaced.
    pub fn reserve(root: &Path, operation: &OperationId, request: Request) -> io::Result<Self> {
        request.validate()?;
        private_directory(root)?;
        let path = root.join(operation.as_str());
        match fs::DirBuilder::new().mode(0o700).create(&path) {
            Ok(()) => {
                File::open(root)?.sync_all()?;
                let shell = platform::shell()?;
                let reservation = Reservation {
                    format: FORMAT,
                    operation: operation.clone(),
                    digest: fingerprint(&(&request, &shell))?,
                    request,
                    shell,
                };
                let job = Self { path };
                for name in ["work", "home", "tmp", "config", "cache"] {
                    fs::DirBuilder::new()
                        .mode(0o700)
                        .create(job.path.join(name))?;
                }
                job.atomic("request.json", &reservation)?;
                Ok(job)
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                let job = Self::open(&path)?;
                let original = job.reservation()?;
                if original.operation != *operation || original.request != request {
                    return Err(io::Error::other("Execution reservation conflict"));
                }
                Ok(job)
            }
            Err(error) => Err(error),
        }
    }

    pub fn open(path: &Path) -> io::Result<Self> {
        checked_directory(path)?;
        let job = Self { path: path.into() };
        job.reservation()?;
        Ok(job)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn work(&self) -> PathBuf {
        self.path.join("work")
    }

    pub fn request(&self) -> io::Result<Request> {
        Ok(self.reservation()?.request)
    }

    pub fn digest(&self) -> io::Result<Digest> {
        Ok(self.reservation()?.digest)
    }

    pub(crate) fn shell(&self) -> io::Result<PathBuf> {
        Ok(self.reservation()?.shell)
    }

    fn reservation(&self) -> io::Result<Reservation> {
        let record: Reservation = self.read("request.json")?;
        record.request.validate()?;
        if record.format != FORMAT
            || self.path.file_name().and_then(|s| s.to_str()) != Some(record.operation.as_str())
            || !record.shell.is_absolute()
            || record.shell.file_name().is_none_or(|name| name != "sh")
            || fingerprint(&(&record.request, &record.shell))? != record.digest
        {
            return Err(io::Error::other("Invalid execution reservation"));
        }
        Ok(record)
    }

    /// The launch fence is durable before OS dispatch. A replay only observes that fence.
    pub fn launch(&self, executable: &Path) -> io::Result<bool> {
        let digest = self.digest()?;
        // A replay is observation even when execution has removed or changed its cwd.
        match self.read::<Digest>("dispatch.json") {
            Ok(previous) if previous == digest => return Ok(false),
            Ok(_) => return Err(io::Error::other("Execution dispatch identity conflict")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        self.cwd(&self.request()?)?;
        if !self.once("dispatch.json", &digest)? {
            self.check_dispatch()?;
            return Ok(false);
        }
        let mut command = Command::new(executable);
        command
            .arg("supervise")
            .arg("--job")
            .arg(&self.path)
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        // The shell/tool directory was frozen in the reservation. No controller/provider
        // environment is needed by this worker or inherited by its candidate child.
        platform::detached(&mut command);
        let mut child = command.spawn()?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(true)
    }

    fn check_dispatch(&self) -> io::Result<()> {
        let digest: Digest = self.read("dispatch.json")?;
        if digest != self.digest()? {
            return Err(io::Error::other("Execution dispatch identity conflict"));
        }
        Ok(())
    }

    pub(crate) fn claim(&self) -> io::Result<Option<platform::ProcessIdentity>> {
        self.check_dispatch()?;
        let worker = platform::identity(std::process::id())?
            .ok_or_else(|| io::Error::other("Supervisor identity unavailable"))?;
        let claim = Bound {
            digest: self.digest()?,
            value: worker.clone(),
        };
        // A partial claim survives as uncertainty. No later process may take it over.
        if !self.once("claim.json", &claim)? {
            return Ok(None);
        }
        self.atomic("worker.json", &claim)?;
        Ok(Some(worker))
    }

    pub(crate) fn record_child_dispatch(&self) -> io::Result<()> {
        if !self.once("child-dispatch.json", &self.digest()?)? {
            return Err(io::Error::other("Child dispatch already reserved"));
        }
        Ok(())
    }

    pub(crate) fn record_child(&self, identity: &platform::ProcessIdentity) -> io::Result<()> {
        self.atomic(
            "child.json",
            &Bound {
                digest: self.digest()?,
                value: identity,
            },
        )
    }

    pub fn cancel(&self) -> io::Result<()> {
        let digest = self.digest()?;
        if !self.once("cancel.json", &digest)? {
            let previous: Digest = self.read("cancel.json")?;
            if previous != digest {
                return Err(io::Error::other("Cancellation identity conflict"));
            }
        }
        Ok(())
    }

    pub(crate) fn cancelled(&self) -> io::Result<bool> {
        match self.read::<Digest>("cancel.json") {
            Ok(digest) if digest == self.digest()? => Ok(true),
            Ok(_) => Err(io::Error::other("Cancellation identity conflict")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error),
        }
    }

    pub fn observe(&self) -> io::Result<Observation> {
        let digest = self.digest()?;
        match self.read::<Digest>("dispatch.json") {
            Ok(dispatched) if dispatched == digest => {}
            Ok(_) => return Ok(Observation::Unknown),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(Observation::Reserved);
            }
            Err(_) => return Ok(Observation::Unknown),
        }
        let claim: Bound<platform::ProcessIdentity> = match self.read("claim.json") {
            Ok(claim) => claim,
            Err(_) => return Ok(Observation::Unknown),
        };
        let worker: Bound<platform::ProcessIdentity> =
            match self.read::<Bound<platform::ProcessIdentity>>("worker.json") {
                Ok(worker) if worker.digest == digest => worker,
                _ => return Ok(Observation::Unknown),
            };
        if claim.digest != digest || claim.value != worker.value {
            return Ok(Observation::Unknown);
        }
        match self.read::<Report>("result.json") {
            Ok(report)
                if report.digest == digest
                    && report.worker == worker.value
                    && report.stopped
                    && report.retained_bytes <= OUTPUT_LIMIT
                    && self.log_length()? == report.retained_bytes =>
            {
                Ok(Observation::Complete(report))
            }
            Ok(_) => Ok(Observation::Unknown),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                if platform::live(&worker.value)? {
                    Ok(Observation::Running(worker.value))
                } else {
                    Ok(Observation::Unknown)
                }
            }
            Err(_) => Ok(Observation::Unknown),
        }
    }

    pub fn log(&self, offset: u64, limit: usize) -> io::Result<Vec<u8>> {
        use std::io::{Seek, SeekFrom};
        if !(1..=65536).contains(&limit) {
            return Err(io::Error::other("Invalid log page limit"));
        }
        let mut log = self.open_file("output.bin")?;
        let length = log.metadata()?.len().min(OUTPUT_LIMIT);
        log.seek(SeekFrom::Start(offset.min(length)))?;
        let mut bytes = Vec::new();
        log.take(limit as u64).read_to_end(&mut bytes)?;
        Ok(bytes)
    }

    fn log_length(&self) -> io::Result<u64> {
        Ok(self.open_file("output.bin")?.metadata()?.len())
    }

    pub(crate) fn create_log(&self) -> io::Result<File> {
        self.create_file("output.bin")
    }

    pub(crate) fn complete(&self, report: Report) -> io::Result<()> {
        self.atomic("result.json", &report)
    }

    pub(crate) fn record_failure(&self, error: &io::Error) -> io::Result<()> {
        // Diagnostics carry no command, candidate output or free-form/provider error text.
        // They never substitute for a terminal result or stop proof.
        self.once(
            "failure.json",
            &Bound {
                digest: self.digest()?,
                value: serde_json::json!({
                    "code": "SUPERVISOR_EVIDENCE_INCOMPLETE",
                    "kind": format!("{:?}", error.kind()),
                    "os_errno": error.raw_os_error(),
                }),
            },
        )?;
        Ok(())
    }

    pub(crate) fn cwd(&self, request: &Request) -> io::Result<PathBuf> {
        let root = self.work();
        checked_directory(&root)?;
        let mut path = root;
        for component in Path::new(&request.cwd).components() {
            if let Component::Normal(name) = component {
                path.push(name);
                let metadata = fs::symlink_metadata(&path)?;
                if !metadata.is_dir() || metadata.file_type().is_symlink() {
                    return Err(io::Error::other("Execution cwd is not an owned directory"));
                }
            }
        }
        Ok(path)
    }

    pub(crate) fn within_budget(&self, budget: u64) -> io::Result<bool> {
        let mut pending: Vec<_> = ["work", "home", "tmp", "config", "cache"]
            .map(|name| self.path.join(name))
            .into();
        let mut bytes = 0u64;
        let mut count = 0;
        while let Some(path) = pending.pop() {
            count += 1;
            if count > 100000 {
                return Ok(false);
            }
            let metadata = match fs::symlink_metadata(&path) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                Err(error) => return Err(error),
            };
            if metadata.is_dir() {
                for entry in fs::read_dir(path)? {
                    pending.push(entry?.path());
                    if pending.len() > 100000 {
                        return Ok(false);
                    }
                }
            } else {
                bytes = bytes.saturating_add(metadata.len());
                if bytes > budget {
                    return Ok(false);
                }
            }
        }
        Ok(true)
    }

    fn read<T: DeserializeOwned>(&self, name: &str) -> io::Result<T> {
        let file = self.open_file(name)?;
        let mut bytes = Vec::new();
        file.take(RECORD_LIMIT + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > RECORD_LIMIT {
            return Err(io::Error::other("Execution record exceeds limit"));
        }
        serde_json::from_slice(&bytes).map_err(io::Error::other)
    }

    fn open_file(&self, name: &str) -> io::Result<File> {
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(self.path.join(name))?;
        if !file.metadata()?.is_file() {
            return Err(io::Error::other("Execution record is not a regular file"));
        }
        Ok(file)
    }

    fn create_file(&self, name: &str) -> io::Result<File> {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(self.path.join(name))
    }

    fn once(&self, name: &str, value: &impl Serialize) -> io::Result<bool> {
        let mut file = match self.create_file(name) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => return Ok(false),
            Err(error) => return Err(error),
        };
        serde_json::to_writer(&mut file, value).map_err(io::Error::other)?;
        file.sync_all()?;
        File::open(&self.path)?.sync_all()?;
        Ok(true)
    }

    fn atomic(&self, name: &str, value: &impl Serialize) -> io::Result<()> {
        let temporary = format!(".{name}.{}", uuid::Uuid::new_v4());
        let mut file = self.create_file(&temporary)?;
        serde_json::to_writer(&mut file, value).map_err(io::Error::other)?;
        file.flush()?;
        file.sync_all()?;
        fs::rename(self.path.join(temporary), self.path.join(name))?;
        File::open(&self.path)?.sync_all()
    }
}

fn fingerprint(request: &impl Serialize) -> io::Result<Digest> {
    let json = serde_json::to_string(request).map_err(io::Error::other)?;
    identity::Value::parse(&json)
        .and_then(|value| value.fingerprint())
        .map_err(io::Error::other)
}

fn checked_directory(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if !path.is_absolute()
        || !metadata.is_dir()
        || metadata.file_type().is_symlink()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.permissions().mode() & 0o077 != 0
    {
        return Err(io::Error::other(
            "Execution spool must be an owned private directory",
        ));
    }
    // Parent components must not resolve through a symlink either.
    if fs::canonicalize(path)? != path {
        return Err(io::Error::other("Execution spool path must be canonical"));
    }
    Ok(())
}

fn private_directory(path: &Path) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("Missing spool parent"))?;
    if !path.is_absolute() || fs::canonicalize(parent)? != parent {
        return Err(io::Error::other("Execution spool parent must be canonical"));
    }
    match fs::DirBuilder::new().mode(0o700).create(path) {
        Ok(()) => File::open(
            path.parent()
                .ok_or_else(|| io::Error::other("Missing spool parent"))?,
        )?
        .sync_all()?,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error),
    }
    checked_directory(path)
}
