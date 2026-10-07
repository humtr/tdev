use super::*;
use serde_json::json;
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::thread;

struct Fixture {
    root: tempfile::TempDir,
    server: Child,
    port: u16,
}
impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        assert!(
            Command::new("openssl")
                .args([
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-days",
                    "1",
                    "-subj",
                    "/CN=fixture.invalid",
                    "-addext",
                    "subjectAltName=DNS:fixture.invalid",
                    "-keyout",
                    "key.pem",
                    "-out",
                    "cert.pem",
                ])
                .current_dir(root.path())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .unwrap()
                .success()
        );
        let server = Command::new("python")
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/tests/fixtures/artifact_https.py"
            ))
            .arg(root.path())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let mut fixture = Self {
            root,
            server,
            port: 0,
        };
        let until = Instant::now() + Duration::from_secs(10);
        fixture.port = loop {
            if let Ok(port) = fs::read_to_string(fixture.root.path().join("port"))
                && let Ok(port) = port.parse()
            {
                break port;
            }
            assert!(
                Instant::now() < until && fixture.server.try_wait().unwrap().is_none(),
                "HTTPS fixture failed to bind"
            );
            thread::sleep(Duration::from_millis(20));
        };
        fixture
    }
    fn path(&self, name: &str) -> PathBuf {
        self.root.path().join(name)
    }
    fn command(&self, url: &str, timeout: Duration) -> Result<Command> {
        let mut command = https_command(url, timeout)?;
        // Test-only TLS trust/routing. The distributed command has neither an alternate CA,
        // a plaintext mode, a URL rewrite nor a caller-selectable transport override.
        command
            .arg("--cacert")
            .arg(self.path("cert.pem"))
            .arg("--connect-to")
            .arg(format!("fixture.invalid:443:127.0.0.1:{}", self.port));
        Ok(command)
    }
    fn acquire(
        &self,
        inputs: &Inputs,
        name: &str,
        budget: u64,
        timeout: Duration,
    ) -> Result<BTreeMap<String, InputFile>> {
        inputs.acquire_with(
            &self.path(name),
            budget,
            Instant::now() + timeout,
            |url, timeout| self.command(url, timeout),
        )
    }
    fn requests(&self) -> Vec<Value> {
        fs::read_to_string(self.path("requests.jsonl"))
            .unwrap_or_default()
            .lines()
            .map(|s| serde_json::from_str(s).unwrap())
            .collect()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.server.kill();
        let _ = self.server.wait();
    }
}
fn digest(bytes: u64) -> String {
    let mut hash = Sha256::new();
    let chunk = [b'x'; 65536];
    let mut remaining = bytes;
    while remaining > 0 {
        let size = remaining.min(chunk.len() as u64);
        hash.update(&chunk[..size as usize]);
        remaining -= size;
    }
    format!("{:x}", hash.finalize())
}
fn recipe(dependencies: Value) -> Value {
    let platform = json!({"os":"android","arch":"aarch64","abi":"bionic"});
    json!({"format":1,"kind":"files","inputs":["source"],"dependencies":dependencies,
        "build":{"command":"touch MUST-NOT-BUILD","platform":platform,"tools":[{"name":"sh","sha256":"a".repeat(64)}]},
        "exports":["dist"],"target":platform})
}
fn inputs(entries: &[(&str, &str, u64)]) -> Inputs {
    let selected: Vec<_> = entries.iter().map(|(name,path,size)|json!({"name":name,"url":format!("https://fixture.invalid{path}"),"sha256":digest(*size)})).collect();
    Inputs::from_recipe(&Contract::embedded().unwrap(), &recipe(json!(selected))).unwrap()
}

#[test]
fn actual_https_streams_exact_64mib_aggregate_and_rehashes_without_building() {
    let f = Fixture::new();
    let size = INPUT_MAX / 2;
    let selected = inputs(&[
        ("a", &format!("/data/{size}"), size),
        ("b", &format!("/chunked/{size}"), size),
    ]);
    let files = f
        .acquire(&selected, "inputs", INPUT_MAX, Duration::from_secs(60))
        .unwrap();
    assert_eq!(files.values().map(|v| v.size).sum::<u64>(), INPUT_MAX);
    assert_eq!(
        selected.verify(&f.path("inputs"), INPUT_MAX).unwrap(),
        files
    );
    assert_eq!(
        fs::metadata(f.path("inputs/a")).unwrap().mode() & 0o777,
        0o400
    );
    assert!(!f.path("MUST-NOT-BUILD").exists());
    assert_eq!(f.requests().len(), 2);
    let error = selected
        .verify(&f.path("inputs"), INPUT_MAX - 1)
        .unwrap_err();
    assert_eq!(error.code, "ARTIFACT_INPUT_LIMIT");
    assert!(error.message.contains(&format!(
        "configured={} observed={INPUT_MAX}",
        INPUT_MAX - 1
    )));
}

#[test]
fn cumulative_exact_edge_and_chunked_overflow_preserve_original_partial_directory() {
    let f = Fixture::new();
    let selected = inputs(&[("a", "/data/7", 7), ("b", "/chunked/6", 6)]);
    let e = f
        .acquire(&selected, "partial", 12, Duration::from_secs(10))
        .unwrap_err();
    assert_eq!(e.code, "ARTIFACT_INPUT_LIMIT");
    assert!(e.message.contains("configured=12 observed=13"));
    assert_eq!(fs::read(f.path("partial/a")).unwrap(), b"xxxxxxx");
    let count = f.requests().len();
    assert_eq!(
        f.acquire(&selected, "partial", 13, Duration::from_secs(10))
            .unwrap_err()
            .code,
        "ARTIFACT_INPUT_EXISTS"
    );
    assert_eq!(f.requests().len(), count);
    assert_eq!(
        f.acquire(&selected, "exact", 13, Duration::from_secs(10))
            .unwrap()
            .values()
            .map(|v| v.size)
            .sum::<u64>(),
        13
    );
}

#[test]
fn redirect_http_failure_partial_body_digest_mismatch_and_expired_deadline_are_not_inputs() {
    let f = Fixture::new();
    for (index, (path, size, code)) in [
        ("/redirect", 0, "ARTIFACT_DEPENDENCY_REDIRECT"),
        ("/status", 0, "ARTIFACT_DEPENDENCY_HTTP"),
        ("/partial", 3, "ARTIFACT_DEPENDENCY_UNAVAILABLE"),
        ("/data/3", 2, "ARTIFACT_DEPENDENCY_CHANGED"),
        ("/headers", 1, "ARTIFACT_RESPONSE_LIMIT"),
    ]
    .iter()
    .enumerate()
    {
        let selected = inputs(&[("a", path, *size)]);
        assert_eq!(
            f.acquire(
                &selected,
                &format!("failed-{index}"),
                32,
                Duration::from_secs(5)
            )
            .unwrap_err()
            .code,
            *code
        );
    }
    assert!(!f.requests().iter().any(|r| r["path"] == "/follow"));
    let selected = inputs(&[("a", "/slow", 1)]);
    let start = Instant::now();
    assert_eq!(
        f.acquire(&selected, "slow", 32, Duration::from_millis(200))
            .unwrap_err()
            .code,
        "ARTIFACT_DEPENDENCY_TIMEOUT"
    );
    assert!(start.elapsed() < Duration::from_secs(2));
    let expired = f.path("expired");
    assert_eq!(
        selected
            .acquire(&expired, 32, Instant::now() - Duration::from_secs(1))
            .unwrap_err()
            .code,
        "ARTIFACT_DEPENDENCY_TIMEOUT"
    );
    assert!(!expired.exists());
}

#[test]
fn native_command_ignores_ambient_proxy_auth_cookie_config_and_ca_overrides() {
    let f = Fixture::new();
    fs::write(
        f.path(".curlrc"),
        "location\nuser = ambient:secret\ncookie = private=value\ninsecure\n",
    )
    .unwrap();
    fs::write(
        f.path(".netrc"),
        "machine fixture.invalid login ambient password secret\n",
    )
    .unwrap();
    let selected = inputs(&[("a", "/info", 1)]);
    selected
        .acquire_with(
            &f.path("inputs"),
            32,
            Instant::now() + Duration::from_secs(5),
            |url, timeout| {
                let mut command = f.command(url, timeout)?;
                // Deliberately poison curl's own ambient inputs after env_clear. Explicit no-config,
                // no-proxy/no-netrc options must still prevail. Production inherits none of these.
                command
                    .env("HOME", f.root.path())
                    .env("https_proxy", "http://127.0.0.1:1");
                Ok(command)
            },
        )
        .unwrap();
    let events = f.requests();
    assert_eq!(events.len(), 1);
    for field in ["authorization", "cookie", "proxyAuthorization"] {
        assert!(events[0][field].is_null());
    }
    let command = https_command("https://fixture.invalid/info", Duration::from_secs(1)).unwrap();
    assert_eq!(
        command.get_envs().collect::<Vec<_>>(),
        vec![(
            std::ffi::OsStr::new("LANG"),
            Some(std::ffi::OsStr::new("C.UTF-8"))
        )]
    );
    // Untrusted self-signed server must fail through the production command (no test CA).
    let mut insecure =
        https_command("https://fixture.invalid/info", Duration::from_secs(1)).unwrap();
    insecure
        .arg("--connect-to")
        .arg(format!("fixture.invalid:443:127.0.0.1:{}", f.port));
    let mut sink = Response::new(tempfile::tempfile().unwrap(), 32, 0);
    let output = process::stream(
        &mut insecure,
        None,
        Duration::from_secs(1),
        usize::MAX,
        false,
        &mut sink,
    )
    .unwrap();
    assert!(!output.status.success());
    assert_eq!(sink.bytes, 0);
}

#[test]
fn acquired_file_changes_aliases_links_and_foreign_files_fail_without_repair() {
    let f = Fixture::new();
    let selected = inputs(&[("a", "/data/3", 3)]);
    f.acquire(&selected, "inputs", 32, Duration::from_secs(5))
        .unwrap();
    fs::write(f.path("inputs/foreign"), b"foreign").unwrap();
    assert_eq!(
        selected.verify(&f.path("inputs"), 32).unwrap_err().code,
        "ARTIFACT_INPUT_MISMATCH"
    );
    fs::remove_file(f.path("inputs/foreign")).unwrap();
    fs::rename(f.path("inputs/a"), f.path("outside")).unwrap();
    std::os::unix::fs::symlink(f.path("outside"), f.path("inputs/a")).unwrap();
    assert!(selected.verify(&f.path("inputs"), 32).is_err());
    fs::remove_file(f.path("inputs/a")).unwrap();
    // Some Android app domains forbid link(2), even for an owned writable inode.
    fs::set_permissions(f.path("outside"), fs::Permissions::from_mode(0o600)).unwrap();
    match fs::hard_link(f.path("outside"), f.path("inputs/a")) {
        Ok(()) => {
            assert_eq!(
                selected.verify(&f.path("inputs"), 32).unwrap_err().code,
                "ARTIFACT_FILE_TYPE"
            );
            fs::remove_file(f.path("inputs/a")).unwrap();
        }
        Err(error) => {
            assert!(cfg!(target_os = "android") && error.kind() == io::ErrorKind::PermissionDenied);
            assert!(!f.path("inputs/a").exists());
            assert_eq!(fs::read(f.path("outside")).unwrap(), b"xxx");
            eprintln!(
                "Android link(2) refused with PermissionDenied; actual multi-link inode verifier remains a portable-host qualification boundary."
            );
        }
    }
    fs::remove_file(f.path("outside")).unwrap();
    fs::write(f.path("inputs/a"), b"bad").unwrap();
    assert_eq!(
        selected.verify(&f.path("inputs"), 32).unwrap_err().code,
        "ARTIFACT_DEPENDENCY_CHANGED"
    );
    assert_eq!(fs::read(f.path("inputs/a")).unwrap(), b"bad");
    std::os::unix::fs::symlink(f.path("inputs"), f.path("alias")).unwrap();
    assert!(selected.verify(&f.path("alias"), 32).is_err());
}

#[test]
fn replaced_destination_never_redirects_descriptor_relative_writes_or_gets_removed() {
    let f = Fixture::new();
    let selected = inputs(&[("a", "/data/3", 3)]);
    let error = selected
        .acquire_with(
            &f.path("inputs"),
            32,
            Instant::now() + Duration::from_secs(5),
            |url, timeout| {
                fs::rename(f.path("inputs"), f.path("original")).unwrap();
                fs::create_dir(f.path("inputs")).unwrap();
                fs::write(f.path("inputs/foreign"), b"preserve").unwrap();
                f.command(url, timeout)
            },
        )
        .unwrap_err();
    assert_eq!(error.code, "ARTIFACT_INPUT_REPLACED");
    assert_eq!(fs::read(f.path("original/a")).unwrap(), b"xxx");
    assert_eq!(fs::read(f.path("inputs/foreign")).unwrap(), b"preserve");
    assert!(!f.path("inputs/a").exists());
}

#[test]
fn validated_descriptions_and_budget_admission_precede_any_storage_or_network() {
    let c = Contract::embedded().unwrap();
    let f = tempfile::tempdir().unwrap();
    for url in [
        "file:///tmp/private",
        "http://example.org/a",
        "https://user:secret@example.org/a",
        "https://example.org/a?token=secret",
    ] {
        let r = recipe(json!([{"name":"a","url":url,"sha256":digest(1)}]));
        assert_eq!(
            Inputs::from_recipe(&c, &r).unwrap_err().code,
            "ARTIFACT_DEPENDENCY_URL"
        );
    }
    let empty = Inputs::from_recipe(&c, &recipe(json!([]))).unwrap();
    for value in [0, INPUT_MAX + 1] {
        assert_eq!(
            empty
                .acquire(
                    &f.path().join("invalid"),
                    value,
                    Instant::now() + Duration::from_secs(1)
                )
                .unwrap_err()
                .code,
            "ARTIFACT_INPUT_BUDGET"
        );
        assert!(!f.path().join("invalid").exists());
    }
    let result = empty
        .acquire(
            &f.path().join("empty"),
            1,
            Instant::now() + Duration::from_secs(1),
        )
        .unwrap();
    assert!(result.is_empty());
    assert_eq!(empty.verify(&f.path().join("empty"), 1).unwrap(), result);
    let config: Value =
        serde_json::from_str(include_str!("../../contracts/config.schema.json")).unwrap();
    assert_eq!(
        config["properties"]["artifactLimits"]["properties"]["inputBytes"]["maximum"],
        INPUT_MAX
    );
    assert!(crate::git::capacity::SOURCE_BYTES as u64 > INPUT_MAX);
}
