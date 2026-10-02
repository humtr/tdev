//! Bounded local enrollment utilities. Connect never writes a checkout or index.
use super::*;
use std::ffi::CString;
use std::os::unix::{ffi::OsStrExt, fs::OpenOptionsExt};

pub struct LocalProject {
    pub remote: PathBuf,
    pub identity: String,
    pub checkout: Option<PathBuf>,
    pub checkout_identity: Option<String>,
    pub branch: BranchRef,
}

fn path_identity(path: &Path) -> Result<String> {
    let metadata = fs::metadata(path).map_err(|_| Fault::new("REPOSITORY_IDENTITY"))?;
    if !metadata.is_dir() {
        return Err(Fault::new("REPOSITORY_IDENTITY"));
    }
    Ok(format!("local:{}:{}", metadata.dev(), metadata.ino()))
}

pub fn target(root: &Path, name: &str, create: bool) -> Result<PathBuf> {
    let name_path = Path::new(name);
    if name.is_empty()
        || name == "."
        || name_path.is_absolute()
        || name.split('/').any(|part| part == "..")
    {
        return Err(Fault::new("PROJECT_PATH"));
    }
    if create
        && (name.len() > 100
            || !name.bytes().enumerate().all(|(i, b)| {
                b.is_ascii_alphanumeric() || b == b'_' || (i > 0 && b".-".contains(&b))
            }))
    {
        return Err(Fault::new("PROJECT_NAME"));
    }
    let resolved = fs::canonicalize(root).map_err(|_| Fault::new("PROJECT_PATH"))?;
    if resolved != root || root == Path::new("/") {
        return Err(Fault::new("PROJECT_PATH"));
    }
    let path = root.join(name);
    if create {
        if path.symlink_metadata().is_ok() {
            return Err(Fault::new("PROJECT_EXISTS"));
        }
        writable(root)?;
        return Ok(path);
    }
    let path = fs::canonicalize(path).map_err(|_| Fault::new("PROJECT_NOT_FOUND"))?;
    if path == root || !path.starts_with(root) {
        return Err(Fault::new("PROJECT_PATH"));
    }
    Ok(path)
}

fn writable(path: &Path) -> Result<()> {
    let path = CString::new(path.as_os_str().as_bytes()).map_err(|_| Fault::new("PROJECT_PATH"))?;
    // SAFETY: path is a live NUL-terminated string, access does not retain it.
    if unsafe { libc::access(path.as_ptr(), libc::W_OK | libc::X_OK) } != 0 {
        return Err(Fault::new("PROJECT_NOT_WRITABLE"));
    }
    Ok(())
}

fn at(path: &Path, args: &[&str], check: bool) -> Result<Output> {
    run(
        command(None).arg("-C").arg(path).args(args),
        &[],
        UTILITY_TIMEOUT,
        OUTPUT_LIMIT,
        check,
    )
}

pub fn describe(root: &Path, name: &str, namespace: &str) -> Result<LocalProject> {
    let target = target(root, name, false)?;
    let checkout_identity = path_identity(&target)?;
    let common = at(
        &target,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
        false,
    )?;
    if !common.status.success() {
        return Err(Fault::new("GIT_PROJECT_REQUIRED"));
    }
    let remote =
        fs::canonicalize(line(&common.stdout)?).map_err(|_| Fault::new("REPOSITORY_IDENTITY"))?;
    if !remote.starts_with(root) {
        return Err(Fault::new("PROJECT_PATH"));
    }
    let identity = path_identity(&remote)?;
    writable(&remote)?;
    let bare = at(&target, &["rev-parse", "--is-bare-repository"], true)?;
    let checkout = if line(&bare.stdout)? == "true" {
        None
    } else {
        let top = at(&target, &["rev-parse", "--show-toplevel"], true)?;
        if fs::canonicalize(line(&top.stdout)?).map_err(|_| Fault::new("PROJECT_PATH"))? != target {
            return Err(Fault::new("PROJECT_PATH"));
        }
        Some(target.clone())
    };
    let head = at(&target, &["symbolic-ref", "-q", "HEAD"], false)?;
    if !head.status.success() {
        return Err(Fault::new("BASE_REF_REQUIRED"));
    }
    let branch =
        BranchRef::new(line(&head.stdout)?).map_err(|_| Fault::new("BASE_REF_REQUIRED"))?;
    if branch.as_str().starts_with(namespace) || namespace.starts_with(&format!("{branch}/")) {
        return Err(Fault::new("BASE_REF_REQUIRED"));
    }
    if path_identity(&target)? != checkout_identity
        || path_identity(&remote)? != identity
        || fs::canonicalize(&target).map_err(|_| Fault::new("REPOSITORY_IDENTITY"))? != target
    {
        return Err(Fault::new("REPOSITORY_IDENTITY"));
    }
    Ok(LocalProject {
        remote,
        identity,
        checkout_identity: checkout.as_ref().map(|_| checkout_identity),
        checkout,
        branch,
    })
}

/// Caller has durably recorded creation uncertainty before entering this method.
pub fn initialize(path: &Path, name: &str) -> Result<()> {
    DirBuilder::new().mode(0o700).create(path).map_err(|e| {
        Fault::new(if e.kind() == std::io::ErrorKind::AlreadyExists {
            "PROJECT_EXISTS"
        } else {
            "PROJECT_NOT_WRITABLE"
        })
    })?;
    File::open(path.parent().ok_or_else(|| Fault::new("PROJECT_PATH"))?)
        .and_then(|f| f.sync_all())
        .map_err(|_| Fault::new("PROJECT_IO"))?;
    at(path, &["init", "--template=", "-b", "main"], true)?;
    let readme = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path.join("README.md"))
        .map_err(|_| Fault::new("PROJECT_IO"))?;
    use std::io::Write;
    (&readme)
        .write_all(format!("# {name}\n").as_bytes())
        .and_then(|_| readme.sync_all())
        .map_err(|_| Fault::new("PROJECT_IO"))?;
    at(path, &["add", "--", "README.md"], true)?;
    at(
        path,
        &[
            "-c",
            "commit.gpgSign=false",
            "commit",
            "-m",
            "Initialize project",
        ],
        true,
    )?;
    File::open(path)
        .and_then(|f| f.sync_all())
        .map_err(|_| Fault::new("PROJECT_IO"))?;
    Ok(())
}

pub fn seal(project: &LocalProject, id: &OperationId) -> Result<()> {
    let repository = LocalRepository::new(
        project.remote.clone(),
        project.identity.clone(),
        true,
        BTreeSet::from([project.branch.clone()]),
        vec![],
    )?;
    repository.verify()?;
    utility(
        Some(&project.remote),
        &["config", "--local", "tdev.creationId", id.as_str()],
        &[],
        UTILITY_TIMEOUT,
        true,
    )?;
    // Git config is atomically renamed; also sync it and its directory before
    // treating this marker as durable evidence that initialization completed.
    fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(project.remote.join("config"))
        .and_then(|f| f.sync_all())
        .map_err(|_| Fault::new("PROJECT_IO"))?;
    File::open(&project.remote)
        .and_then(|f| f.sync_all())
        .map_err(|_| Fault::new("PROJECT_IO"))?;
    repository.verify()?;
    Ok(())
}

pub fn sealed(remote: &Path, id: &OperationId) -> Result<bool> {
    let marker = utility(
        Some(remote),
        &["config", "--local", "--get", "tdev.creationId"],
        &[],
        UTILITY_TIMEOUT,
        false,
    )?;
    Ok(marker.status.success() && line(&marker.stdout)? == id.as_str())
}
