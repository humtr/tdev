//! Private Git objects and atomic source construction. Authority and durable task
//! CAS belong to admission/storage; these methods never update an enrolled ref.
pub mod checkout;
pub mod integration;
mod process;
pub mod project;

use crate::model::{BlobId, BranchRef, Checkpoint, Fault, OperationId, Result, SourcePath, TreeId};
use process::{OUTPUT_LIMIT, Output, run};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, DirBuilder, File};
use std::os::unix::fs::{DirBuilderExt, MetadataExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

const BLOB_LIMIT: usize = 16 * 1024 * 1024;
const SOURCE_LIMIT: usize = 32 * 1024 * 1024;
const UTILITY_TIMEOUT: Duration = Duration::from_secs(30);
const FETCH_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObjectFormat {
    Sha1,
    Sha256,
}

impl ObjectFormat {
    fn parse(value: &str) -> Result<Self> {
        match value {
            "sha1" => Ok(Self::Sha1),
            "sha256" => Ok(Self::Sha256),
            _ => Err(Fault::new("OBJECT_FORMAT")),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Sha1 => "sha1",
            Self::Sha256 => "sha256",
        }
    }

    fn check(self, oid: &str) -> Result<()> {
        let length = match self {
            Self::Sha1 => 40,
            Self::Sha256 => 64,
        };
        if oid.len() != length {
            return Err(Fault::new("OBJECT_FORMAT"));
        }
        Checkpoint::new(oid)?;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FileMode {
    File,
    Executable,
    Symlink,
}

impl FileMode {
    fn parse(value: &str) -> Result<Self> {
        match value {
            "100644" => Ok(Self::File),
            "100755" => Ok(Self::Executable),
            "120000" => Ok(Self::Symlink),
            _ => Err(Fault::new("UNSUPPORTED_GITLINK")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::File => "100644",
            Self::Executable => "100755",
            Self::Symlink => "120000",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct Entry {
    pub mode: FileMode,
    pub blob: BlobId,
}

impl serde::Serialize for FileMode {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

pub type Entries = BTreeMap<SourcePath, Entry>;

/// Already-decoded edits. The transport must validate the canonical wire schema
/// before constructing these values; optional JSON fields are not redefined here.
#[derive(Clone, Debug)]
pub enum Edit {
    Put {
        path: SourcePath,
        data: Vec<u8>,
        mode: FileMode,
        before: Option<BlobId>,
    },
    Replace {
        path: SourcePath,
        old: String,
        text: String,
        count: usize,
    },
    Delete {
        path: SourcePath,
        before: BlobId,
    },
    Move {
        path: SourcePath,
        to: SourcePath,
        before: BlobId,
    },
}

impl Edit {
    fn path(&self) -> &SourcePath {
        match self {
            Self::Put { path, .. }
            | Self::Replace { path, .. }
            | Self::Delete { path, .. }
            | Self::Move { path, .. } => path,
        }
    }
}

/// Operator-enrolled local identity. This carries configured ref scope only;
/// principal grants and managed-task ownership still require fresh admission.
#[derive(Clone, Debug)]
pub struct LocalRepository {
    remote: PathBuf,
    identity: String,
    allow_worktree: bool,
    refs: BTreeSet<BranchRef>,
    namespaces: Vec<String>,
}

impl LocalRepository {
    pub fn new(
        remote: PathBuf,
        identity: String,
        allow_worktree: bool,
        refs: BTreeSet<BranchRef>,
        namespaces: Vec<String>,
    ) -> Result<Self> {
        if !remote.is_absolute() {
            return Err(Fault::new("REPOSITORY_IDENTITY"));
        }
        for namespace in &namespaces {
            if !namespace.ends_with('/')
                || BranchRef::new(format!("{namespace}probe")).is_err()
                || refs.iter().any(|r| {
                    r.as_str().starts_with(namespace) || namespace.starts_with(&format!("{r}/"))
                })
            {
                return Err(Fault::new("CONFIG"));
            }
        }
        Ok(Self {
            remote,
            identity,
            allow_worktree,
            refs,
            namespaces,
        })
    }

    fn allowed(&self, branch: &BranchRef) -> bool {
        self.refs.contains(branch)
            || self
                .namespaces
                .iter()
                .any(|ns| branch.as_str().starts_with(ns))
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    /// Resolve/stat rather than trust a cached project label. Path identity is
    /// checked again around fetch; a retained config is not an evergreen grant.
    pub fn verify(&self) -> Result<ObjectFormat> {
        let path = fs::canonicalize(&self.remote).map_err(|_| Fault::new("REPOSITORY_IDENTITY"))?;
        let metadata = fs::metadata(&path).map_err(|_| Fault::new("REPOSITORY_IDENTITY"))?;
        if path != self.remote
            || !metadata.is_dir()
            || format!("local:{}:{}", metadata.dev(), metadata.ino()) != self.identity
        {
            return Err(Fault::new("REPOSITORY_IDENTITY"));
        }
        let bare = utility(
            Some(&path),
            &["rev-parse", "--is-bare-repository"],
            &[],
            UTILITY_TIMEOUT,
            true,
        )?;
        match line(&bare.stdout)? {
            "true" => {}
            "false" if self.allow_worktree => {}
            "false" => return Err(Fault::new("BARE_REQUIRED")),
            _ => return Err(Fault::new("GIT_OUTPUT")),
        }
        let output = utility(
            Some(&path),
            &["rev-parse", "--show-object-format"],
            &[],
            UTILITY_TIMEOUT,
            true,
        )?;
        ObjectFormat::parse(line(&output.stdout)?)
    }
}

pub struct Git {
    root: PathBuf,
    repository: LocalRepository,
    format: ObjectFormat,
}

fn line(bytes: &[u8]) -> Result<&str> {
    std::str::from_utf8(bytes)
        .map(str::trim)
        .map_err(|_| Fault::new("GIT_OUTPUT"))
}

fn command(root: Option<&Path>) -> Command {
    let mut command = Command::new("git");
    command.env_clear();
    for name in ["PATH", "TMPDIR", "PREFIX", "HOME", "LD_LIBRARY_PATH"] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    command.envs([
        ("GIT_CONFIG_NOSYSTEM", "1"),
        ("GIT_CONFIG_GLOBAL", "/dev/null"),
        ("GIT_TERMINAL_PROMPT", "0"),
        ("GIT_ATTR_NOSYSTEM", "1"),
        ("GIT_NO_REPLACE_OBJECTS", "1"),
        ("GIT_AUTHOR_NAME", "tdev"),
        ("GIT_AUTHOR_EMAIL", "tdev@localhost"),
        ("GIT_COMMITTER_NAME", "tdev"),
        ("GIT_COMMITTER_EMAIL", "tdev@localhost"),
    ]);
    if let Some(path) = root {
        command.arg("--git-dir").arg(path);
    }
    command.args([
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.fsync=loose-object,pack,pack-metadata,reference",
        "-c",
        "core.fsyncMethod=fsync",
        "-c",
        "core.filesRefLockTimeout=5000",
        "-c",
        "gc.auto=0",
        "-c",
        "http.followRedirects=false",
    ]);
    command
}

fn utility(
    root: Option<&Path>,
    args: &[&str],
    input: &[u8],
    timeout: Duration,
    check: bool,
) -> Result<Output> {
    run(
        command(root).args(args),
        input,
        timeout,
        OUTPUT_LIMIT,
        check,
    )
}

fn private_directory(path: &Path) -> Result<()> {
    let metadata = path
        .symlink_metadata()
        .map_err(|_| Fault::new("GIT_STORE"))?;
    // SAFETY: getuid has no pointer or memory preconditions.
    let uid = unsafe { libc::getuid() };
    if !metadata.is_dir() || metadata.uid() != uid || metadata.mode() & 0o077 != 0 {
        return Err(Fault::new("GIT_STORE"));
    }
    Ok(())
}

fn store_layout(root: &Path) -> Result<()> {
    private_directory(root)?;
    for (name, directory) in [
        ("HEAD", false),
        ("config", false),
        ("objects", true),
        ("refs", true),
    ] {
        let metadata = root
            .join(name)
            .symlink_metadata()
            .map_err(|_| Fault::new("GIT_STORE"))?;
        if metadata.file_type().is_symlink()
            || if directory {
                !metadata.is_dir()
            } else {
                !metadata.is_file()
            }
        {
            return Err(Fault::new("GIT_STORE"));
        }
    }
    Ok(())
}

fn sync_directory(path: &Path) -> Result<()> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| Fault::new("GIT_STORE"))
}

// Only called on a freshly initialized, private temporary repository. Harden its
// files and directories before making its enrolled name visible to another opener.
fn sync_initialized_store(path: &Path) -> Result<()> {
    for entry in fs::read_dir(path).map_err(|_| Fault::new("GIT_STORE"))? {
        let entry = entry.map_err(|_| Fault::new("GIT_STORE"))?;
        let kind = entry.file_type().map_err(|_| Fault::new("GIT_STORE"))?;
        if kind.is_dir() {
            sync_initialized_store(&entry.path())?;
        } else if kind.is_file() {
            File::open(entry.path())
                .and_then(|file| file.sync_all())
                .map_err(|_| Fault::new("GIT_STORE"))?;
        } else {
            return Err(Fault::new("GIT_STORE"));
        }
    }
    sync_directory(path)
}

fn no_collisions<'a>(names: impl Iterator<Item = &'a SourcePath>) -> Result<()> {
    let names: BTreeSet<&str> = names.map(SourcePath::as_str).collect();
    for name in &names {
        for (at, _) in name.match_indices('/') {
            if names.contains(&name[..at]) {
                return Err(Fault::new("PATH_COLLISION"));
            }
        }
    }
    Ok(())
}

impl Git {
    /// Publish an initialized bare directory by same-parent rename. A racing
    /// opener validates the winner rather than using a half-initialized store.
    pub fn open(root: &Path, repository: LocalRepository) -> Result<Self> {
        if !root.is_absolute() {
            return Err(Fault::new("GIT_STORE"));
        }
        let format = repository.verify()?;
        let parent = root.parent().ok_or_else(|| Fault::new("GIT_STORE"))?;
        DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(parent)
            .map_err(|_| Fault::new("GIT_STORE"))?;
        private_directory(parent)?;
        match root.symlink_metadata() {
            Ok(_) => private_directory(root)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let temporary = tempfile::Builder::new()
                    .prefix("objects-")
                    .tempdir_in(parent)
                    .map_err(|_| Fault::new("GIT_STORE"))?;
                let mut init = command(None);
                init.args([
                    "init",
                    "--bare",
                    "--template=",
                    &format!("--object-format={}", format.name()),
                ])
                .arg(temporary.path());
                run(&mut init, &[], UTILITY_TIMEOUT, OUTPUT_LIMIT, true)?;
                sync_initialized_store(temporary.path())?;
                match fs::rename(temporary.path(), root) {
                    Ok(()) => sync_directory(parent)?,
                    Err(error)
                        if matches!(error.raw_os_error(), Some(libc::EEXIST | libc::ENOTEMPTY)) =>
                    {
                        private_directory(root)?
                    }
                    Err(_) => return Err(Fault::new("GIT_STORE")),
                }
            }
            Err(_) => return Err(Fault::new("GIT_STORE")),
        }
        store_layout(root)?;
        let store = Self {
            root: root.to_owned(),
            repository,
            format,
        };
        if line(
            &store
                .call(&["rev-parse", "--is-bare-repository"], &[])?
                .stdout,
        )? != "true"
            || ObjectFormat::parse(line(
                &store
                    .call(&["rev-parse", "--show-object-format"], &[])?
                    .stdout,
            )?)? != format
        {
            return Err(Fault::new("GIT_STORE"));
        }
        Ok(store)
    }

    pub fn object_format(&self) -> ObjectFormat {
        self.format
    }

    pub fn verify_identity(&self) -> Result<()> {
        if self.repository.verify()? != self.format {
            return Err(Fault::new("OBJECT_FORMAT"));
        }
        Ok(())
    }

    fn call(&self, args: &[&str], input: &[u8]) -> Result<Output> {
        utility(Some(&self.root), args, input, UTILITY_TIMEOUT, true)
    }

    pub fn head(&self, branch: &BranchRef) -> Result<Option<Checkpoint>> {
        self.verify_identity()?;
        if !self.repository.allowed(branch) {
            return Err(Fault::new("REF_DENIED"));
        }
        let symbolic = utility(
            Some(&self.repository.remote),
            &["symbolic-ref", "-q", branch.as_str()],
            &[],
            UTILITY_TIMEOUT,
            false,
        )?;
        if symbolic.status.success() {
            return Err(Fault::new("SYMBOLIC_REF"));
        }
        if symbolic.status.code() != Some(1) {
            return Err(Fault::new("GIT_OUTPUT"));
        }
        let mut cmd = command(Some(&self.root));
        cmd.args(["ls-remote", "--refs", "--"])
            .arg(&self.repository.remote)
            .arg(branch.as_str());
        let output = run(&mut cmd, &[], UTILITY_TIMEOUT, OUTPUT_LIMIT, true)?;
        self.verify_identity()?;
        let text = line(&output.stdout)?;
        if text.is_empty() {
            return Ok(None);
        }
        let mut parts = text.split_whitespace();
        let oid = parts.next().ok_or_else(|| Fault::new("REF_NOT_FOUND"))?;
        if parts.next() != Some(branch.as_str()) || parts.next().is_some() {
            return Err(Fault::new("REF_NOT_FOUND"));
        }
        self.format.check(oid)?;
        Ok(Some(Checkpoint::new(oid)?))
    }

    pub fn fetch(&self, branch: &BranchRef, expected: &Checkpoint) -> Result<()> {
        self.format.check(expected.as_str())?;
        let current = self
            .head(branch)?
            .ok_or_else(|| Fault::new("REF_NOT_FOUND"))?;
        if &current != expected {
            return Err(Fault::new("STALE_HEAD"));
        }
        let mut cmd = command(Some(&self.root));
        cmd.args(["fetch", "--no-tags", "--no-write-fetch-head", "--"])
            .arg(&self.repository.remote)
            .arg(expected.as_str());
        run(&mut cmd, &[], FETCH_TIMEOUT, OUTPUT_LIMIT, true)?;
        self.verify_identity()?;
        if line(
            &self
                .call(&["cat-file", "-t", expected.as_str()], &[])?
                .stdout,
        )? != "commit"
        {
            return Err(Fault::new("COMMIT_REQUIRED"));
        }
        self.pin(expected)
    }

    fn pin(&self, oid: &Checkpoint) -> Result<()> {
        self.format.check(oid.as_str())?;
        self.call(
            &[
                "update-ref",
                &format!("refs/tdev/objects/{oid}"),
                oid.as_str(),
            ],
            &[],
        )?;
        Ok(())
    }

    pub fn tree(&self, checkpoint: &Checkpoint) -> Result<TreeId> {
        self.format.check(checkpoint.as_str())?;
        let output = self.call(&["rev-parse", &format!("{checkpoint}^{{tree}}")], &[])?;
        let oid = line(&output.stdout)?;
        self.format.check(oid)?;
        TreeId::new(oid)
    }

    pub fn entries(&self, checkpoint: &Checkpoint) -> Result<Entries> {
        self.format.check(checkpoint.as_str())?;
        let output = self.call(&["ls-tree", "-rz", checkpoint.as_str()], &[])?;
        let mut entries = Entries::new();
        for record in output.stdout.split(|b| *b == 0).filter(|r| !r.is_empty()) {
            let tab = record
                .iter()
                .position(|b| *b == b'\t')
                .ok_or_else(|| Fault::new("GIT_OUTPUT"))?;
            let mut fields = line(&record[..tab])?.split_whitespace();
            let mode = FileMode::parse(fields.next().ok_or_else(|| Fault::new("GIT_OUTPUT"))?)?;
            if fields.next() != Some("blob") {
                return Err(Fault::new("UNSUPPORTED_GITLINK"));
            }
            let oid = fields.next().ok_or_else(|| Fault::new("GIT_OUTPUT"))?;
            if fields.next().is_some() {
                return Err(Fault::new("GIT_OUTPUT"));
            }
            self.format.check(oid)?;
            // Do not trim names: trailing spaces and newlines are source bytes,
            // and the path constructor explicitly rejects control characters.
            let path = SourcePath::new(
                std::str::from_utf8(&record[tab + 1..]).map_err(|_| Fault::new("PATH"))?,
            )?;
            if entries
                .insert(
                    path,
                    Entry {
                        mode,
                        blob: BlobId::new(oid)?,
                    },
                )
                .is_some()
            {
                return Err(Fault::new("GIT_OUTPUT"));
            }
        }
        Ok(entries)
    }

    pub fn blob(&self, blob: &BlobId) -> Result<Vec<u8>> {
        self.format.check(blob.as_str())?;
        let size = line(&self.call(&["cat-file", "-s", blob.as_str()], &[])?.stdout)?
            .parse::<usize>()
            .map_err(|_| Fault::new("GIT_OUTPUT"))?;
        if size > BLOB_LIMIT {
            return Err(Fault::new("SOURCE_LIMIT"));
        }
        let data = self.call(&["cat-file", "blob", blob.as_str()], &[])?.stdout;
        if data.len() != size {
            return Err(Fault::new("GIT_OUTPUT"));
        }
        Ok(data)
    }

    fn hash_blob(&self, data: &[u8]) -> Result<BlobId> {
        if data.len() > SOURCE_LIMIT {
            return Err(Fault::new("SOURCE_LIMIT"));
        }
        let output = self.call(&["hash-object", "-w", "--stdin"], data)?;
        let oid = line(&output.stdout)?;
        self.format.check(oid)?;
        BlobId::new(oid)
    }

    fn write_tree(&self, entries: &Entries) -> Result<TreeId> {
        no_collisions(entries.keys())?;
        let temporary = tempfile::Builder::new()
            .prefix("index-")
            .tempdir_in(&self.root)
            .map_err(|_| Fault::new("GIT_STORE"))?;
        let index = temporary.path().join("index");
        let indexed = |args: &[&str], input: &[u8]| {
            run(
                command(Some(&self.root))
                    .env("GIT_INDEX_FILE", &index)
                    .args(args),
                input,
                UTILITY_TIMEOUT,
                OUTPUT_LIMIT,
                true,
            )
        };
        indexed(&["read-tree", "--empty"], &[])?;
        let mut listing = Vec::new();
        for (path, entry) in entries {
            self.format.check(entry.blob.as_str())?;
            listing.extend_from_slice(
                format!("{} {}\t{}", entry.mode.as_str(), entry.blob, path).as_bytes(),
            );
            listing.push(0);
        }
        indexed(&["update-index", "-z", "--index-info"], &listing)?;
        let output = indexed(&["write-tree"], &[])?;
        let oid = line(&output.stdout)?;
        self.format.check(oid)?;
        TreeId::new(oid)
    }

    fn commit(&self, tree: &TreeId, parent: &Checkpoint, message: &str) -> Result<Checkpoint> {
        self.format.check(tree.as_str())?;
        self.format.check(parent.as_str())?;
        let output = self.call(
            &["commit-tree", tree.as_str(), "-p", parent.as_str()],
            message.as_bytes(),
        )?;
        let oid = line(&output.stdout)?;
        self.format.check(oid)?;
        let checkpoint = Checkpoint::new(oid)?;
        self.pin(&checkpoint)?;
        Ok(checkpoint)
    }

    pub fn edit(
        &self,
        checkpoint: &Checkpoint,
        edits: &[Edit],
        operation: &OperationId,
    ) -> Result<Checkpoint> {
        if edits.is_empty() || edits.len() > 256 {
            return Err(Fault::new("EDIT_LIMIT"));
        }
        let mut entries = self.entries(checkpoint)?;
        let mut touched = BTreeSet::new();
        let mut puts = BTreeMap::new();
        for edit in edits {
            let path = edit.path();
            if !touched.insert(path.clone()) {
                return Err(Fault::new("DUPLICATE_PATH"));
            }
            let previous = entries.get(path).cloned();
            match edit {
                Edit::Put {
                    data, mode, before, ..
                } => {
                    if previous.as_ref().map(|e| &e.blob) != before.as_ref() {
                        return Err(Fault::new("EDIT_CONFLICT"));
                    }
                    if data.len() > BLOB_LIMIT {
                        return Err(Fault::new("SOURCE_LIMIT"));
                    }
                    puts.insert(path.clone(), (*mode, data.clone()));
                }
                Edit::Replace {
                    old, text, count, ..
                } => {
                    if old.is_empty() || !(1..=10000).contains(count) {
                        return Err(Fault::new("EDIT_CONFLICT"));
                    }
                    let previous = previous
                        .filter(|entry| entry.mode != FileMode::Symlink)
                        .ok_or_else(|| Fault::new("EDIT_CONFLICT"))?;
                    let data = self.blob(&previous.blob)?;
                    let contents =
                        std::str::from_utf8(&data).map_err(|_| Fault::new("SOURCE_ENCODING"))?;
                    if contents.matches(old).count() != *count {
                        return Err(Fault::new("EDIT_CONFLICT"));
                    }
                    let removed = count
                        .checked_mul(old.len())
                        .ok_or_else(|| Fault::new("SOURCE_LIMIT"))?;
                    let inserted = count
                        .checked_mul(text.len())
                        .ok_or_else(|| Fault::new("SOURCE_LIMIT"))?;
                    let size = contents
                        .len()
                        .checked_sub(removed)
                        .and_then(|n| n.checked_add(inserted))
                        .ok_or_else(|| Fault::new("SOURCE_LIMIT"))?;
                    if size > BLOB_LIMIT {
                        return Err(Fault::new("SOURCE_LIMIT"));
                    }
                    let data = contents.replace(old, text).into_bytes();
                    puts.insert(path.clone(), (previous.mode, data));
                }
                Edit::Delete { before, .. } => {
                    if previous.as_ref().map(|e| &e.blob) != Some(before) {
                        return Err(Fault::new("EDIT_CONFLICT"));
                    }
                    entries.remove(path);
                }
                Edit::Move { to, before, .. } => {
                    if path == to
                        || previous.as_ref().map(|e| &e.blob) != Some(before)
                        || entries.contains_key(to)
                    {
                        return Err(Fault::new("EDIT_CONFLICT"));
                    }
                    if !touched.insert(to.clone()) {
                        return Err(Fault::new("DUPLICATE_PATH"));
                    }
                    let entry = entries.remove(path).unwrap();
                    entries.insert(to.clone(), entry);
                }
            }
        }
        let names: BTreeSet<&SourcePath> = entries.keys().chain(puts.keys()).collect();
        no_collisions(names.into_iter())?;
        // Validate the entire batch before writing any new objects. Only this
        // private tree/commit changes; SQLite pointer + receipt are a later CAS.
        for (path, (mode, data)) in puts {
            entries.insert(
                path,
                Entry {
                    mode,
                    blob: self.hash_blob(&data)?,
                },
            );
        }
        self.commit(
            &self.write_tree(&entries)?,
            checkpoint,
            &format!("checkpoint {operation}"),
        )
    }

    pub fn is_ancestor(&self, ancestor: &Checkpoint, checkpoint: &Checkpoint) -> Result<bool> {
        self.format.check(ancestor.as_str())?;
        self.format.check(checkpoint.as_str())?;
        let output = utility(
            Some(&self.root),
            &[
                "merge-base",
                "--is-ancestor",
                ancestor.as_str(),
                checkpoint.as_str(),
            ],
            &[],
            UTILITY_TIMEOUT,
            false,
        )?;
        match output.status.code() {
            Some(0) => Ok(true),
            Some(1) => Ok(false),
            _ => Err(Fault::message(
                "GIT_OUTPUT",
                String::from_utf8_lossy(&output.stderr),
            )),
        }
    }

    pub fn diff(
        &self,
        base: &Checkpoint,
        checkpoint: &Checkpoint,
        format: DiffFormat,
        path: Option<&SourcePath>,
    ) -> Result<Vec<u8>> {
        self.format.check(base.as_str())?;
        self.format.check(checkpoint.as_str())?;
        let mut args = vec![
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            format.flag(),
            base.as_str(),
            checkpoint.as_str(),
            "--",
        ];
        let literal = path.map(|path| format!(":(literal){path}"));
        if let Some(path) = &literal {
            args.push(path);
        }
        Ok(self.call(&args, &[])?.stdout)
    }

    pub fn history(&self, checkpoint: &Checkpoint) -> Result<Vec<u8>> {
        self.format.check(checkpoint.as_str())?;
        Ok(self
            .call(&["log", "-20", "--format=%H %s", checkpoint.as_str()], &[])?
            .stdout)
    }

    /// Safely-stopped execution capture imports an already validated file set.
    /// Unchanged trees preserve the CAS token; real changes receive new commits.
    pub fn capture(
        &self,
        checkpoint: &Checkpoint,
        files: &BTreeMap<SourcePath, (FileMode, Vec<u8>)>,
        operation: &OperationId,
    ) -> Result<Checkpoint> {
        if files.len() > 100000 {
            return Err(Fault::new("CAPTURE_LIMIT"));
        }
        no_collisions(files.keys())?;
        let total = files
            .values()
            .try_fold(0usize, |total, (_, data)| total.checked_add(data.len()))
            .ok_or_else(|| Fault::new("CAPTURE_LIMIT"))?;
        if total > SOURCE_LIMIT {
            return Err(Fault::new("CAPTURE_LIMIT"));
        }
        let mut entries = Entries::new();
        for (path, (mode, data)) in files {
            entries.insert(
                path.clone(),
                Entry {
                    mode: *mode,
                    blob: self.hash_blob(data)?,
                },
            );
        }
        let tree = self.write_tree(&entries)?;
        if tree == self.tree(checkpoint)? {
            return Ok(checkpoint.clone());
        }
        self.commit(&tree, checkpoint, &format!("capture {operation}"))
    }
}

#[derive(Clone, Copy, Debug)]
pub enum DiffFormat {
    Stat,
    Patch,
    Names,
}

impl DiffFormat {
    fn flag(self) -> &'static str {
        match self {
            Self::Stat => "--stat",
            Self::Patch => "--patch",
            Self::Names => "--name-status",
        }
    }
}
