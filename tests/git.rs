//! Native, disposable Git fixtures. No reference runtime/helper is invoked.
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::os::unix::ffi::OsStringExt;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Barrier};
use tdev::git::{DiffFormat, Edit, FileMode, Git, LocalRepository, ObjectFormat};
use tdev::model::{BlobId, BranchRef, Checkpoint, OperationId, SourcePath};

fn git(root: Option<&Path>, args: &[&str]) -> String {
    let mut command = Command::new("git");
    command.env_clear();
    for key in ["PATH", "PREFIX", "TMPDIR", "LD_LIBRARY_PATH"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    command.envs([
        ("GIT_CONFIG_NOSYSTEM", "1"),
        ("GIT_CONFIG_GLOBAL", "/dev/null"),
        ("GIT_AUTHOR_NAME", "Fixture"),
        ("GIT_AUTHOR_EMAIL", "fixture@localhost"),
        ("GIT_COMMITTER_NAME", "Fixture"),
        ("GIT_COMMITTER_EMAIL", "fixture@localhost"),
        ("GIT_AUTHOR_DATE", "2026-01-01T00:00:00Z"),
        ("GIT_COMMITTER_DATE", "2026-01-01T00:00:00Z"),
    ]);
    if let Some(root) = root {
        command.current_dir(root);
    }
    let output = command
        .args(["-c", "core.hooksPath=/dev/null"])
        .args(args)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{:?}: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap().trim().into()
}

fn path(value: &str) -> SourcePath {
    SourcePath::new(value).unwrap()
}
fn operation(value: &str) -> OperationId {
    OperationId::new(value).unwrap()
}

struct Fixture {
    _root: tempfile::TempDir,
    work: PathBuf,
    remote: PathBuf,
    cache: PathBuf,
    head: Checkpoint,
    identity: String,
}

impl Fixture {
    fn new(format: &str) -> Self {
        let root = tempfile::tempdir().unwrap();
        let work = root.path().join("authored");
        git(
            None,
            &[
                "init",
                "--template=",
                &format!("--object-format={format}"),
                "-b",
                "main",
                work.to_str().unwrap(),
            ],
        );
        fs::write(work.join("a.txt"), b"hello\n").unwrap();
        fs::write(work.join("b.txt"), b"world\n").unwrap();
        git(Some(&work), &["add", "."]);
        git(Some(&work), &["commit", "-m", "fixture"]);
        let head = Checkpoint::new(git(Some(&work), &["rev-parse", "HEAD"])).unwrap();
        let remote = root.path().join("remote.git");
        git(
            None,
            &[
                "clone",
                "--bare",
                "--template=",
                "--no-hardlinks",
                work.to_str().unwrap(),
                remote.to_str().unwrap(),
            ],
        );
        let metadata = fs::metadata(&remote).unwrap();
        let identity = format!("local:{}:{}", metadata.dev(), metadata.ino());
        let cache = root.path().join("state/objects/test.git");
        Self {
            _root: root,
            work,
            remote,
            cache,
            head,
            identity,
        }
    }

    fn repository(&self) -> LocalRepository {
        LocalRepository::new(
            self.remote.clone(),
            self.identity.clone(),
            false,
            BTreeSet::from([BranchRef::new("refs/heads/main").unwrap()]),
            vec!["refs/heads/work/".into()],
        )
        .unwrap()
    }

    fn open(&self) -> Git {
        let store = Git::open(&self.cache, self.repository()).unwrap();
        store
            .fetch(&BranchRef::new("refs/heads/main").unwrap(), &self.head)
            .unwrap();
        store
    }

    fn stored(&self, args: &[&str]) -> String {
        let mut all = vec!["--git-dir", self.cache.to_str().unwrap()];
        all.extend_from_slice(args);
        git(None, &all)
    }

    fn refs(&self) -> String {
        self.stored(&["for-each-ref", "--format=%(refname) %(objectname)"])
    }
}

fn files(store: &Git, checkpoint: &Checkpoint) -> BTreeMap<SourcePath, (FileMode, Vec<u8>)> {
    store
        .entries(checkpoint)
        .unwrap()
        .into_iter()
        .map(|(path, entry)| {
            let bytes = store.blob(&entry.blob).unwrap();
            (path, (entry.mode, bytes))
        })
        .collect()
}

#[test]
fn both_object_formats_edit_capture_pin_and_reopen_without_checkout_effects() {
    for (format, expected) in [
        ("sha1", ObjectFormat::Sha1),
        ("sha256", ObjectFormat::Sha256),
    ] {
        let fixture = Fixture::new(format);
        // Keep staged/unstaged/untracked state and a hook/filter that must not run.
        fs::write(fixture.work.join("a.txt"), b"staged owner bytes").unwrap();
        git(Some(&fixture.work), &["add", "a.txt"]);
        fs::write(fixture.work.join("a.txt"), b"unstaged owner bytes").unwrap();
        fs::write(fixture.work.join("untracked"), b"owner data").unwrap();
        let index = fs::read(fixture.work.join(".git/index")).unwrap();
        let store = fixture.open();
        assert_eq!(store.object_format(), expected);
        let entries = store.entries(&fixture.head).unwrap();
        let edited = store
            .edit(
                &fixture.head,
                &[
                    Edit::Replace {
                        path: path("a.txt"),
                        old: "hello".into(),
                        text: "안녕".into(),
                        count: 1,
                    },
                    Edit::Move {
                        path: path("b.txt"),
                        to: path("nested/space 한글.txt "),
                        before: entries[&path("b.txt")].blob.clone(),
                    },
                    Edit::Put {
                        path: path("binary"),
                        data: vec![0, 255, 128],
                        mode: FileMode::Executable,
                        before: None,
                    },
                    Edit::Put {
                        path: path("link"),
                        data: b"a.txt".to_vec(),
                        mode: FileMode::Symlink,
                        before: None,
                    },
                ],
                &operation("edit-1"),
            )
            .unwrap();
        assert_ne!(edited, fixture.head);
        let contents = files(&store, &edited);
        assert_eq!(contents[&path("a.txt")].1, "안녕\n".as_bytes());
        assert_eq!(contents[&path("nested/space 한글.txt ")].1, b"world\n");
        assert!(!contents.contains_key(&path("b.txt")));
        assert_eq!(
            contents[&path("binary")],
            (FileMode::Executable, vec![0, 255, 128])
        );
        assert_eq!(
            contents[&path("link")],
            (FileMode::Symlink, b"a.txt".to_vec())
        );
        assert!(store.is_ancestor(&fixture.head, &edited).unwrap());
        assert!(!store.is_ancestor(&edited, &fixture.head).unwrap());
        assert!(
            fixture
                .refs()
                .contains(&format!("refs/tdev/objects/{edited} {edited}"))
        );
        assert!(!fixture.cache.join("index").exists());
        assert!(!fixture.cache.join("FETCH_HEAD").exists());
        assert_eq!(
            store
                .capture(&edited, &contents, &operation("no-change"))
                .unwrap(),
            edited
        );
        let restored = store
            .capture(
                &edited,
                &files(&store, &fixture.head),
                &operation("restore"),
            )
            .unwrap();
        assert_ne!(
            restored, fixture.head,
            "A→B→A must retain a distinct checkpoint"
        );
        assert_eq!(
            store.tree(&restored).unwrap(),
            store.tree(&fixture.head).unwrap()
        );
        drop(store);
        let reopened = Git::open(&fixture.cache, fixture.repository()).unwrap();
        assert_eq!(files(&reopened, &edited), contents);
        assert_eq!(fs::read(fixture.work.join(".git/index")).unwrap(), index);
        assert_eq!(
            fs::read(fixture.work.join("a.txt")).unwrap(),
            b"unstaged owner bytes"
        );
        assert_eq!(
            fs::read(fixture.work.join("untracked")).unwrap(),
            b"owner data"
        );
        assert_eq!(
            git(Some(&fixture.work), &["rev-parse", "HEAD"]),
            fixture.head.as_str()
        );
        assert_eq!(
            git(
                None,
                &[
                    "--git-dir",
                    fixture.remote.to_str().unwrap(),
                    "rev-parse",
                    "refs/heads/main"
                ]
            ),
            fixture.head.as_str()
        );
    }
}

#[test]
fn invalid_batch_cas_duplicates_and_collisions_write_no_new_objects_or_refs() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    let entries = store.entries(&fixture.head).unwrap();
    let put = Edit::Put {
        path: path("fresh"),
        data: b"must not be written".to_vec(),
        mode: FileMode::File,
        before: None,
    };
    let replace = Edit::Replace {
        path: path("a.txt"),
        old: "absent".into(),
        text: "bad".into(),
        count: 1,
    };
    let invalid = vec![
        (vec![put.clone(), replace], "EDIT_CONFLICT"),
        (vec![put.clone(), put.clone()], "DUPLICATE_PATH"),
        (
            vec![
                put.clone(),
                Edit::Put {
                    path: path("fresh/nested"),
                    data: vec![],
                    mode: FileMode::File,
                    before: None,
                },
            ],
            "PATH_COLLISION",
        ),
        (
            vec![Edit::Delete {
                path: path("a.txt"),
                before: entries[&path("b.txt")].blob.clone(),
            }],
            "EDIT_CONFLICT",
        ),
        (
            vec![Edit::Put {
                path: path("a.txt"),
                data: b"overwritten".to_vec(),
                mode: FileMode::File,
                before: None,
            }],
            "EDIT_CONFLICT",
        ),
        (
            vec![Edit::Move {
                path: path("a.txt"),
                to: path("b.txt"),
                before: entries[&path("a.txt")].blob.clone(),
            }],
            "EDIT_CONFLICT",
        ),
        (
            vec![
                Edit::Move {
                    path: path("a.txt"),
                    to: path("moved"),
                    before: entries[&path("a.txt")].blob.clone(),
                },
                Edit::Delete {
                    path: path("moved"),
                    before: entries[&path("a.txt")].blob.clone(),
                },
            ],
            "DUPLICATE_PATH",
        ),
    ];
    let refs = fixture.refs();
    let objects = fixture.stored(&["count-objects", "-v"]);
    for (batch, expected) in invalid {
        assert_eq!(
            store
                .edit(&fixture.head, &batch, &operation("invalid"))
                .unwrap_err()
                .code,
            expected
        );
        assert_eq!(fixture.refs(), refs);
        assert_eq!(fixture.stored(&["count-objects", "-v"]), objects);
    }
    assert_eq!(files(&store, &fixture.head)[&path("a.txt")].1, b"hello\n");
}

#[test]
fn concurrent_first_open_fetch_and_edit_never_share_an_index_or_fetch_head() {
    for format in ["sha1", "sha256"] {
        let fixture = Fixture::new(format);
        let barrier = Arc::new(Barrier::new(4));
        let mut workers = Vec::new();
        for n in 0..4 {
            let repository = fixture.repository();
            let cache = fixture.cache.clone();
            let checkpoint = fixture.head.clone();
            let barrier = barrier.clone();
            workers.push(std::thread::spawn(move || {
                barrier.wait();
                let store = Git::open(&cache, repository).unwrap();
                store
                    .fetch(&BranchRef::new("refs/heads/main").unwrap(), &checkpoint)
                    .unwrap();
                store
                    .edit(
                        &checkpoint,
                        &[Edit::Replace {
                            path: path("a.txt"),
                            old: "hello".into(),
                            text: format!("worker-{n}"),
                            count: 1,
                        }],
                        &operation(&format!("parallel-{n}")),
                    )
                    .unwrap()
            }));
        }
        let checkpoints: BTreeSet<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(checkpoints.len(), 4);
        let store = Git::open(&fixture.cache, fixture.repository()).unwrap();
        for checkpoint in checkpoints {
            assert!(store.is_ancestor(&fixture.head, &checkpoint).unwrap());
            assert!(fixture.refs().contains(checkpoint.as_str()));
        }
        assert!(!fixture.cache.join("FETCH_HEAD").exists());
        assert!(!fixture.cache.join("index").exists());
        assert!(fs::read_dir(&fixture.cache).unwrap().all(|entry| {
            !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("index-")
        }));
    }
}

#[test]
fn head_requires_enrolled_identity_and_nonsymbolic_scope_before_fetch() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    assert_eq!(
        store
            .head(&BranchRef::new("refs/heads/main").unwrap())
            .unwrap(),
        Some(fixture.head.clone())
    );
    assert!(
        store
            .head(&BranchRef::new("refs/heads/work/absent").unwrap())
            .unwrap()
            .is_none()
    );
    assert_eq!(
        store
            .head(&BranchRef::new("refs/heads/private").unwrap())
            .unwrap_err()
            .code,
        "REF_DENIED"
    );
    let wrong = Checkpoint::new("0".repeat(40)).unwrap();
    assert_eq!(
        store
            .fetch(&BranchRef::new("refs/heads/main").unwrap(), &wrong)
            .unwrap_err()
            .code,
        "STALE_HEAD"
    );
    assert_eq!(
        store
            .fetch(
                &BranchRef::new("refs/heads/work/absent").unwrap(),
                &fixture.head
            )
            .unwrap_err()
            .code,
        "REF_NOT_FOUND"
    );
    git(
        None,
        &[
            "--git-dir",
            fixture.remote.to_str().unwrap(),
            "symbolic-ref",
            "refs/heads/main",
            "refs/heads/work/other",
        ],
    );
    assert_eq!(
        store
            .head(&BranchRef::new("refs/heads/main").unwrap())
            .unwrap_err()
            .code,
        "SYMBOLIC_REF"
    );
    fs::rename(&fixture.remote, fixture._root.path().join("old-remote.git")).unwrap();
    git(
        None,
        &[
            "init",
            "--bare",
            "--template=",
            fixture.remote.to_str().unwrap(),
        ],
    );
    assert_eq!(
        store.verify_identity().unwrap_err().code,
        "REPOSITORY_IDENTITY"
    );
    assert_eq!(
        store
            .fetch(&BranchRef::new("refs/heads/main").unwrap(), &fixture.head)
            .unwrap_err()
            .code,
        "REPOSITORY_IDENTITY"
    );
}

#[test]
fn existing_unsafe_or_wrong_format_stores_are_rejected_without_reinitialization() {
    let fixture = Fixture::new("sha256");
    let parent = fixture.cache.parent().unwrap();
    fs::create_dir_all(parent).unwrap();
    fs::set_permissions(parent, fs::Permissions::from_mode(0o700)).unwrap();
    let foreign = fixture._root.path().join("foreign");
    fs::create_dir(&foreign).unwrap();
    fs::write(foreign.join("keep"), b"unrelated").unwrap();
    std::os::unix::fs::symlink(&foreign, &fixture.cache).unwrap();
    assert_eq!(
        Git::open(&fixture.cache, fixture.repository())
            .err()
            .unwrap()
            .code,
        "GIT_STORE"
    );
    assert_eq!(fs::read(foreign.join("keep")).unwrap(), b"unrelated");
    fs::remove_file(&fixture.cache).unwrap();
    git(
        None,
        &[
            "init",
            "--bare",
            "--template=",
            "--object-format=sha1",
            fixture.cache.to_str().unwrap(),
        ],
    );
    fs::set_permissions(&fixture.cache, fs::Permissions::from_mode(0o700)).unwrap();
    let config = fs::read(fixture.cache.join("config")).unwrap();
    assert_eq!(
        Git::open(&fixture.cache, fixture.repository())
            .err()
            .unwrap()
            .code,
        "GIT_STORE"
    );
    assert_eq!(fs::read(fixture.cache.join("config")).unwrap(), config);
    fs::set_permissions(&fixture.cache, fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(
        Git::open(&fixture.cache, fixture.repository())
            .err()
            .unwrap()
            .code,
        "GIT_STORE"
    );
}

#[test]
fn redirected_core_store_paths_cannot_write_to_unrelated_directories() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    drop(store);
    let foreign = fixture._root.path().join("unrelated");
    fs::create_dir(&foreign).unwrap();
    fs::write(foreign.join("keep"), b"unrelated data").unwrap();
    fs::rename(
        fixture.cache.join("objects"),
        fixture.cache.join("saved-objects"),
    )
    .unwrap();
    std::os::unix::fs::symlink(&foreign, fixture.cache.join("objects")).unwrap();
    assert_eq!(
        Git::open(&fixture.cache, fixture.repository())
            .err()
            .unwrap()
            .code,
        "GIT_STORE"
    );
    assert_eq!(fs::read(foreign.join("keep")).unwrap(), b"unrelated data");
    assert_eq!(fs::read_dir(&foreign).unwrap().count(), 1);
}

#[test]
fn literal_diff_paths_modes_and_invalid_utf8_replace_are_explicit() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    let edited = store
        .edit(
            &fixture.head,
            &[
                Edit::Put {
                    path: path(":(glob)*"),
                    data: b"literal".to_vec(),
                    mode: FileMode::File,
                    before: None,
                },
                Edit::Put {
                    path: path("binary"),
                    data: vec![255],
                    mode: FileMode::File,
                    before: None,
                },
                Edit::Put {
                    path: path("link"),
                    data: b"a.txt".to_vec(),
                    mode: FileMode::Symlink,
                    before: None,
                },
            ],
            &operation("paths"),
        )
        .unwrap();
    let names = store
        .diff(
            &fixture.head,
            &edited,
            DiffFormat::Names,
            Some(&path(":(glob)*")),
        )
        .unwrap();
    assert_eq!(names, b"A\t:(glob)*\n");
    let patch = store
        .diff(
            &fixture.head,
            &edited,
            DiffFormat::Patch,
            Some(&path(":(glob)*")),
        )
        .unwrap();
    assert!(String::from_utf8(patch).unwrap().contains("+literal"));
    assert!(
        String::from_utf8(store.history(&edited).unwrap())
            .unwrap()
            .contains("checkpoint paths")
    );
    let replace = |name| Edit::Replace {
        path: path(name),
        old: "a".into(),
        text: "b".into(),
        count: 1,
    };
    assert_eq!(
        store
            .edit(&edited, &[replace("link")], &operation("link-replace"))
            .unwrap_err()
            .code,
        "EDIT_CONFLICT"
    );
    assert_eq!(
        store
            .edit(&edited, &[replace("binary")], &operation("binary-replace"))
            .unwrap_err()
            .code,
        "SOURCE_ENCODING"
    );
    let oversized = BTreeMap::from([(
        path("too-large"),
        (FileMode::File, vec![0; 32 * 1024 * 1024 + 1]),
    )]);
    let refs = fixture.refs();
    assert_eq!(
        store
            .capture(&edited, &oversized, &operation("overflow"))
            .unwrap_err()
            .code,
        "CAPTURE_LIMIT"
    );
    assert_eq!(fixture.refs(), refs);
}

#[test]
fn put_delete_and_explicit_before_blob_cas_preserve_parent_history() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    let entries = store.entries(&fixture.head).unwrap();
    let changed = store
        .edit(
            &fixture.head,
            &[
                Edit::Put {
                    path: path("a.txt"),
                    data: b"changed".to_vec(),
                    mode: FileMode::Executable,
                    before: Some(entries[&path("a.txt")].blob.clone()),
                },
                Edit::Delete {
                    path: path("b.txt"),
                    before: entries[&path("b.txt")].blob.clone(),
                },
            ],
            &operation("cas"),
        )
        .unwrap();
    assert_eq!(
        files(&store, &changed),
        BTreeMap::from([(path("a.txt"), (FileMode::Executable, b"changed".to_vec()))])
    );
    assert_eq!(files(&store, &fixture.head).len(), 2);
    let wrong_format = BlobId::new("0".repeat(64)).unwrap();
    assert_eq!(store.blob(&wrong_format).unwrap_err().code, "OBJECT_FORMAT");
}

#[test]
fn explicitly_enrolled_worktree_git_directory_preserves_dirty_index_and_files() {
    let fixture = Fixture::new("sha1");
    let directory = fixture.work.join(".git");
    let metadata = fs::metadata(&directory).unwrap();
    let enrolled = |allow| {
        LocalRepository::new(
            directory.clone(),
            format!("local:{}:{}", metadata.dev(), metadata.ino()),
            allow,
            BTreeSet::from([BranchRef::new("refs/heads/main").unwrap()]),
            vec![],
        )
        .unwrap()
    };
    assert_eq!(
        Git::open(&fixture.cache, enrolled(false))
            .err()
            .unwrap()
            .code,
        "BARE_REQUIRED"
    );
    assert!(!fixture.cache.exists());
    fs::write(fixture.work.join("a.txt"), b"staged bytes").unwrap();
    git(Some(&fixture.work), &["add", "a.txt"]);
    fs::write(fixture.work.join("a.txt"), b"user pending bytes").unwrap();
    let index = fs::read(directory.join("index")).unwrap();
    let store = Git::open(&fixture.cache, enrolled(true)).unwrap();
    store
        .fetch(&BranchRef::new("refs/heads/main").unwrap(), &fixture.head)
        .unwrap();
    let edited = store
        .edit(
            &fixture.head,
            &[Edit::Replace {
                path: path("a.txt"),
                old: "hello".into(),
                text: "source".into(),
                count: 1,
            }],
            &operation("worktree"),
        )
        .unwrap();
    assert_eq!(files(&store, &edited)[&path("a.txt")].1, b"source\n");
    assert_eq!(fs::read(directory.join("index")).unwrap(), index);
    assert_eq!(
        fs::read(fixture.work.join("a.txt")).unwrap(),
        b"user pending bytes"
    );
    assert_eq!(
        git(Some(&fixture.work), &["rev-parse", "HEAD"]),
        fixture.head.as_str()
    );
}

#[test]
fn gitlinks_invalid_utf8_and_unsafe_git_names_do_not_become_source_paths() {
    for name in [
        b"back\\slash".to_vec(),
        b"control\nname".to_vec(),
        vec![255],
    ] {
        let mut fixture = Fixture::new("sha1");
        fs::write(
            fixture.work.join(std::ffi::OsString::from_vec(name)),
            b"unsafe path bytes",
        )
        .unwrap();
        git(Some(&fixture.work), &["add", "."]);
        git(Some(&fixture.work), &["commit", "-m", "unsafe-path"]);
        fixture.head = Checkpoint::new(git(Some(&fixture.work), &["rev-parse", "HEAD"])).unwrap();
        git(
            Some(&fixture.work),
            &[
                "push",
                fixture.remote.to_str().unwrap(),
                "HEAD:refs/heads/main",
            ],
        );
        let store = fixture.open();
        assert_eq!(store.entries(&fixture.head).unwrap_err().code, "PATH");
    }
    let mut fixture = Fixture::new("sha1");
    git(
        Some(&fixture.work),
        &[
            "update-index",
            "--add",
            "--cacheinfo",
            &format!("160000,{},submodule", fixture.head),
        ],
    );
    git(Some(&fixture.work), &["commit", "-m", "gitlink"]);
    fixture.head = Checkpoint::new(git(Some(&fixture.work), &["rev-parse", "HEAD"])).unwrap();
    git(
        Some(&fixture.work),
        &[
            "push",
            fixture.remote.to_str().unwrap(),
            "HEAD:refs/heads/main",
        ],
    );
    assert_eq!(
        fixture.open().entries(&fixture.head).unwrap_err().code,
        "UNSUPPORTED_GITLINK"
    );
}

#[test]
fn hooks_filters_textconv_and_replace_refs_cannot_reinterpret_checkpoint_bytes() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    let marker = fixture._root.path().join("callback-ran");
    let helper = fixture._root.path().join("callback");
    fs::write(
        &helper,
        format!("#!/bin/sh\nprintf called >> '{}'\n", marker.display()),
    )
    .unwrap();
    fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
    fixture.stored(&[
        "config",
        "core.hooksPath",
        fixture._root.path().to_str().unwrap(),
    ]);
    fs::copy(&helper, fixture._root.path().join("reference-transaction")).unwrap();
    fixture.stored(&["config", "diff.probe.textconv", helper.to_str().unwrap()]);
    fixture.stored(&["config", "filter.probe.clean", helper.to_str().unwrap()]);
    fixture.stored(&["config", "diff.external", helper.to_str().unwrap()]);
    let edited = store
        .edit(
            &fixture.head,
            &[
                Edit::Put {
                    path: path(".gitattributes"),
                    data: b"*.txt diff=probe filter=probe\n".to_vec(),
                    mode: FileMode::File,
                    before: None,
                },
                Edit::Replace {
                    path: path("a.txt"),
                    old: "hello".into(),
                    text: "changed".into(),
                    count: 1,
                },
            ],
            &operation("callbacks"),
        )
        .unwrap();
    assert!(
        !store
            .diff(&fixture.head, &edited, DiffFormat::Patch, None)
            .unwrap()
            .is_empty()
    );
    assert!(!marker.exists(), "Git callback received source authority");
    fixture.stored(&["replace", fixture.head.as_str(), edited.as_str()]);
    assert_eq!(files(&store, &fixture.head)[&path("a.txt")].1, b"hello\n");
    assert_eq!(files(&store, &edited)[&path("a.txt")].1, b"changed\n");
}

#[test]
fn capture_budget_is_distinct_from_the_bounded_blob_read_budget() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    // The existing capture budget is 32 MiB total; bounded file reads are 16 MiB.
    // A read limit must not silently become a narrower capture acceptance limit.
    let captured = BTreeMap::from([(
        path("large"),
        (FileMode::File, vec![0; 16 * 1024 * 1024 + 1]),
    )]);
    let checkpoint = store
        .capture(&fixture.head, &captured, &operation("large-capture"))
        .unwrap();
    let entries = store.entries(&checkpoint).unwrap();
    assert_eq!(
        store.blob(&entries[&path("large")].blob).unwrap_err().code,
        "SOURCE_LIMIT"
    );
    assert_eq!(
        store
            .capture(&checkpoint, &captured, &operation("large-no-change"))
            .unwrap(),
        checkpoint
    );
}

#[test]
fn replacement_expansion_is_bounded_before_allocating_the_result() {
    let fixture = Fixture::new("sha1");
    let store = fixture.open();
    let starting = store
        .edit(
            &fixture.head,
            &[Edit::Put {
                path: path("repeat"),
                data: vec![b'a'; 10000],
                mode: FileMode::File,
                before: None,
            }],
            &operation("repeat-source"),
        )
        .unwrap();
    let refs = fixture.refs();
    let error = store
        .edit(
            &starting,
            &[Edit::Replace {
                path: path("repeat"),
                old: "a".into(),
                text: "x".repeat(1024 * 1024),
                count: 10000,
            }],
            &operation("expansion"),
        )
        .unwrap_err();
    assert_eq!(error.code, "SOURCE_LIMIT");
    assert_eq!(fixture.refs(), refs);
    assert_eq!(files(&store, &starting)[&path("repeat")].1.len(), 10000);
}
