//! Immutable, fresh operator authority for one admission attempt.
use crate::{
    contract::Contract,
    git::LocalRepository,
    model::{BranchRef, Fault, PrincipalId, Result},
    wire,
};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs::OpenOptions,
    io::Read,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::Path,
};

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
            if repository["kind"] == "local" {
                Repository {
                    name: name.clone(),
                    config: repository.clone(),
                    refs: BTreeSet::new(),
                    namespaces: vec![],
                }
                .local()
                .map_err(|_| Fault::new("CONFIG"))?;
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

    pub fn repositories(&self) -> Vec<String> {
        self.config["repositories"]
            .as_object()
            .into_iter()
            .flat_map(|object| object.keys())
            .filter(|name| self.repository(name, None).is_ok())
            .cloned()
            .collect()
    }
}
