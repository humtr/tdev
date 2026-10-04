//! Exact local ref deletion; configured namespaces alone never establish ownership.
use super::*;
use crate::model::Effect;

impl Git {
    pub fn check_delete(&self, branch: &BranchRef, expected: &Checkpoint) -> Result<()> {
        let result = (|| {
            self.format.check(expected.as_str())?;
            if self.repository.refs.contains(branch)
                || !self
                    .repository
                    .namespaces
                    .iter()
                    .any(|ns| branch.as_str().starts_with(ns))
            {
                return Err(Fault::new("REF_DENIED"));
            }
            if self.head(branch)?.as_ref() != Some(expected) {
                return Err(Fault::new("STALE_HEAD"));
            }
            let worktrees = utility(
                Some(&self.repository.remote),
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
            utility(
                Some(&self.repository.remote),
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
