//! Frozen build preparation. Receipts, source authority, dispatch and stop remain their original
//! owners; command completion is not retained-artifact success.
use super::{acquisition::Inputs, recipe};
use crate::{contract::Contract, model::*, supervisor};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::Read,
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::OnceLock,
    time::Instant,
};

const TOOL_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Plan {
    recipe: Value,
    input_bytes: u64,
}

impl<'de> Deserialize<'de> for Plan {
    fn deserialize<D: serde::Deserializer<'de>>(decoder: D) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Raw {
            recipe: Value,
            input_bytes: u64,
        }
        let raw = Raw::deserialize(decoder)?;
        let contract = contract().map_err(serde::de::Error::custom)?;
        Self::new(contract, &raw.recipe, raw.input_bytes).map_err(serde::de::Error::custom)
    }
}

fn contract() -> Result<&'static Contract> {
    static CONTRACT: OnceLock<std::result::Result<Contract, Fault>> = OnceLock::new();
    CONTRACT
        .get_or_init(Contract::embedded)
        .as_ref()
        .map_err(Clone::clone)
}

impl Plan {
    pub fn new(contract: &Contract, value: &Value, input_bytes: u64) -> Result<Self> {
        if !(1..=64 * 1024 * 1024).contains(&input_bytes) {
            return Err(Fault::new("ARTIFACT_INPUT_BUDGET"));
        }
        let recipe = recipe::parse(contract, value.to_string().as_bytes())?;
        if !recipe["build"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t["name"] == "sh")
        {
            return Err(Fault::new("ARTIFACT_SHELL_REQUIRED"));
        }
        Ok(Self {
            recipe,
            input_bytes,
        })
    }
    pub(crate) fn validate(&self) -> Result<()> {
        Self::new(contract()?, &self.recipe, self.input_bytes).map(|_| ())
    }
    pub fn command(&self) -> &str {
        self.recipe["build"]["command"].as_str().unwrap()
    }
    /// Same native PATH/shell as the independent child; no adopted task/tooling environment.
    pub fn preflight(&self, deadline: Instant) -> Result<BTreeMap<String, PathBuf>> {
        self.validate()?;
        let shell = supervisor::native_shell().map_err(|_| Fault::new("ARTIFACT_TOOL_MISSING"))?;
        let env = supervisor::native_environment(Path::new("/"), &shell, None)
            .map_err(|_| Fault::new("ARTIFACT_TOOL_MISSING"))?;
        self.tools(OsStr::new(&env["PATH"]), &shell, &mut || {
            if Instant::now() >= deadline {
                Err(Fault::new("TIMEOUT"))
            } else {
                Ok(())
            }
        })
    }
    fn tools(
        &self,
        path: &OsStr,
        shell: &Path,
        control: &mut impl FnMut() -> Result<()>,
    ) -> Result<BTreeMap<String, PathBuf>> {
        if self.recipe["build"]["platform"] != platform() {
            return Err(Fault::new("ARTIFACT_BUILD_PLATFORM"));
        }
        let mut tools = BTreeMap::new();
        for tool in self.recipe["build"]["tools"].as_array().unwrap() {
            control()?;
            let name = tool["name"].as_str().unwrap();
            let resolved = std::env::split_paths(path)
                .filter(|d| d.is_absolute())
                .map(|d| d.join(name))
                .find(|p| fs::metadata(p).is_ok_and(|m| m.is_file() && m.mode() & 0o111 != 0))
                .ok_or_else(|| Fault::message("ARTIFACT_TOOL_MISSING", name))?;
            let resolved = fs::canonicalize(resolved)
                .map_err(|_| Fault::message("ARTIFACT_TOOL_MISSING", name))?;
            let observed = hash_tool(&resolved, control)?;
            if observed.as_str() != tool["sha256"].as_str().unwrap() {
                return Err(Fault::message("ARTIFACT_TOOL_CHANGED", name));
            }
            if name == "sh"
                && fs::canonicalize(shell).map_err(|_| Fault::new("ARTIFACT_SHELL_REQUIRED"))?
                    != resolved
            {
                return Err(Fault::new("ARTIFACT_SHELL_CHANGED"));
            }
            tools.insert(name.to_owned(), resolved);
        }
        Ok(tools)
    }
    pub(crate) fn prepare(
        &self,
        job: &supervisor::Job,
        env: &mut BTreeMap<String, String>,
        control: &mut impl FnMut() -> Result<()>,
        deadline: Instant,
    ) -> Result<()> {
        let shell = job
            .shell()
            .map_err(|_| Fault::new("ARTIFACT_SHELL_REQUIRED"))?;
        self.tools(OsStr::new(&env["PATH"]), &shell, control)?;
        Inputs::from_recipe(contract()?, &self.recipe)?.acquire_controlled(
            &job.path().join("inputs"),
            self.input_bytes,
            deadline,
            &shell,
            control,
        )?;
        fs::DirBuilder::new()
            .mode(0o700)
            .create(job.path().join("build"))
            .map_err(|_| Fault::new("ARTIFACT_BUILD_STORAGE"))?;
        File::open(job.path())
            .and_then(|f| f.sync_all())
            .map_err(|_| Fault::new("ARTIFACT_BUILD_STORAGE"))?;
        // Acquisition may have taken time or changed a tool. Recheck immediately before dispatch.
        self.tools(OsStr::new(&env["PATH"]), &shell, control)?;
        env.insert(
            "TDEV_INPUT_DIR".into(),
            job.path().join("inputs").to_string_lossy().into(),
        );
        env.insert(
            "TDEV_BUILD_DIR".into(),
            job.path().join("build").to_string_lossy().into(),
        );
        env.insert("PYTHONDONTWRITEBYTECODE".into(), "1".into());
        Ok(())
    }
    pub(crate) fn verify_inputs(&self, job: &supervisor::Job) -> Result<()> {
        Inputs::from_recipe(contract()?, &self.recipe)?
            .verify(&job.path().join("inputs"), self.input_bytes)
            .map(|_| ())
    }
}

pub fn platform() -> Value {
    let abi = if cfg!(target_os = "android") {
        "bionic"
    } else if cfg!(target_env = "gnu") {
        "glibc"
    } else if cfg!(target_env = "musl") {
        "musl"
    } else {
        "unknown"
    };
    json!({"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"abi":abi})
}

fn hash_tool(path: &Path, control: &mut impl FnMut() -> Result<()>) -> Result<Digest> {
    let mut file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC)
        .open(path)
        .map_err(|_| Fault::new("ARTIFACT_TOOL_MISSING"))?;
    let before = file
        .metadata()
        .map_err(|_| Fault::new("ARTIFACT_TOOL_MISSING"))?;
    if !before.is_file() || before.nlink() != 1 || before.mode() & 0o111 == 0 {
        return Err(Fault::new("ARTIFACT_FILE_TYPE"));
    }
    let capacity = |observed| {
        if observed > TOOL_BYTES {
            Err(Fault::message(
                "ARTIFACT_TOOL_LIMIT",
                format!("budget=artifactToolBytes configured={TOOL_BYTES} observed={observed}"),
            ))
        } else {
            Ok(())
        }
    };
    capacity(before.len())?;
    let mut hash = Sha256::new();
    let mut size = 0;
    let mut buffer = [0; 65536];
    loop {
        control()?;
        let n = file
            .read(&mut buffer)
            .map_err(|_| Fault::new("ARTIFACT_TOOL_CHANGED"))?;
        if n == 0 {
            break;
        }
        size += n as u64;
        capacity(size)?;
        hash.update(&buffer[..n]);
    }
    let after = file
        .metadata()
        .map_err(|_| Fault::new("ARTIFACT_TOOL_CHANGED"))?;
    let current = fs::symlink_metadata(path).map_err(|_| Fault::new("ARTIFACT_TOOL_CHANGED"))?;
    if signature(&before) != signature(&after)
        || signature(&current) != signature(&after)
        || size != before.len()
    {
        return Err(Fault::new("ARTIFACT_TOOL_CHANGED"));
    }
    Digest::new(format!("{:x}", hash.finalize()))
}
fn signature(m: &fs::Metadata) -> (u64, u64, u64, u32, u64, i64, i64, i64, i64) {
    (
        m.dev(),
        m.ino(),
        m.nlink(),
        m.mode(),
        m.len(),
        m.mtime(),
        m.mtime_nsec(),
        m.ctime(),
        m.ctime_nsec(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    fn value(command: &str, tools: Value) -> Value {
        json!({"format":1,"kind":"files","inputs":["a"],"dependencies":[],
            "build":{"command":command,"platform":platform(),"tools":tools},"exports":["dist"],"target":platform()})
    }
    fn pinned(name: &str, bytes: &[u8]) -> Value {
        json!({"name":name,"sha256":format!("{:x}",Sha256::digest(bytes))})
    }
    #[test]
    fn native_platform_and_real_shell_pin_are_observed_without_executing_recipe() {
        let shell = supervisor::native_shell().unwrap();
        let digest = hash_tool(&fs::canonicalize(&shell).unwrap(), &mut || Ok(())).unwrap();
        let recipe = value("exit 99", json!([{"name":"sh","sha256":digest}]));
        let plan = Plan::new(&Contract::embedded().unwrap(), &recipe, 1).unwrap();
        let result = plan
            .preflight(Instant::now() + std::time::Duration::from_secs(10))
            .unwrap();
        assert_eq!(result["sh"], fs::canonicalize(shell).unwrap());
        assert_eq!(plan.preflight(Instant::now()).unwrap_err().code, "TIMEOUT");
    }
    #[test]
    fn platform_required_shell_and_actual_selected_shell_cannot_be_substituted() {
        let c = Contract::embedded().unwrap();
        let temp = tempfile::tempdir().unwrap();
        let sh = temp.path().join("sh");
        fs::write(&sh, b"first").unwrap();
        fs::set_permissions(&sh, fs::Permissions::from_mode(0o700)).unwrap();
        let mut r = value("true", json!([pinned("sh", b"first")]));
        let plan = Plan::new(&c, &r, 1).unwrap();
        assert_eq!(
            plan.tools(
                temp.path().as_os_str(),
                &supervisor::native_shell().unwrap(),
                &mut || Ok(())
            )
            .unwrap_err()
            .code,
            "ARTIFACT_SHELL_CHANGED"
        );
        r["build"]["platform"]["abi"] = json!("different");
        let plan = Plan::new(&c, &r, 1).unwrap();
        assert_eq!(
            plan.tools(temp.path().as_os_str(), &sh, &mut || Ok(()))
                .unwrap_err()
                .code,
            "ARTIFACT_BUILD_PLATFORM"
        );
        r = value("true", json!([pinned("other", b"first")]));
        assert_eq!(
            Plan::new(&c, &r, 1).unwrap_err().code,
            "ARTIFACT_SHELL_REQUIRED"
        );
    }
    #[test]
    fn tool_resolution_accepts_native_symlinks_but_rechecks_bytes_and_path_replacement() {
        let c = Contract::embedded().unwrap();
        let temp = tempfile::tempdir().unwrap();
        let actual = temp.path().join("actual");
        let sh = temp.path().join("sh");
        fs::write(&actual, b"first").unwrap();
        fs::set_permissions(&actual, fs::Permissions::from_mode(0o700)).unwrap();
        std::os::unix::fs::symlink(&actual, &sh).unwrap();
        let plan = Plan::new(&c, &value("true", json!([pinned("sh", b"first")])), 1).unwrap();
        assert_eq!(
            plan.tools(temp.path().as_os_str(), &sh, &mut || Ok(()))
                .unwrap()["sh"],
            actual
        );
        fs::write(&actual, b"other").unwrap();
        assert_eq!(
            plan.tools(temp.path().as_os_str(), &sh, &mut || Ok(()))
                .unwrap_err()
                .code,
            "ARTIFACT_TOOL_CHANGED"
        );
        fs::write(&actual, b"first").unwrap();
        let mut calls = 0;
        let error = hash_tool(&actual, &mut || {
            calls += 1;
            if calls == 2 {
                fs::rename(&actual, temp.path().join("original")).unwrap();
                fs::write(&actual, b"first").unwrap();
                fs::set_permissions(&actual, fs::Permissions::from_mode(0o700)).unwrap();
            }
            Ok(())
        })
        .unwrap_err();
        assert_eq!(error.code, "ARTIFACT_TOOL_CHANGED");
    }
    #[test]
    fn tool_byte_budget_is_separate_and_oversize_rejection_precedes_body_read() {
        let temp = tempfile::tempdir().unwrap();
        let tool = temp.path().join("tool");
        File::create(&tool)
            .unwrap()
            .set_len(TOOL_BYTES + 1)
            .unwrap();
        fs::set_permissions(&tool, fs::Permissions::from_mode(0o700)).unwrap();
        let error =
            hash_tool(&tool, &mut || panic!("Oversize tool body must not be read")).unwrap_err();
        assert_eq!(error.code, "ARTIFACT_TOOL_LIMIT");
        assert!(error.message.contains(&format!(
            "configured={TOOL_BYTES} observed={}",
            TOOL_BYTES + 1
        )));
        let c = Contract::embedded().unwrap();
        let mut invalid = value("true", json!([pinned("sh", b"x")]));
        invalid["build"]["tools"][0]["name"] = json!("../sh");
        assert_eq!(
            Plan::new(&c, &invalid, 1).unwrap_err().code,
            "ARTIFACT_SCHEMA"
        );
    }
}
