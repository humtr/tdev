//! Read an enrolled checkout through directory descriptors; never mutate its index.
use super::*;
use crate::identity;
use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};
use std::ffi::CString;
use std::io;
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::unix::fs::OpenOptionsExt;

type Signature = (u64, u64, u32, u64, i64, i64, i64, i64);
type Files = Entries;

#[derive(PartialEq)]
struct Selection {
    names: BTreeSet<SourcePath>,
    raw: [Vec<u8>; 3],
}

#[derive(PartialEq)]
struct Scan {
    files: Files,
    signatures: BTreeMap<SourcePath, Option<Signature>>,
    selected: Selection,
    contents: BTreeMap<SourcePath, [u8; 32]>,
}

pub struct Checkout<'a> {
    git: &'a Git,
    root: PathBuf,
    identity: String,
}

fn changed(_: io::Error) -> Fault {
    Fault::new("CHECKOUT_CHANGED")
}

fn signature(metadata: &fs::Metadata) -> Signature {
    (
        metadata.dev(),
        metadata.ino(),
        metadata.mode(),
        metadata.size(),
        metadata.mtime(),
        metadata.mtime_nsec(),
        metadata.ctime(),
        metadata.ctime_nsec(),
    )
}

fn open_at(parent: &File, name: &str, flags: i32) -> io::Result<File> {
    let name = CString::new(name).map_err(|_| io::Error::from(io::ErrorKind::InvalidInput))?;
    // SAFETY: parent is a live directory descriptor and name is NUL terminated.
    // No creation flag is passed. On success ownership of the new descriptor is transferred.
    let fd = unsafe {
        libc::openat(
            parent.as_raw_fd(),
            name.as_ptr(),
            flags | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: openat returned a fresh descriptor exclusively owned by this function.
    Ok(unsafe { File::from_raw_fd(fd) })
}

fn safe_link(path: &SourcePath, target: &str) -> Result<()> {
    if target.starts_with('/') || target.chars().any(|c| c < ' ' || c == '\\') {
        return Err(Fault::new("CHECKOUT_SYMLINK"));
    }
    let mut parts: Vec<&str> = path.as_str().split('/').collect();
    parts.pop();
    for part in target.split('/') {
        match part {
            ".." => {
                if parts.pop().is_none() {
                    return Err(Fault::new("CHECKOUT_SYMLINK"));
                }
            }
            "" | "." => {}
            part => parts.push(part),
        }
    }
    if parts.iter().any(|part| {
        part.trim_end_matches([' ', '.'])
            .eq_ignore_ascii_case(".git")
    }) {
        return Err(Fault::new("CHECKOUT_SYMLINK"));
    }
    Ok(())
}

impl<'a> Checkout<'a> {
    pub fn new(git: &'a Git, root: Option<&str>, identity: Option<&str>) -> Result<Self> {
        let (Some(root), Some(identity)) = (root, identity) else {
            return Err(Fault::new("CHECKOUT_REQUIRED"));
        };
        Ok(Self {
            git,
            root: root.into(),
            identity: identity.into(),
        })
    }

    fn call(&self, args: &[&str], check: bool) -> Result<Output> {
        run(
            command(None)
                .arg("-C")
                .arg(&self.root)
                .args([
                    "-c",
                    "core.fsmonitor=false",
                    "-c",
                    "core.untrackedCache=false",
                ])
                .env("GIT_OPTIONAL_LOCKS", "0")
                .args(args),
            &[],
            UTILITY_TIMEOUT,
            OUTPUT_LIMIT,
            check,
        )
    }

    fn verify(&self, base: &Checkpoint, branch: &BranchRef) -> Result<()> {
        let resolved = fs::canonicalize(&self.root).map_err(|_| Fault::new("CHECKOUT_IDENTITY"))?;
        let metadata = fs::metadata(&self.root).map_err(|_| Fault::new("CHECKOUT_IDENTITY"))?;
        if resolved != self.root
            || !metadata.is_dir()
            || format!("local:{}:{}", metadata.dev(), metadata.ino()) != self.identity
        {
            return Err(Fault::new("CHECKOUT_IDENTITY"));
        }
        let common = self.call(
            &["rev-parse", "--path-format=absolute", "--git-common-dir"],
            true,
        )?;
        if fs::canonicalize(line(&common.stdout)?).map_err(|_| Fault::new("CHECKOUT_IDENTITY"))?
            != self.git.repository.local()?.remote
        {
            return Err(Fault::new("CHECKOUT_IDENTITY"));
        }
        self.git.verify_identity()?;
        if line(&self.call(&["rev-parse", "--show-toplevel"], true)?.stdout)?
            != self
                .root
                .to_str()
                .ok_or_else(|| Fault::new("CHECKOUT_IDENTITY"))?
        {
            return Err(Fault::new("CHECKOUT_IDENTITY"));
        }
        let head = self.call(&["rev-parse", "--verify", "HEAD"], false)?;
        let source = self.call(&["symbolic-ref", "-q", "HEAD"], false)?;
        if !head.status.success()
            || !source.status.success()
            || line(&head.stdout)? != base.as_str()
            || line(&source.stdout)? != branch.as_str()
        {
            return Err(Fault::new("CHECKOUT_HEAD_CHANGED"));
        }
        Ok(())
    }

    fn selection(&self) -> Result<Selection> {
        let index = self.call(&["ls-files", "--stage", "-z"], true)?.stdout;
        let mut names = BTreeSet::new();
        let path = |bytes: &[u8]| {
            SourcePath::new(std::str::from_utf8(bytes).map_err(|_| Fault::new("PATH"))?)
        };
        for record in index.split(|b| *b == 0).filter(|r| !r.is_empty()) {
            let tab = record
                .iter()
                .position(|b| *b == b'\t')
                .ok_or_else(|| Fault::new("GIT_OUTPUT"))?;
            let fields: Vec<&str> = line(&record[..tab])?.split_whitespace().collect();
            if fields.len() != 3 {
                return Err(Fault::new("GIT_OUTPUT"));
            }
            if fields[2] != "0" {
                return Err(Fault::new("CHECKOUT_UNMERGED"));
            }
            FileMode::parse(fields[0])?;
            self.git.format.check(fields[1])?;
            names.insert(path(&record[tab + 1..])?);
        }
        let flags = self.call(&["ls-files", "-v", "-z"], true)?.stdout;
        if flags
            .split(|b| *b == 0)
            .any(|r| matches!(r.first(), Some(b's' | b'S')))
        {
            return Err(Fault::new("CHECKOUT_SPARSE"));
        }
        let others = self
            .call(&["ls-files", "--others", "--exclude-standard", "-z"], true)?
            .stdout;
        for name in others.split(|b| *b == 0).filter(|r| !r.is_empty()) {
            names.insert(path(name)?);
        }
        capacity::check(
            "SOURCE_LIMIT",
            "checkoutSelectionPaths",
            250000,
            names.len(),
        )?;
        Ok(Selection {
            names,
            raw: [index, flags, others],
        })
    }

    fn file(
        &self,
        root: &File,
        path: &SourcePath,
        cache: &mut BTreeMap<[u8; 32], BlobId>,
        write: bool,
    ) -> Result<Option<(Entry, Signature, [u8; 32])>> {
        fn read(
            git: &Git,
            parent: &File,
            part: &str,
            path: &SourcePath,
            leaf: File,
            cache: &mut BTreeMap<[u8; 32], BlobId>,
            write: bool,
        ) -> Result<(Entry, Signature, [u8; 32])> {
            let before = leaf.metadata().map_err(changed)?;
            let (mode, blob, content) = if before.file_type().is_symlink() {
                let name = CString::new(part).map_err(|_| Fault::new("PATH"))?;
                let mut bytes = vec![0u8; 4097];
                // SAFETY: parent and name are live; bytes is a writable buffer of its stated length.
                let size = unsafe {
                    libc::readlinkat(
                        parent.as_raw_fd(),
                        name.as_ptr(),
                        bytes.as_mut_ptr().cast(),
                        bytes.len(),
                    )
                };
                if size < 0 {
                    return Err(changed(io::Error::last_os_error()));
                }
                if size as usize == bytes.len() {
                    return Err(Fault::new("CHECKOUT_SYMLINK"));
                }
                bytes.truncate(size as usize);
                safe_link(
                    path,
                    std::str::from_utf8(&bytes).map_err(|_| Fault::new("CHECKOUT_SYMLINK"))?,
                )?;
                let content: [u8; 32] = Sha256::digest(&bytes).into();
                let blob = match cache.get(&content) {
                    Some(blob) => blob.clone(),
                    None if write => {
                        let blob = git.hash_blob(&bytes)?;
                        cache.insert(content, blob.clone());
                        blob
                    }
                    None => return Err(Fault::new("CHECKOUT_CHANGED")),
                };
                (FileMode::Symlink, blob, content)
            } else {
                if !before.is_file() {
                    return Err(Fault::new("CHECKOUT_FILE_TYPE"));
                }
                capacity::check(
                    "SOURCE_LIMIT",
                    "sourceFileBytes",
                    BLOB_LIMIT,
                    before.len().try_into().unwrap_or(usize::MAX),
                )?;
                let mut file =
                    open_at(parent, part, libc::O_RDONLY | libc::O_NONBLOCK).map_err(changed)?;
                if signature(&file.metadata().map_err(changed)?) != signature(&before) {
                    return Err(Fault::new("CHECKOUT_CHANGED"));
                }
                // The content witness and the private object must use the same bytes.
                // Metadata checks alone cannot attest a second read of a mutable file.
                let mut captured = if write {
                    Some(tempfile::tempfile_in(&git.root).map_err(changed)?)
                } else {
                    None
                };
                let mut digest = Sha256::new();
                let mut buffer = [0u8; 65536];
                let mut seen = 0u64;
                let started = std::time::Instant::now();
                loop {
                    if started.elapsed() > FETCH_TIMEOUT {
                        return Err(Fault::new("CHECKOUT_HASH_TIMEOUT"));
                    }
                    let size = file.read(&mut buffer).map_err(changed)?;
                    if size == 0 {
                        break;
                    }
                    seen += size as u64;
                    capacity::check(
                        "SOURCE_LIMIT",
                        "sourceFileBytes",
                        BLOB_LIMIT,
                        seen.try_into().unwrap_or(usize::MAX),
                    )?;
                    digest.update(&buffer[..size]);
                    if let Some(output) = captured.as_mut() {
                        output.write_all(&buffer[..size]).map_err(changed)?;
                    }
                }
                if seen != before.len() {
                    return Err(Fault::new("CHECKOUT_CHANGED"));
                }
                let content: [u8; 32] = digest.finalize().into();
                let blob = match cache.get(&content) {
                    Some(blob) => blob.clone(),
                    None if write => {
                        let blob = git.hash_blob_file(
                            captured
                                .as_ref()
                                .ok_or_else(|| Fault::new("CHECKOUT_CHANGED"))?,
                        )?;
                        cache.insert(content, blob.clone());
                        blob
                    }
                    None => return Err(Fault::new("CHECKOUT_CHANGED")),
                };
                if signature(&file.metadata().map_err(changed)?) != signature(&before) {
                    return Err(Fault::new("CHECKOUT_CHANGED"));
                }
                (
                    if before.mode() & 0o111 != 0 {
                        FileMode::Executable
                    } else {
                        FileMode::File
                    },
                    blob,
                    content,
                )
            };
            let after = open_at(parent, part, libc::O_PATH)
                .map_err(changed)?
                .metadata()
                .map_err(changed)?;
            if signature(&before) != signature(&after) {
                return Err(Fault::new("CHECKOUT_CHANGED"));
            }
            Ok((Entry { mode, blob }, signature(&after), content))
        }
        // Missing selected files represent unstaged deletion. Check absence through
        // the same no-follow directory walk, never by resolving a pathname outside it.
        let mut parent = root.try_clone().map_err(changed)?;
        let parts: Vec<&str> = path.as_str().split('/').collect();
        for (i, part) in parts.iter().enumerate() {
            let flags = if i + 1 == parts.len() {
                libc::O_PATH
            } else {
                libc::O_RDONLY | libc::O_DIRECTORY
            };
            match open_at(&parent, part, flags) {
                Ok(file) if i + 1 == parts.len() => {
                    return read(self.git, &parent, part, path, file, cache, write).map(Some);
                }
                Ok(file) => parent = file,
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(changed(error)),
            }
        }
        Err(Fault::new("PATH"))
    }

    fn scan(
        &self,
        base: &Checkpoint,
        branch: &BranchRef,
        cache: &mut BTreeMap<[u8; 32], BlobId>,
        write: bool,
    ) -> Result<Scan> {
        self.verify(base, branch)?;
        let selected = self.selection()?;
        let root = fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(&self.root)
            .map_err(changed)?;
        let metadata = root.metadata().map_err(changed)?;
        if format!("local:{}:{}", metadata.dev(), metadata.ino()) != self.identity {
            return Err(Fault::new("CHECKOUT_IDENTITY"));
        }
        let mut files = Files::new();
        let mut signatures = BTreeMap::new();
        let mut contents = BTreeMap::new();
        let mut total = 0usize;
        for name in &selected.names {
            if let Some((entry, signature, content)) = self.file(&root, name, cache, write)? {
                capacity::check("SOURCE_LIMIT", "sourceFiles", SOURCE_FILES, files.len() + 1)?;
                contents.insert(name.clone(), content);
                total = total.saturating_add(signature.3 as usize);
                capacity::check("SOURCE_LIMIT", "sourceBytes", SOURCE_LIMIT, total)?;
                signatures.insert(name.clone(), Some(signature));
                files.insert(name.clone(), entry);
            } else {
                signatures.insert(name.clone(), None);
            }
        }
        self.verify(base, branch)?;
        if self.selection()? != selected {
            return Err(Fault::new("CHECKOUT_CHANGED"));
        }
        Ok(Scan {
            files,
            signatures,
            selected,
            contents,
        })
    }

    pub fn capture(
        &self,
        base: &Checkpoint,
        branch: &BranchRef,
        operation: &OperationId,
    ) -> Result<(Checkpoint, Value)> {
        let mut cache = BTreeMap::new();
        let first = self.scan(base, branch, &mut cache, true)?;
        let second = self.scan(base, branch, &mut cache, false)?;
        if first != second {
            return Err(Fault::new("CHECKOUT_CHANGED"));
        }
        let checkpoint = self.git.capture_entries(base, &first.files, operation)?;
        let hex = |bytes: &Vec<u8>| bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let selected = identity::Value::parse(
            &json!(first.selected.raw.iter().map(hex).collect::<Vec<_>>()).to_string(),
        )?
        .fingerprint()?;
        Ok((
            checkpoint.clone(),
            json!({"head":base,"tree":self.git.tree(&checkpoint)?,"files":first.files.len(),"selectionDigest":selected}),
        ))
    }
}
