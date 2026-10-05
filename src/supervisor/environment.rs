//! A task's dependency lease outlives changes to its dependency directory.
use super::spool::{checked_directory, lock_file, private_directory};
use crate::model::TaskId;
use serde::{Deserialize, Serialize};
use std::fs::{File, TryLockError};
use std::io;
use std::path::{Path, PathBuf};

pub const DEPENDENCY_LIMIT: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Environment {
    root: PathBuf,
    task: TaskId,
}

impl Environment {
    pub fn new(root: &Path, task: TaskId) -> io::Result<Self> {
        private_directory(root)?;
        private_directory(&root.join(".leases"))?;
        Ok(Self {
            root: root.into(),
            task,
        })
    }

    pub fn path(&self) -> PathBuf {
        self.root.join(self.task.as_str())
    }

    pub(super) fn validate(&self) -> io::Result<()> {
        if !self.root.is_absolute()
            || self.root.as_os_str().as_encoded_bytes().contains(&0)
            || self.root.components().any(|component| {
                !matches!(
                    component,
                    std::path::Component::RootDir | std::path::Component::Normal(_)
                )
            })
        {
            return Err(io::Error::other("Invalid frozen dependency location"));
        }
        Ok(())
    }

    fn file(&self) -> io::Result<File> {
        self.validate()?;
        checked_directory(&self.root)?;
        checked_directory(&self.root.join(".leases"))?;
        // Task IDs may end in .lock. A separate namespace prevents a lease filename
        // from colliding with another task's dependency directory.
        lock_file(&self.root.join(".leases").join(self.task.as_str()))
    }

    /// Only the kernel exclusion mechanism. Admission must independently prove there
    /// are no running/unknown consumers before deleting or resetting dependencies.
    pub fn try_exclusive(&self) -> io::Result<ExclusiveEnvironment> {
        let lock = self.file()?;
        acquire(lock.try_lock())?;
        Ok(ExclusiveEnvironment {
            _lock: lock,
            path: self.path(),
        })
    }

    pub(super) fn shared(&self) -> io::Result<SharedEnvironment> {
        let lock = self.file()?;
        acquire(lock.try_lock_shared())?;
        let path = self.path();
        private_directory(&path)?;
        for name in ["pip-cache", "npm-cache", "xdg-cache"] {
            private_directory(&path.join(name))?;
        }
        Ok(SharedEnvironment { _lock: lock, path })
    }
}

pub struct ExclusiveEnvironment {
    _lock: File,
    path: PathBuf,
}

impl ExclusiveEnvironment {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

pub(super) struct SharedEnvironment {
    _lock: File,
    path: PathBuf,
}

impl SharedEnvironment {
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn within_budget(&self, job: &super::Job) -> io::Result<bool> {
        checked_directory(&self.path)?;
        job.check_budget([self.path.clone()], DEPENDENCY_LIMIT, 100000, "dependency")
    }
}

fn acquire(result: Result<(), TryLockError>) -> io::Result<()> {
    match result {
        Ok(()) => Ok(()),
        Err(TryLockError::WouldBlock) => Err(io::Error::new(
            io::ErrorKind::WouldBlock,
            "Task environment is leased",
        )),
        Err(TryLockError::Error(error)) => Err(error),
    }
}
