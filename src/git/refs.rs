//! Exact ref deletion; configured namespaces alone never establish ownership.
use super::*;
use crate::model::Effect;

impl Git {
    pub fn check_delete(&self, branch: &BranchRef, expected: &Checkpoint) -> Result<()> {
        let result = (|| {
            self.format.check(expected.as_str())?;
            if self.repository.refs().contains(branch)
                || !self
                    .repository
                    .namespaces()
                    .iter()
                    .any(|ns| branch.as_str().starts_with(ns))
            {
                return Err(Fault::new("REF_DENIED"));
            }
            if self.head(branch)?.as_ref() != Some(expected) {
                return Err(Fault::new("STALE_HEAD"));
            }
            if let Repository::Local(local) = &self.repository {
                let worktrees = utility(
                    Some(&local.remote),
                    &["worktree", "list", "--porcelain", "-z"],
                    &[],
                    UTILITY_TIMEOUT,
                    true,
                )?;
                let checked = format!("branch {branch}");
                if worktrees
                    .stdout
                    .split(|b| *b == 0)
                    .any(|record| record == checked.as_bytes())
                {
                    return Err(Fault::new("REF_CHECKED_OUT"));
                }
            }
            self.verify_identity()
        })();
        // This phase only observes; an uncertain utility exit is not a ref effect.
        result.map_err(|mut error: Fault| {
            error.effect = Effect::None;
            error
        })
    }

    /// The caller must durably journal dispatch uncertainty before entering here.
    pub fn delete_ref(&self, branch: &BranchRef, expected: &Checkpoint) -> Result<()> {
        self.check_delete(branch, expected)?;
        let result = (|| {
            match &self.repository {
                Repository::Local(local) => {
                    utility(
                        Some(&local.remote),
                        &[
                            "update-ref",
                            "--no-deref",
                            "-d",
                            branch.as_str(),
                            expected.as_str(),
                        ],
                        &[],
                        UTILITY_TIMEOUT,
                        true,
                    )?;
                }
                Repository::Github { .. } => {
                    self.repository.run_transport(
                        self.repository
                            .transport(Some(&self.root))
                            .arg("push")
                            .arg(format!("--force-with-lease={branch}:{expected}"))
                            .arg("--")
                            .arg(self.repository.remote())
                            .arg(format!(":{branch}")),
                        FETCH_TIMEOUT,
                    )?;
                }
            }
            if self.head(branch)?.is_some() {
                return Err(Fault::new("REF_MUTATION_UNKNOWN"));
            }
            Ok(())
        })();
        result.map_err(|mut error: Fault| {
            error.effect = Effect::Unknown;
            error
        })
    }
}

impl Git {
    pub fn validation_candidate(
        &self,
        checkpoint: &Checkpoint,
        base: &Checkpoint,
        message: &str,
        operation: &OperationId,
    ) -> Result<Checkpoint> {
        self.retain_commit(base)?;
        self.commit(
            &self.tree(checkpoint)?,
            base,
            &format!("{message}\n\ntdev-validation: {operation}"),
        )
    }

    pub fn check_candidate(
        &self,
        checkpoint: &Checkpoint,
        base: &Checkpoint,
        candidate: &Checkpoint,
    ) -> Result<()> {
        if self.tree(checkpoint)? != self.tree(candidate)? {
            return Err(Fault::new("VALIDATION_SOURCE_CHANGED"));
        }
        let parents = self.call(
            &["rev-list", "--parents", "-n", "1", candidate.as_str()],
            &[],
        )?;
        if line(&parents.stdout)? != format!("{candidate} {base}") {
            return Err(Fault::new("DIRECT_CHILD_REQUIRED"));
        }
        Ok(())
    }

    pub fn check_publish(
        &self,
        branch: &BranchRef,
        old: Option<&Checkpoint>,
        new: &Checkpoint,
    ) -> Result<()> {
        let result = (|| {
            self.format.check(new.as_str())?;
            if old.is_some() != self.repository.refs().contains(branch)
                || !self.repository.allowed(branch)
            {
                return Err(Fault::new("REF_DENIED"));
            }
            if self.head(branch)?.as_ref() != old {
                return Err(Fault::new("STALE_HEAD"));
            }
            if let Some(old) = old {
                self.format.check(old.as_str())?;
                let parents =
                    self.call(&["rev-list", "--parents", "-n", "1", new.as_str()], &[])?;
                if line(&parents.stdout)? != format!("{new} {old}") {
                    return Err(Fault::new("DIRECT_CHILD_REQUIRED"));
                }
            }
            if let Repository::Local(local) = &self.repository {
                let output = utility(
                    Some(&local.remote),
                    &["worktree", "list", "--porcelain", "-z"],
                    &[],
                    UTILITY_TIMEOUT,
                    true,
                )?;
                if output
                    .stdout
                    .split(|b| *b == 0)
                    .any(|line| line == format!("branch {branch}").as_bytes())
                {
                    return Err(Fault::new("REF_CHECKED_OUT"));
                }
            }
            self.verify_identity()
        })();
        result.map_err(|mut error: Fault| {
            error.effect = Effect::None;
            error
        })
    }

    /// Intent must already be durable. No force update, no retry after dispatch.
    pub fn publish_ref(
        &self,
        branch: &BranchRef,
        old: Option<&Checkpoint>,
        new: &Checkpoint,
    ) -> Result<()> {
        self.check_publish(branch, old, new)?;
        let zero = "0".repeat(new.as_str().len());
        let old = old.map(Checkpoint::as_str).unwrap_or(&zero);
        let result = (|| {
            match &self.repository {
                Repository::Local(local) => {
                    let mut transfer = command(Some(&local.remote));
                    transfer
                        .args([
                            "-c",
                            "fetch.unpackLimit=1",
                            "fetch",
                            "--no-tags",
                            "--no-write-fetch-head",
                            "--",
                        ])
                        .arg(&self.root)
                        .arg(new.as_str());
                    run(&mut transfer, &[], FETCH_TIMEOUT, OUTPUT_LIMIT, true)?;
                    self.verify_identity()?;
                    utility(
                        Some(&local.remote),
                        &[
                            "update-ref",
                            "--no-deref",
                            branch.as_str(),
                            new.as_str(),
                            old,
                        ],
                        &[],
                        UTILITY_TIMEOUT,
                        true,
                    )?;
                }
                Repository::Github { .. } => {
                    use std::os::unix::fs::PermissionsExt;
                    let hooks =
                        tempfile::tempdir_in(&self.root).map_err(|_| Fault::new("GIT_IO"))?;
                    let hook = hooks.path().join("pre-push");
                    // Ref/OIDs are validated domain values; no arbitrary shell text enters here.
                    fs::write(&hook,format!("#!/bin/sh\ncount=0\nwhile read localref localoid remoteref remoteoid; do\n count=$((count + 1))\n [ \"$localoid\" = '{new}' ] && [ \"$remoteoid\" = '{old}' ] && [ \"$remoteref\" = '{branch}' ] || exit 1\ndone\n[ \"$count\" = 1 ]\n")).map_err(|_|Fault::new("GIT_IO"))?;
                    fs::set_permissions(&hook, fs::Permissions::from_mode(0o700))
                        .map_err(|_| Fault::new("GIT_IO"))?;
                    self.repository.run_transport(
                        self.repository
                            .transport(Some(&self.root))
                            .arg("-c")
                            .arg(format!("core.hooksPath={}", hooks.path().display()))
                            .args(["push", "--porcelain", "--"])
                            .arg(self.repository.remote())
                            .arg(format!("{new}:{branch}")),
                        FETCH_TIMEOUT,
                    )?;
                }
            }
            if self.head(branch)?.as_ref() != Some(new) {
                return Err(Fault::new("PUBLICATION_UNKNOWN"));
            }
            Ok(())
        })();
        result.map_err(|mut error: Fault| {
            error.effect = Effect::Unknown;
            error
        })
    }

    pub fn published_contains(&self, head: &Checkpoint, candidate: &Checkpoint) -> Result<bool> {
        self.verify_identity()?;
        let mut command = self.repository.transport(Some(&self.root));
        command
            .args([
                "-c",
                "fetch.unpackLimit=1",
                "fetch",
                "--no-tags",
                "--no-write-fetch-head",
                "--",
            ])
            .arg(self.repository.remote())
            .arg(head.as_str());
        self.repository.run_transport(&mut command, FETCH_TIMEOUT)?;
        self.verify_identity()?;
        self.is_ancestor(candidate, head)
    }
}
