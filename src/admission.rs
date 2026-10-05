//! Immutable, fresh operator authority for one admission attempt.
use crate::{
    contract::Contract,
    git::LocalRepository,
    model::{BranchRef, Fault, PrincipalId, Result},
    wire,
};
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    fs::OpenOptions,
    io::Read,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::Path,
};

#[derive(Clone)]
pub struct Context {
    pub principal: PrincipalId,
    config: Value,
}

pub struct Repository {
    pub name: String,
    pub config: Value,
    pub refs: BTreeSet<BranchRef>,
    pub namespaces: Vec<String>,
}

impl Repository {
    pub fn identity(&self) -> Result<&str> {
        wire::string(&self.config, "identity")
    }
    pub fn local(&self) -> Result<LocalRepository> {
        if self.config["kind"] != "local" {
            return Err(Fault::new("UNSUPPORTED_PROVIDER"));
        }
        LocalRepository::new(
            wire::string(&self.config, "remote")?.into(),
            self.identity()?.into(),
            self.config["allowWorktree"].as_bool().unwrap_or(false),
            self.config["refs"]
                .as_array()
                .ok_or_else(|| Fault::new("CONFIG"))?
                .iter()
                .map(|r| BranchRef::new(r.as_str().ok_or_else(|| Fault::new("CONFIG"))?))
                .collect::<Result<_>>()?,
            self.config["managedRefNamespaces"]
                .as_array()
                .map_or(Ok(vec![]), |a| {
                    a.iter()
                        .map(|r| {
                            r.as_str()
                                .map(str::to_owned)
                                .ok_or_else(|| Fault::new("CONFIG"))
                        })
                        .collect()
                })?,
        )
    }
    pub fn git(&self) -> Result<crate::git::Repository> {
        if self.config["kind"] == "local" {
            return Ok(self.local()?.into());
        }
        if self.config["kind"] != "github" {
            return Err(Fault::new("CONFIG"));
        }
        let repository = crate::provider::GithubRepository::new(
            wire::string(&self.config, "name")?,
            wire::string(&self.config, "remote")?,
            self.identity()?,
        )?;
        let refs = self.config["refs"]
            .as_array()
            .ok_or_else(|| Fault::new("CONFIG"))?
            .iter()
            .map(|r| BranchRef::new(r.as_str().ok_or_else(|| Fault::new("CONFIG"))?))
            .collect::<Result<BTreeSet<_>>>()?;
        let namespaces = self.config["managedRefNamespaces"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|ns| {
                ns.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| Fault::new("CONFIG"))
            })
            .collect::<Result<Vec<_>>>()?;
        for ns in &namespaces {
            if !ns.ends_with('/')
                || BranchRef::new(format!("{ns}probe")).is_err()
                || refs
                    .iter()
                    .any(|r| r.as_str().starts_with(ns) || ns.starts_with(&format!("{r}/")))
            {
                return Err(Fault::new("CONFIG"));
            }
        }
        Ok(crate::git::Repository::Github {
            repository,
            refs,
            namespaces,
        })
    }
}

impl Context {
    pub fn load(path: &Path, bearer: &str, contract: &Contract) -> Result<Self> {
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK)
            .open(path)
            .map_err(|_| Fault::new("PRIVATE_CONFIG"))?;
        let metadata = file.metadata().map_err(|_| Fault::new("PRIVATE_CONFIG"))?;
        // SAFETY: getuid has no memory or pointer preconditions.
        if !metadata.is_file()
            || metadata.uid() != unsafe { libc::getuid() }
            || metadata.mode() & 0o077 != 0
            || metadata.len() > 2 * 1024 * 1024
        {
            return Err(Fault::new("PRIVATE_CONFIG"));
        }
        let mut bytes = Vec::new();
        file.take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| Fault::new("PRIVATE_CONFIG"))?;
        if bytes.len() > 2 * 1024 * 1024 {
            return Err(Fault::new("CONFIG"));
        }
        let config = wire::Json::parse(&bytes)?.value;
        Self::authenticate(config, bearer, contract)
    }

    fn authenticate(config: Value, bearer: &str, contract: &Contract) -> Result<Self> {
        contract.config(&config)?;
        let principals = config["principals"]
            .as_object()
            .ok_or_else(|| Fault::new("CONFIG"))?;
        let mut hashes = BTreeSet::new();
        for principal in principals.values() {
            if !hashes.insert(wire::string(principal, "tokenHash")?) {
                return Err(Fault::new("CONFIG"));
            }
        }
        if let Some(credentials) = config["credentials"].as_object() {
            for credential in credentials.values() {
                if !principals.contains_key(wire::string(credential, "principal")?)
                    || !hashes.insert(wire::string(credential, "tokenHash")?)
                {
                    return Err(Fault::new("CONFIG"));
                }
            }
        }
        for (name, repository) in config["repositories"]
            .as_object()
            .ok_or_else(|| Fault::new("CONFIG"))?
        {
            if name.is_empty()
                || matches!(name.as_str(), "." | "..")
                || !name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
            {
                return Err(Fault::new("CONFIG"));
            }
            for branch in repository["refs"]
                .as_array()
                .ok_or_else(|| Fault::new("CONFIG"))?
            {
                BranchRef::new(branch.as_str().ok_or_else(|| Fault::new("CONFIG"))?)
                    .map_err(|_| Fault::new("CONFIG"))?;
            }
            {
                Repository {
                    name: name.clone(),
                    config: repository.clone(),
                    refs: BTreeSet::new(),
                    namespaces: vec![],
                }
                .git()
                .map_err(|_| Fault::new("CONFIG"))?;
            }
        }
        for policy in config["projectPolicies"]
            .as_object()
            .into_iter()
            .flat_map(|p| p.values())
        {
            let namespace = wire::string(policy, "managedRefNamespace")?;
            if !namespace.ends_with('/') || BranchRef::new(format!("{namespace}probe")).is_err() {
                return Err(Fault::new("CONFIG"));
            }
            if policy["kind"] == "local" {
                let root = Path::new(wire::string(policy, "root")?);
                if !root.is_absolute()
                    || root == Path::new("/")
                    || root.components().any(|c| {
                        matches!(
                            c,
                            std::path::Component::ParentDir | std::path::Component::CurDir
                        )
                    })
                {
                    return Err(Fault::new("CONFIG"));
                }
                if let Ok(resolved) = std::fs::canonicalize(root)
                    && resolved != root
                {
                    return Err(Fault::new("CONFIG"));
                }
            }
        }
        let hash = crate::identity::digest(bearer.as_bytes())?;
        let equal = |candidate: &str| {
            // Equal-length digests only, with no content-dependent early return.
            candidate.len() == hash.as_str().len()
                && candidate
                    .bytes()
                    .zip(hash.as_str().bytes())
                    .fold(0u8, |a, (b, c)| a | (b ^ c))
                    == 0
        };
        let principal = principals
            .iter()
            .find_map(|(name, p)| {
                equal(p["tokenHash"].as_str().unwrap_or("")).then(|| name.clone())
            })
            .or_else(|| {
                config["credentials"].as_object().and_then(|credentials| {
                    credentials.values().find_map(|c| {
                        (c["state"] == "active" && equal(c["tokenHash"].as_str().unwrap_or("")))
                            .then(|| c["principal"].as_str().unwrap().to_owned())
                    })
                })
            })
            .ok_or_else(|| Fault::new("AUTHENTICATION_REQUIRED"))?;
        Ok(Self {
            principal: PrincipalId::new(principal)?,
            config,
        })
    }

    pub fn repository(&self, name: &str, identity: Option<&str>) -> Result<Repository> {
        let config = self.config["repositories"]
            .get(name)
            .ok_or_else(|| Fault::new("PERMISSION_DENIED"))?;
        let grants = self.config["principals"][self.principal.as_str()]["repos"]
            .get(name)
            .and_then(Value::as_array)
            .ok_or_else(|| Fault::new("PERMISSION_DENIED"))?;
        let refs: BTreeSet<BranchRef> = config["refs"]
            .as_array()
            .ok_or_else(|| Fault::new("CONFIG"))?
            .iter()
            .filter(|r| grants.contains(r))
            .map(|r| BranchRef::new(r.as_str().ok_or_else(|| Fault::new("CONFIG"))?))
            .collect::<Result<_>>()?;
        if refs.is_empty() {
            return Err(Fault::new("PERMISSION_DENIED"));
        }
        if identity.is_some_and(|expected| config["identity"].as_str() != Some(expected)) {
            return Err(Fault::new("REPOSITORY_IDENTITY"));
        }
        let configured = config["managedRefNamespaces"].as_array();
        let granted = self.config["principals"][self.principal.as_str()]["managedRefNamespaces"]
            .get(name)
            .and_then(Value::as_array);
        let namespaces = configured
            .into_iter()
            .flatten()
            .filter(|ns| granted.is_some_and(|list| list.contains(ns)))
            .map(|ns| {
                ns.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| Fault::new("CONFIG"))
            })
            .collect::<Result<_>>()?;
        Ok(Repository {
            name: name.into(),
            config: config.clone(),
            refs,
            namespaces,
        })
    }

    pub fn policy(&self, name: &str, expected: Option<&str>) -> Result<&Value> {
        let granted =
            self.config["principals"][self.principal.as_str()]["projectPolicies"].as_array();
        let policy = self.config["projectPolicies"]
            .get(name)
            .filter(|_| granted.is_some_and(|g| g.contains(&json!(name))))
            .ok_or_else(|| Fault::new("PROJECT_POLICY_DENIED"))?;
        if let Some(expected) = expected
            && Self::policy_authority(policy)?.as_str() != expected
        {
            return Err(Fault::new("PROJECT_SCOPE_CHANGED"));
        }
        Ok(policy)
    }
    pub fn policy_authority(policy: &Value) -> Result<crate::model::Digest> {
        crate::identity::Value::parse(
            &json!({"kind":policy["kind"],"root":policy["root"],"owner":policy["owner"]})
                .to_string(),
        )?
        .fingerprint()
    }
    pub fn policies(&self) -> Vec<String> {
        self.config["projectPolicies"]
            .as_object()
            .into_iter()
            .flat_map(|p| p.keys())
            .filter(|name| self.policy(name, None).is_ok())
            .cloned()
            .collect()
    }
    pub fn project_conflict(&self, name: &str) -> bool {
        self.config["repositories"]
            .get(name)
            .is_some_and(|r| r.get("_projectPolicy").is_none())
    }
    pub fn delegated(&self, project: crate::storage::project::Project) -> Result<Repository> {
        let mut context = self.clone();
        if !context.project_conflict(project.id.as_str()) {
            context.config["repositories"]
                .as_object_mut()
                .unwrap()
                .remove(project.id.as_str());
        }
        let id = project.id.clone();
        context.enroll(vec![project])?.repository(id.as_str(), None)
    }

    /// Only the current policy supplies executable settings and derived grants.
    pub fn enroll(mut self, projects: Vec<crate::storage::project::Project>) -> Result<Self> {
        for project in projects {
            if project.owner != self.principal {
                return Err(Fault::new("STATE_FORMAT"));
            }
            let Ok(policy) = self.policy(&project.policy, Some(project.authority.as_str())) else {
                continue;
            };
            if self.config["repositories"]
                .get(project.id.as_str())
                .is_some()
            {
                return Err(Fault::new("CONFIG"));
            }
            let mut repository = project.config;
            // Historical rows may contain old copied settings. None is authority.
            for key in [
                "validation",
                "artifactValidation",
                "validationTimeoutSeconds",
                "executor",
                "toolingEnvironment",
                "networks",
            ] {
                repository
                    .as_object_mut()
                    .ok_or_else(|| Fault::new("STATE_FORMAT"))?
                    .remove(key);
                if let Some(value) = policy.get(key) {
                    repository[key] = value.clone();
                }
            }
            repository["managedRefNamespaces"] = json!([policy["managedRefNamespace"]]);
            repository["_projectPolicy"] = json!(project.policy);
            repository["_projectRoot"] = policy["root"].clone();
            let principal = &mut self.config["principals"][self.principal.as_str()];
            principal["repos"][project.id.as_str()] = repository["refs"].clone();
            if !principal["managedRefNamespaces"].is_object() {
                principal["managedRefNamespaces"] = json!({});
            }
            principal["managedRefNamespaces"][project.id.as_str()] =
                repository["managedRefNamespaces"].clone();
            self.config["repositories"][project.id.as_str()] = repository;
            let repository = self.repository(project.id.as_str(), Some(&project.identity))?;
            repository.git().map_err(|_| Fault::new("STATE_FORMAT"))?;
        }
        Ok(self)
    }

    pub fn repositories(&self) -> Vec<String> {
        self.config["repositories"]
            .as_object()
            .into_iter()
            .flat_map(|object| object.keys())
            .filter(|name| self.repository(name, None).is_ok())
            .cloned()
            .collect()
    }
    pub fn default_repository(&self) -> Option<&str> {
        self.config["principals"][self.principal.as_str()]["defaultRepo"].as_str()
    }
    pub fn working_bytes(&self) -> Result<u64> {
        crate::wire::bounded(
            &self.config["artifactLimits"],
            "workingBytes",
            128 * 1024 * 1024,
            2 * 1024 * 1024 * 1024,
        )
    }
}
