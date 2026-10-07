//! Selected public distributions, streamed into fresh private storage. Admission, dispatch,
//! stop proof and replay belong to the original operation/supervisor owners, not this helper.
use super::recipe;
use crate::{contract::Contract, git::process, model::*, supervisor};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

const INPUT_MAX: u64 = 64 * 1024 * 1024;
const HEADER_MAX: usize = 65536;
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Debug)]
struct Dependency {
    url: String,
    digest: Digest,
}

/// Constructed only through the original strict recipe/schema owner. No resolver, credentials,
/// task cache or execution policy is supplied by a distribution description.
#[derive(Clone, Debug)]
pub struct Inputs {
    selected: BTreeMap<String, Dependency>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InputFile {
    pub size: u64,
    pub sha256: Digest,
}

fn storage(_: io::Error) -> Fault {
    Fault::new("ARTIFACT_INPUT_STORAGE")
}

fn budget(configured: u64, observed: u64) -> Result<()> {
    if observed > configured {
        return Err(Fault::message(
            "ARTIFACT_INPUT_LIMIT",
            format!("budget=artifactInputBytes configured={configured} observed={observed}"),
        ));
    }
    Ok(())
}

fn configured(value: u64) -> Result<()> {
    if !(1..=INPUT_MAX).contains(&value) {
        return Err(Fault::new("ARTIFACT_INPUT_BUDGET"));
    }
    Ok(())
}

fn directory(path: &Path) -> Result<File> {
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
        .map_err(storage)
}

fn open_file(root: &File, name: &str, create: bool) -> Result<File> {
    // Validated dependency names are single components; reject traversal independently of
    // their recipe decoder at this descriptor boundary.
    if name.is_empty() || matches!(name, "." | "..") || name.contains(['/', '\\', '\0']) {
        return Err(Fault::new("ARTIFACT_PATH"));
    }
    let name = std::ffi::CString::new(name).map_err(|_| Fault::new("ARTIFACT_PATH"))?;
    let flags = libc::O_CLOEXEC
        | libc::O_NOFOLLOW
        | libc::O_NONBLOCK
        | if create {
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL
        } else {
            libc::O_RDONLY
        };
    // SAFETY: the directory descriptor and NUL-terminated single component stay live.
    // openat returns a new owned descriptor, or -1; never follows the final component.
    let fd = unsafe { libc::openat(root.as_raw_fd(), name.as_ptr(), flags, 0o600) };
    if fd == -1 {
        return Err(storage(io::Error::last_os_error()));
    }
    // SAFETY: fd was just created by openat and has no other Rust owner.
    Ok(unsafe { File::from_raw_fd(fd) })
}

impl Inputs {
    pub fn from_recipe(contract: &Contract, value: &Value) -> Result<Self> {
        let checked = recipe::parse(contract, value.to_string().as_bytes())?;
        let selected = checked["dependencies"]
            .as_array()
            .unwrap()
            .iter()
            .map(|d| {
                Ok((
                    d["name"].as_str().unwrap().to_owned(),
                    Dependency {
                        url: d["url"].as_str().unwrap().to_owned(),
                        digest: Digest::new(d["sha256"].as_str().unwrap())?,
                    },
                ))
            })
            .collect::<Result<_>>()?;
        Ok(Self { selected })
    }

    /// Fresh destination only. An existing/partial directory is never resumed, overwritten,
    /// removed or downloaded again here. The accepting operation owns any recovery decision.
    pub fn acquire(
        &self,
        destination: &Path,
        input_bytes: u64,
        deadline: Instant,
    ) -> Result<BTreeMap<String, InputFile>> {
        self.acquire_with(destination, input_bytes, deadline, https_command)
    }

    fn acquire_with(
        &self,
        destination: &Path,
        input_bytes: u64,
        deadline: Instant,
        mut command: impl FnMut(&str, Duration) -> Result<Command>,
    ) -> Result<BTreeMap<String, InputFile>> {
        configured(input_bytes)?;
        remaining(deadline)?;
        fs::DirBuilder::new()
            .mode(0o700)
            .create(destination)
            .map_err(|e| {
                if e.kind() == io::ErrorKind::AlreadyExists {
                    Fault::new("ARTIFACT_INPUT_EXISTS")
                } else {
                    storage(e)
                }
            })?;
        let root = directory(destination)?;
        File::open(
            destination
                .parent()
                .ok_or_else(|| Fault::new("ARTIFACT_PATH"))?,
        )
        .map_err(storage)?
        .sync_all()
        .map_err(storage)?;
        let mut files = BTreeMap::new();
        let mut total: u64 = 0;
        for (name, dependency) in &self.selected {
            let timeout = remaining(deadline)?.min(TRANSFER_TIMEOUT);
            let mut command = command(&dependency.url, timeout)?;
            let file = open_file(&root, name, true)?;
            let mut sink = Response::new(file, input_bytes, total);
            let result = process::stream(&mut command, None, timeout, usize::MAX, false, &mut sink);
            if let Some(error) = sink.failure.take() {
                return Err(error);
            }
            let output = result.map_err(|error| {
                Fault::new(match error.code.as_str() {
                    "EXECUTABLE_UNAVAILABLE" => "ARTIFACT_ACQUISITION_TOOL_MISSING",
                    "TRANSPORT_TIMEOUT" => "ARTIFACT_DEPENDENCY_TIMEOUT",
                    _ => "ARTIFACT_DEPENDENCY_UNAVAILABLE",
                })
            })?;
            if output.status.code() == Some(28) {
                return Err(Fault::new("ARTIFACT_DEPENDENCY_TIMEOUT"));
            }
            if !output.status.success() || !sink.body {
                return Err(Fault::new("ARTIFACT_DEPENDENCY_UNAVAILABLE"));
            }
            let info = InputFile {
                size: sink.bytes,
                sha256: Digest::new(format!("{:x}", sink.hash.finalize()))?,
            };
            if info.sha256 != dependency.digest {
                return Err(Fault::message("ARTIFACT_DEPENDENCY_CHANGED", name));
            }
            sink.file
                .set_permissions(fs::Permissions::from_mode(0o400))
                .map_err(storage)?;
            sink.file.sync_all().map_err(storage)?;
            total += info.size;
            files.insert(name.clone(), info);
        }
        remaining(deadline)?;
        root.sync_all().map_err(storage)?;
        unchanged_directory(destination, &root)?;
        Ok(files)
    }

    /// Rehash selected files after execution/before retention; no download or repair.
    pub fn verify(
        &self,
        destination: &Path,
        input_bytes: u64,
    ) -> Result<BTreeMap<String, InputFile>> {
        configured(input_bytes)?;
        let root = directory(destination)?;
        let mut names = fs::read_dir(format!("/proc/self/fd/{}", root.as_raw_fd()))
            .map_err(storage)?
            .map(|e| e.map(|e| e.file_name()))
            .collect::<io::Result<Vec<_>>>()
            .map_err(storage)?;
        names.sort();
        let expected: Vec<_> = self.selected.keys().map(std::ffi::OsString::from).collect();
        if names != expected {
            return Err(Fault::new("ARTIFACT_INPUT_MISMATCH"));
        }
        let mut files = BTreeMap::new();
        let mut total: u64 = 0;
        for (name, dependency) in &self.selected {
            let mut file = open_file(&root, name, false)?;
            let before = file.metadata().map_err(storage)?;
            if !before.is_file() || before.nlink() != 1 || before.mode() & 0o111 != 0 {
                return Err(Fault::new("ARTIFACT_FILE_TYPE"));
            }
            budget(input_bytes, total.saturating_add(before.len()))?;
            let mut hash = Sha256::new();
            let mut size = 0;
            let mut bytes = [0; 65536];
            loop {
                let count = file.read(&mut bytes).map_err(storage)?;
                if count == 0 {
                    break;
                }
                size += count as u64;
                budget(input_bytes, total.saturating_add(size))?;
                hash.update(&bytes[..count]);
            }
            let after = file.metadata().map_err(storage)?;
            let current = open_file(&root, name, false)?.metadata().map_err(storage)?;
            if stamp(&before) != stamp(&after)
                || stamp(&current) != stamp(&after)
                || size != before.len()
            {
                return Err(Fault::new("ARTIFACT_FILE_CHANGED"));
            }
            let info = InputFile {
                size,
                sha256: Digest::new(format!("{:x}", hash.finalize()))?,
            };
            if info.sha256 != dependency.digest {
                return Err(Fault::message("ARTIFACT_DEPENDENCY_CHANGED", name));
            }
            total += size;
            files.insert(name.clone(), info);
        }
        unchanged_directory(destination, &root)?;
        Ok(files)
    }
}

fn unchanged_directory(path: &Path, root: &File) -> Result<()> {
    let current = directory(path)?.metadata().map_err(storage)?;
    let original = root.metadata().map_err(storage)?;
    if (current.dev(), current.ino()) != (original.dev(), original.ino()) {
        return Err(Fault::new("ARTIFACT_INPUT_REPLACED"));
    }
    Ok(())
}

fn stamp(m: &fs::Metadata) -> (u64, u64, u64, u64, i64, i64, i64, i64, u32) {
    (
        m.dev(),
        m.ino(),
        m.nlink(),
        m.len(),
        m.mtime(),
        m.mtime_nsec(),
        m.ctime(),
        m.ctime_nsec(),
        m.mode(),
    )
}

fn remaining(deadline: Instant) -> Result<Duration> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|d| !d.is_zero())
        .ok_or_else(|| Fault::new("ARTIFACT_DEPENDENCY_TIMEOUT"))
}

fn https_command(url: &str, timeout: Duration) -> Result<Command> {
    let shell =
        supervisor::native_shell().map_err(|_| Fault::new("ARTIFACT_ACQUISITION_TOOL_MISSING"))?;
    let mut command = Command::new(shell.with_file_name("curl"));
    // --disable MUST be curl's first argument. No controller HOME, proxies, CA overrides,
    // tokens, cookies, .netrc or authentication handlers are inherited. Native TLS trust only.
    command.env_clear().env("LANG", "C.UTF-8").args([
        "--disable",
        "--silent",
        "--globoff",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--noproxy",
        "*",
        "--proxy",
        "",
        "--no-netrc",
        "--no-location",
        "--retry",
        "0",
        "--http1.1",
        "--include",
        "--request",
        "GET",
        "--max-time",
        &timeout.as_secs_f64().to_string(),
        "--connect-timeout",
        &timeout.as_secs_f64().to_string(),
        "--url",
        url,
    ]);
    Ok(command)
}

struct Response {
    file: File,
    header: Vec<u8>,
    header_bytes: usize,
    body: bool,
    bytes: u64,
    configured: u64,
    previous: u64,
    hash: Sha256,
    failure: Option<Fault>,
}
impl Response {
    fn new(file: File, configured: u64, previous: u64) -> Self {
        Self {
            file,
            header: Vec::new(),
            header_bytes: 0,
            body: false,
            bytes: 0,
            configured,
            previous,
            hash: Sha256::new(),
            failure: None,
        }
    }
    fn write_bytes(&mut self, mut bytes: &[u8]) -> Result<()> {
        while !self.body && !bytes.is_empty() {
            self.header.push(bytes[0]);
            self.header_bytes += 1;
            bytes = &bytes[1..];
            if self.header_bytes > HEADER_MAX {
                return Err(Fault::message(
                    "ARTIFACT_RESPONSE_LIMIT",
                    format!(
                        "budget=artifactResponseHeaderBytes configured={HEADER_MAX} observed={}",
                        self.header_bytes
                    ),
                ));
            }
            if self.header.ends_with(b"\r\n\r\n") {
                // Only the HTTP status line is ASCII text. Valid field values may carry
                // opaque non-UTF-8 octets; do not apply the JSON ingress profile to them.
                let end = self.header.windows(2).position(|b| b == b"\r\n").unwrap();
                let text = std::str::from_utf8(&self.header[..end])
                    .map_err(|_| Fault::new("ARTIFACT_DEPENDENCY_HTTP"))?;
                let mut parts = text.lines().next().unwrap_or("").split_whitespace();
                if !matches!(parts.next(), Some("HTTP/1.0" | "HTTP/1.1")) {
                    return Err(Fault::new("ARTIFACT_DEPENDENCY_HTTP"));
                }
                let code = parts
                    .next()
                    .filter(|p| p.len() == 3 && p.bytes().all(|b| b.is_ascii_digit()))
                    .and_then(|p| p.parse::<u16>().ok())
                    .unwrap_or(0);
                self.header.clear();
                match code {
                    200 => self.body = true,
                    100..=199 if code != 101 => (),
                    300..=399 => return Err(Fault::new("ARTIFACT_DEPENDENCY_REDIRECT")),
                    _ => return Err(Fault::new("ARTIFACT_DEPENDENCY_HTTP")),
                }
            }
        }
        if self.body {
            let observed = self
                .previous
                .saturating_add(self.bytes)
                .saturating_add(bytes.len() as u64);
            budget(self.configured, observed)?;
            self.file.write_all(bytes).map_err(storage)?;
            self.hash.update(bytes);
            self.bytes += bytes.len() as u64;
        }
        Ok(())
    }
}
impl Write for Response {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        match self.write_bytes(bytes) {
            Ok(()) => Ok(bytes.len()),
            Err(error) => {
                self.failure = Some(error);
                Err(io::Error::other("Rejected selected distribution"))
            }
        }
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

#[cfg(test)]
#[path = "acquisition_tests.rs"]
mod tests;
