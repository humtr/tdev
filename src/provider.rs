//! Controller-owned GitHub access. No credentials or provider text enter receipts.
use crate::{
    git::process::run,
    model::{BranchRef, Effect, Fault, Result},
    wire,
};
use serde_json::{Value, json};
use std::{process::Command, time::Duration};

/// Used only by provider utilities and authenticated Git transport, never private
/// object plumbing or execution copies. Operator CLI authentication stays external.
pub(crate) fn credentials(command: &mut Command) {
    for name in [
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "GH_CONFIG_DIR",
        "XDG_CONFIG_HOME",
    ] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    command.env("GH_PROMPT_DISABLED", "1");
}

pub fn name(value: &str) -> Result<()> {
    if !(1..=100).contains(&value.len())
        || matches!(value, "." | "..")
        || !value.as_bytes()[0].is_ascii_alphanumeric() && value.as_bytes()[0] != b'_'
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
    {
        return Err(Fault::new("PROJECT_NAME"));
    }
    Ok(())
}

pub fn identity(data: &Value) -> Result<String> {
    data["id"]
        .as_u64()
        .filter(|id| *id > 0)
        .map(|id| format!("github:{id}"))
        .ok_or_else(|| Fault::new("PROVIDER_RESPONSE"))
}

fn response(bytes: &[u8]) -> Result<(u16, &[u8])> {
    let end = bytes
        .windows(4)
        .position(|b| b == b"\r\n\r\n")
        .map(|i| (i, 4))
        .or_else(|| bytes.windows(2).position(|b| b == b"\n\n").map(|i| (i, 2)))
        .ok_or_else(|| Fault::new("PROVIDER_RESPONSE"))?;
    let header =
        std::str::from_utf8(&bytes[..end.0]).map_err(|_| Fault::new("PROVIDER_RESPONSE"))?;
    let mut status = header.lines().next().unwrap_or("").split_whitespace();
    if !status.next().is_some_and(|s| s.starts_with("HTTP/")) {
        return Err(Fault::new("PROVIDER_RESPONSE"));
    }
    let code = status
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| Fault::new("PROVIDER_RESPONSE"))?;
    Ok((code, &bytes[end.0 + end.1..]))
}

pub fn api(endpoint: &str, payload: Option<&Value>) -> Result<Value> {
    let mut command = Command::new("gh");
    command.env_clear();
    for name in ["PATH", "HOME", "TMPDIR", "PREFIX", "LD_LIBRARY_PATH"] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    credentials(&mut command);
    command.args([
        "api",
        "--hostname",
        "github.com",
        "--include",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "X-GitHub-Api-Version: 2022-11-28",
        endpoint,
    ]);
    let input = if let Some(payload) = payload {
        command.args(["--method", "POST", "--input", "-"]);
        serde_json::to_vec(payload).map_err(|_| Fault::new("PROVIDER_RESPONSE"))?
    } else {
        vec![]
    };
    let result = (|| {
        let output = run(
            &mut command,
            &input,
            Duration::from_secs(120),
            2 * 1024 * 1024,
            false,
        )?;
        let parsed = response(&output.stdout);
        let (status, body) = match parsed {
            Ok(response) => response,
            Err(_)
                if output.status.code() == Some(4)
                    || String::from_utf8_lossy(&output.stderr).contains("gh auth login") =>
            {
                return Err(Fault::new("PROVIDER_AUTH_REQUIRED"));
            }
            Err(error) => return Err(error),
        };
        if !(200..300).contains(&status) {
            return Err(Fault::new(match status {
                401 => "PROVIDER_AUTH_REQUIRED",
                403 => "PROVIDER_PERMISSION_DENIED",
                404 => "PROVIDER_NOT_FOUND",
                422 => "PROJECT_EXISTS",
                _ => "PROVIDER_UNAVAILABLE",
            }));
        }
        if !output.status.success() {
            return Err(Fault::new("PROVIDER_UNAVAILABLE"));
        }
        wire::Json::parse(body)
            .map(|json| json.value)
            .map_err(|_| Fault::new("PROVIDER_RESPONSE"))
    })();
    result.map_err(|mut error: Fault| {
        // Explicit rejection proves this POST made no repository. Any successful
        // but unusable reply, transport loss or server failure remains uncertain.
        error.effect = if payload.is_some()
            && !matches!(
                error.code.as_str(),
                "PROVIDER_AUTH_REQUIRED"
                    | "PROVIDER_PERMISSION_DENIED"
                    | "PROVIDER_NOT_FOUND"
                    | "PROJECT_EXISTS"
                    | "EXECUTABLE_UNAVAILABLE"
            ) {
            Effect::Unknown
        } else {
            Effect::None
        };
        error
    })
}

#[derive(Clone, Debug)]
pub struct GithubRepository {
    pub name: String,
    pub remote: String,
    pub identity: String,
}

impl GithubRepository {
    pub fn new(full: &str, remote: &str, identity: &str) -> Result<Self> {
        let parts: Vec<_> = full.split('/').collect();
        if parts.len() != 2
            || parts.iter().any(|part| name(part).is_err())
            || !parts[0]
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
            || remote != format!("https://github.com/{full}.git")
            || identity
                .strip_prefix("github:")
                .and_then(|id| id.parse::<u64>().ok())
                .is_none_or(|id| id == 0 || identity != format!("github:{id}"))
        {
            return Err(Fault::new("REPOSITORY_IDENTITY"));
        }
        Ok(Self {
            name: full.into(),
            remote: remote.into(),
            identity: identity.into(),
        })
    }
    pub fn inspect(&self) -> Result<Value> {
        let data = api(&format!("repos/{}", self.name), None)?;
        if identity(&data)? != self.identity
            || !data["full_name"]
                .as_str()
                .is_some_and(|n| n.eq_ignore_ascii_case(&self.name))
        {
            return Err(Fault::new("REPOSITORY_IDENTITY"));
        }
        Ok(data)
    }
}

pub fn describe(policy: &Value, project_name: &str, expected: Option<&str>) -> Result<Value> {
    name(project_name)?;
    let full = format!("{}/{project_name}", wire::string(policy, "owner")?);
    let data = api(&format!("repos/{full}"), None)?;
    let id = identity(&data)?;
    if expected.is_some_and(|expected| id != expected)
        || !data["full_name"]
            .as_str()
            .is_some_and(|n| n.eq_ignore_ascii_case(&full))
    {
        return Err(Fault::new("REPOSITORY_IDENTITY"));
    }
    // GitHub App/fine-grained responses can omit this field. Explicit denial is
    // binding; actual transport remains an independent upper bound.
    if data["permissions"]["push"] == false {
        return Err(Fault::new("PROVIDER_PERMISSION_DENIED"));
    }
    if expected.is_some() && data["private"] != true {
        return Err(Fault::new("PROVIDER_RESPONSE"));
    }
    let full = wire::string(&data, "full_name").map_err(|_| Fault::new("PROVIDER_RESPONSE"))?;
    GithubRepository::new(full, &format!("https://github.com/{full}.git"), &id)?;
    let branch = BranchRef::new(format!(
        "refs/heads/{}",
        wire::string(&data, "default_branch").map_err(|_| Fault::new("PROVIDER_RESPONSE"))?
    ))?;
    let namespace = wire::string(policy, "managedRefNamespace")?;
    if branch.as_str().starts_with(namespace) || namespace.starts_with(&format!("{branch}/")) {
        return Err(Fault::new("CONFIG"));
    }
    Ok(
        json!({"kind":"github","name":full,"remote":format!("https://github.com/{full}.git"),"identity":id,"refs":[branch],"defaultRef":branch,"managedOnly":true}),
    )
}

pub fn create_endpoint(policy: &Value, project_name: &str) -> Result<String> {
    name(project_name)?;
    let owner = wire::string(policy, "owner")?;
    let data = api(&format!("users/{owner}"), None)?;
    if !data["login"]
        .as_str()
        .is_some_and(|login| login.eq_ignore_ascii_case(owner))
    {
        return Err(Fault::new("PROVIDER_RESPONSE"));
    }
    match data["type"].as_str() {
        Some("Organization") => Ok(format!("orgs/{owner}/repos")),
        Some("User") => {
            if !api("user", None)?["login"]
                .as_str()
                .is_some_and(|login| login.eq_ignore_ascii_case(owner))
            {
                return Err(Fault::new("PROVIDER_PERMISSION_DENIED"));
            }
            Ok("user/repos".into())
        }
        _ => Err(Fault::new("PROVIDER_RESPONSE")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn provider_identity_cannot_expand_transport_scope() {
        assert!(
            GithubRepository::new(
                "Owner/Repo",
                "https://github.com/Owner/Repo.git",
                "github:12"
            )
            .is_ok()
        );
        for (name, url, id) in [
            (
                "Owner/../Repo",
                "https://github.com/Owner/Repo.git",
                "github:12",
            ),
            (
                "Owner/Repo",
                "https://evil.invalid/Owner/Repo.git",
                "github:12",
            ),
            (
                "Owner/Repo",
                "https://github.com/Owner/Repo.git",
                "github:012",
            ),
        ] {
            assert!(GithubRepository::new(name, url, id).is_err());
        }
        assert!(name("--flag").is_err());
        assert!(name("Other/Repo").is_err());
        assert!(identity(&json!({"id":0})).is_err());
    }
    #[test]
    fn bounded_provider_response_requires_status_and_body() {
        let (status, body) =
            response(b"HTTP/2.0 201 Created\r\nContent-Type: application/json\r\n\r\n{\"id\":12}")
                .unwrap();
        assert_eq!(status, 201);
        assert_eq!(
            identity(&wire::Json::parse(body).unwrap().value).unwrap(),
            "github:12"
        );
        assert!(response(b"{\"id\":12}").is_err());
    }
}
