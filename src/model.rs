//! Validated domain values. Wire schema validation remains the transport's responsibility.
use serde::{Deserialize, Serialize};
use std::fmt;

pub type Result<T> = std::result::Result<T, Fault>;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    None,
    Committed,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Running,
    Unknown,
    Succeeded,
    Failed,
    Cancelled,
}

impl Status {
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Cancelled)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OperationKind {
    Workspace,
    Task,
    Edit,
    Exec,
    Operation,
    Validate,
    Publish,
    Project,
    Deploy,
    Artifact,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Fault {
    pub code: String,
    pub message: String,
    pub effect: Effect,
    #[serde(rename = "operationId", skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<OperationId>,
}

impl Fault {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.into(),
            message: code.into(),
            effect: Effect::None,
            operation_id: None,
        }
    }

    pub fn message(code: &str, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            ..Self::new(code)
        }
    }
}

impl fmt::Display for Fault {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for Fault {}

fn identifier(value: &str) -> bool {
    (1..=128).contains(&value.len())
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_.:-".contains(&byte))
}

fn hex(value: &str, lengths: &[usize]) -> bool {
    lengths.contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

macro_rules! validated_string {
    ($name:ident, $code:literal, $valid:expr) => {
        #[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
        #[serde(try_from = "String", into = "String")]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Result<Self> {
                let value = value.into();
                if ($valid)(&value) {
                    Ok(Self(value))
                } else {
                    Err(Fault::new($code))
                }
            }
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl TryFrom<String> for $name {
            type Error = Fault;
            fn try_from(value: String) -> Result<Self> {
                Self::new(value)
            }
        }
        impl From<$name> for String {
            fn from(value: $name) -> Self {
                value.0
            }
        }
        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(&self.0)
            }
        }
    };
}

validated_string!(OperationId, "OPERATION_ID", identifier);
validated_string!(RequestId, "REQUEST_ID", identifier);
validated_string!(TaskId, "TASK_ID", identifier);
validated_string!(WorkspaceId, "WORKSPACE_ID", identifier);
validated_string!(ProjectId, "PROJECT_ID", identifier);
// Config object keys have no identifier pattern in the canonical contract.
validated_string!(PrincipalId, "PRINCIPAL_ID", |_: &str| true);
validated_string!(Checkpoint, "CHECKPOINT", |s: &str| hex(s, &[40, 64]));
validated_string!(BlobId, "BLOB_ID", |s: &str| hex(s, &[40, 64]));
validated_string!(TreeId, "TREE_ID", |s: &str| hex(s, &[40, 64]));
validated_string!(Digest, "DIGEST", |s: &str| hex(s, &[64]));
validated_string!(DeploymentRevision, "DEPLOYMENT_REVISION", identifier);

fn source_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 4096
        && !value.chars().any(|c| c < ' ' || c == '\\')
        && value.split('/').all(|part| {
            !matches!(part, "" | "." | "..")
                && part.trim_end_matches([' ', '.']).to_lowercase() != ".git"
        })
}

validated_string!(SourcePath, "PATH", source_path);

fn branch_ref(value: &str) -> bool {
    value.starts_with("refs/heads/")
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_./-".contains(&b))
        && !value.contains("..")
        && !value.ends_with('.')
        && value
            .split('/')
            .all(|part| !part.is_empty() && !part.starts_with('.') && !part.ends_with(".lock"))
}

validated_string!(BranchRef, "REF", branch_ref);

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Operation {
    pub id: OperationId,
    pub kind: OperationKind,
    pub task: Option<TaskId>,
    pub status: Status,
    pub effect: Effect,
    pub result: Option<serde_json::Value>,
    pub error: Option<Fault>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_identifiers_must_pass_the_constructor() {
        for bad in ["", "../task", "한글", "-task", "a b", &"a".repeat(129)] {
            assert!(
                serde_json::from_value::<TaskId>(bad.into()).is_err(),
                "{bad:?}"
            );
        }
        for good in ["task", "0", "request:1", "A._-:", &"a".repeat(128)] {
            assert_eq!(RequestId::new(good).unwrap().as_str(), good);
        }
    }

    #[test]
    fn checkpoint_formats_are_distinct_from_content_digests() {
        assert!(Checkpoint::new("a".repeat(40)).is_ok());
        assert!(Checkpoint::new("f".repeat(64)).is_ok());
        assert!(Digest::new("a".repeat(40)).is_err());
        for bad in ["A".repeat(40), "g".repeat(64), "a".repeat(41)] {
            assert!(Checkpoint::new(bad).is_err());
        }
    }

    #[test]
    fn uncertain_status_does_not_mean_retry_or_terminal() {
        assert!(!Status::Unknown.is_terminal());
        let failed = Operation {
            id: OperationId::new("op").unwrap(),
            kind: OperationKind::Exec,
            task: None,
            status: Status::Failed,
            effect: Effect::Committed,
            result: Some(serde_json::json!({"exitCode": 7})),
            error: None,
        };
        let value = serde_json::to_value(&failed).unwrap();
        assert_eq!(value["effect"], "committed");
        assert_eq!(serde_json::from_value::<Operation>(value).unwrap(), failed);
    }

    #[test]
    fn source_paths_and_refs_reject_traversal_and_git_metadata() {
        for bad in [
            "",
            "/a",
            "../a",
            "a/../b",
            "a//b",
            ".GiT /config",
            "a\\b",
            "a\n",
        ] {
            assert!(SourcePath::new(bad).is_err(), "{bad:?}");
        }
        assert!(SourcePath::new("경로/a.txt").is_ok());
        assert!(BranchRef::new("refs/heads/work/task-1").is_ok());
        for bad in [
            "HEAD",
            "main",
            "refs/heads/",
            "refs/heads/a..b",
            "refs/heads/.x",
            "refs/heads/a.lock",
        ] {
            assert!(BranchRef::new(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn lifecycle_vocabulary_matches_the_contract() {
        let schema: serde_json::Value =
            serde_json::from_str(include_str!("../contracts/tools.schema.json")).unwrap();
        let properties = &schema["$defs"]["Operation"]["properties"];
        for value in properties["status"]["enum"].as_array().unwrap() {
            let status: Status = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(status).unwrap(), *value);
        }
        for value in properties["effect"]["enum"].as_array().unwrap() {
            let effect: Effect = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(effect).unwrap(), *value);
        }
        assert!(serde_json::from_str::<Status>("\"retry\"").is_err());
    }
}
