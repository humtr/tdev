//! Linux/Termux process adapters. Unsafe calls stay in the independent process role.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::os::unix::fs::MetadataExt;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProcessIdentity {
    pub pid: u32,
    pub start_ticks: u64,
    pub boot_id: String,
}

impl ProcessIdentity {
    pub fn is_live(&self) -> io::Result<bool> {
        live(self)
    }
}

struct Process {
    identity: ProcessIdentity,
    parent: u32,
    zombie: bool,
}

pub fn identity(pid: u32) -> io::Result<Option<ProcessIdentity>> {
    Ok(process(pid)?.map(|p| p.identity))
}

pub fn live(expected: &ProcessIdentity) -> io::Result<bool> {
    Ok(process(expected.pid)?.is_some_and(|p| p.identity == *expected && !p.zombie))
}

fn process(pid: u32) -> io::Result<Option<Process>> {
    if pid == 0 || pid > i32::MAX as u32 {
        return Err(io::Error::other("Invalid process identity"));
    }
    let root = PathBuf::from(format!("/proc/{pid}"));
    let read = || -> io::Result<Process> {
        // A foreign UID is never an owned signal target.
        if fs::metadata(&root)?.uid() != unsafe { libc::geteuid() } {
            return Err(io::Error::other("Foreign process identity"));
        }
        let text = fs::read_to_string(root.join("stat"))?;
        let fields: Vec<_> = text
            .rsplit_once(')')
            .ok_or_else(|| io::Error::other("Invalid process stat"))?
            .1
            .split_whitespace()
            .collect();
        let number = |index: usize| -> io::Result<u64> {
            fields
                .get(index)
                .ok_or_else(|| io::Error::other("Incomplete process stat"))?
                .parse()
                .map_err(io::Error::other)
        };
        let boot_id = fs::read_to_string("/proc/sys/kernel/random/boot_id")?
            .trim()
            .to_owned();
        if uuid::Uuid::parse_str(&boot_id).is_err() {
            return Err(io::Error::other("Invalid boot identity"));
        }
        Ok(Process {
            identity: ProcessIdentity {
                pid,
                start_ticks: number(19)?,
                boot_id,
            },
            parent: u32::try_from(number(1)?).map_err(io::Error::other)?,
            zombie: fields.first() == Some(&"Z"),
        })
    };
    match read() {
        Ok(p) => Ok(Some(p)),
        // An opened proc file can return ESRCH if its process exits before the read.
        Err(error) if disappeared(&error) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn initialize() -> io::Result<()> {
    // SAFETY: scalar-only process-local syscalls, before creating any command/thread.
    unsafe {
        if libc::getsid(0) != libc::getpid() && libc::setsid() == -1 {
            return Err(io::Error::last_os_error());
        }
        if libc::signal(libc::SIGCHLD, libc::SIG_DFL) == libc::SIG_ERR {
            return Err(io::Error::last_os_error());
        }
        if libc::prctl(libc::PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) == -1
            || libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) == -1
        {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

pub fn detached(command: &mut Command) {
    // SAFETY: the pre-exec closure calls only the async-signal-safe setsid syscall.
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() == -1 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        });
    }
}

pub fn child_limits(command: &mut Command, working_bytes: u64, timeout: Option<u64>) {
    // SAFETY: no allocations or locks after fork; getrlimit/setrlimit use stack storage.
    unsafe {
        command.pre_exec(move || {
            lower_limit(libc::RLIMIT_CORE, 0)?;
            lower_limit(libc::RLIMIT_NOFILE, 256)?;
            lower_limit(libc::RLIMIT_FSIZE, working_bytes)?;
            if let Some(seconds) = timeout {
                lower_limit(libc::RLIMIT_CPU, seconds + 1)?;
            }
            Ok(())
        });
    }
}

// RLIMIT constants are signed ints on Android and unsigned ints on desktop Linux.
#[cfg(target_os = "android")]
type Resource = libc::c_int;
#[cfg(not(target_os = "android"))]
type Resource = libc::__rlimit_resource_t;

fn lower_limit(resource: Resource, value: u64) -> io::Result<()> {
    let mut inherited = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    // SAFETY: valid stack pointers and resource constants; called only before child exec.
    unsafe {
        if libc::getrlimit(resource, &mut inherited) == -1 {
            return Err(io::Error::last_os_error());
        }
        let maximum = (value as libc::rlim_t).min(inherited.rlim_max);
        let limit = libc::rlimit {
            rlim_cur: maximum.min(inherited.rlim_cur),
            rlim_max: maximum,
        };
        if libc::setrlimit(resource, &limit) == -1 {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

fn binary_directory() -> io::Result<PathBuf> {
    if let Some(prefix) = std::env::var_os("PREFIX") {
        let bin = PathBuf::from(prefix).join("bin");
        if bin.is_absolute() && bin.join("sh").is_file() {
            return Ok(bin);
        }
    }
    for bin in ["/usr/bin", "/bin", "/system/bin"] {
        if Path::new(bin).join("sh").is_file() {
            return Ok(PathBuf::from(bin));
        }
    }
    Err(io::Error::other("Native shell unavailable"))
}

pub fn shell() -> io::Result<PathBuf> {
    Ok(binary_directory()?.join("sh"))
}

pub fn environment(job: &Path, shell: &Path) -> io::Result<BTreeMap<String, String>> {
    let bin = shell
        .parent()
        .ok_or_else(|| io::Error::other("Missing native tool directory"))?;
    let mut env = BTreeMap::from([
        (
            "PATH".into(),
            format!("{}:/system/bin:/usr/bin:/bin", bin.display()),
        ),
        ("LANG".into(), "C.UTF-8".into()),
        ("GIT_CONFIG_NOSYSTEM".into(), "1".into()),
        ("GIT_CONFIG_GLOBAL".into(), "/dev/null".into()),
        ("GIT_TERMINAL_PROMPT".into(), "0".into()),
    ]);
    for (key, directory) in [
        ("HOME", "home"),
        ("TMPDIR", "tmp"),
        ("XDG_CONFIG_HOME", "config"),
        ("XDG_CACHE_HOME", "cache"),
    ] {
        env.insert(key.into(), job.join(directory).to_string_lossy().into());
    }
    if let Some(prefix) = bin.parent() {
        env.insert("PREFIX".into(), prefix.to_string_lossy().into());
    }
    Ok(env)
}

fn descendants() -> io::Result<Vec<ProcessIdentity>> {
    let mut processes = Vec::new();
    let uid = unsafe { libc::geteuid() };
    for (index, entry) in fs::read_dir("/proc")?.enumerate() {
        if index >= 100000 {
            return Err(io::Error::other("Process observation budget exceeded"));
        }
        let entry = entry?;
        let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else {
            continue;
        };
        match fs::metadata(entry.path()) {
            Ok(metadata) if metadata.uid() != uid => continue,
            Err(error) if disappeared(&error) => continue,
            Err(error) => return Err(error),
            _ => {}
        }
        if let Some(process) = process(pid)? {
            processes.push(process);
        }
        if processes.len() > 100000 {
            return Err(io::Error::other("Process observation budget exceeded"));
        }
    }
    let mut parents = vec![std::process::id()];
    let mut result = Vec::new();
    let mut at = 0;
    while at < parents.len() {
        let parent = parents[at];
        for process in &processes {
            if process.parent == parent && !parents.contains(&process.identity.pid) {
                parents.push(process.identity.pid);
                result.push(process.identity.clone());
            }
        }
        at += 1;
    }
    Ok(result)
}

fn kill(expected: &ProcessIdentity) -> io::Result<()> {
    if live(expected)? {
        // SAFETY: a positive same-UID PID checked against start/boot identity immediately
        // before signalling. The remaining PID race is outside hostile-code containment.
        if unsafe { libc::kill(expected.pid as i32, libc::SIGKILL) } == -1 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() != Some(libc::ESRCH) {
                return Err(error);
            }
        }
    }
    Ok(())
}

fn disappeared(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::NotFound || error.raw_os_error() == Some(libc::ESRCH)
}

pub fn stop_children(child: &mut Child) -> io::Result<bool> {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let children = descendants()?;
        for identity in children.iter().rev() {
            kill(identity)?;
        }
        // Preserve the direct child's exit status before reaping adopted descendants.
        let mut no_children = false;
        if child.try_wait()?.is_some() {
            loop {
                let mut status = 0;
                // SAFETY: only this independent process's waitable children are reaped.
                let pid = unsafe { libc::waitpid(-1, &mut status, libc::WNOHANG) };
                if pid <= 0 {
                    if pid == -1 {
                        let error = io::Error::last_os_error();
                        no_children = error.raw_os_error() == Some(libc::ECHILD);
                        if error.raw_os_error() != Some(libc::ECHILD)
                            && error.kind() != io::ErrorKind::Interrupted
                        {
                            return Err(error);
                        }
                    }
                    break;
                }
            }
        }
        // /proc is a snapshot: a parent can exit between two stat reads. ECHILD also
        // proves no waitable/adopted child remains across that reparenting window.
        if no_children && descendants()?.is_empty() && child.try_wait()?.is_some() {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Ok(false);
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}
