//! Private immutable source composition and atomic three-way delta construction.
use super::*;
use serde::Serialize;

pub enum Choice {
    Current,
    Incoming,
    Base,
    Delete,
    Content { mode: FileMode, data: Vec<u8> },
}

pub struct Resolution {
    pub path: SourcePath,
    pub choice: Choice,
}

#[derive(Serialize)]
pub struct Conflict {
    pub path: SourcePath,
    pub reason: &'static str,
    pub base: Option<Entry>,
    pub current: Option<Entry>,
    pub incoming: Option<Entry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Integration {
    pub checkpoint: Checkpoint,
    pub applied: bool,
    pub conflicts: Vec<Conflict>,
    pub conflict_count: usize,
    pub conflicts_truncated: bool,
}

fn collisions(entries: &Entries) -> BTreeSet<SourcePath> {
    let mut names = BTreeSet::new();
    for name in entries.keys() {
        for (position, _) in name.as_str().match_indices('/') {
            let parent =
                SourcePath::new(&name.as_str()[..position]).expect("Validated source prefix");
            if entries.contains_key(&parent) {
                names.extend([parent, name.clone()]);
            }
        }
    }
    names
}

impl Git {
    /// Sources are already authorized by the feature owner, with current pointers
    /// checked separately from these immutable Git checkpoints.
    pub fn compose(
        &self,
        base: &Checkpoint,
        sources: &[(Checkpoint, Checkpoint)],
        operation: &OperationId,
    ) -> Result<Checkpoint> {
        let mut combined = self.entries(base)?;
        for (source_base, checkpoint) in sources {
            if !self.is_ancestor(source_base, base)? {
                return Err(Fault::new("UNRELATED_BASE"));
            }
            let before = self.entries(source_base)?;
            let after = self.entries(checkpoint)?;
            let names: BTreeSet<_> = before.keys().chain(after.keys()).collect();
            for name in names {
                if before.get(name) == after.get(name) {
                    continue;
                }
                if combined.get(name) != before.get(name) && combined.get(name) != after.get(name) {
                    return Err(Fault::new("COMPOSE_CONFLICT"));
                }
                if let Some(entry) = after.get(name) {
                    combined.insert(name.clone(), entry.clone());
                } else {
                    combined.remove(name);
                }
            }
        }
        self.commit(
            &self.write_tree(&combined)?,
            base,
            &format!("compose {operation}"),
        )
    }

    pub fn integrate(
        &self,
        checkpoint: &Checkpoint,
        base: &Checkpoint,
        incoming: &Checkpoint,
        resolutions: &[Resolution],
        operation: &OperationId,
    ) -> Result<Integration> {
        let before = self.entries(base)?;
        let ours = self.entries(checkpoint)?;
        let theirs = self.entries(incoming)?;
        let mut merged = Entries::new();
        let mut conflicts = BTreeMap::new();
        let conflict = |path: &SourcePath, reason| Conflict {
            path: path.clone(),
            reason,
            base: before.get(path).cloned(),
            current: ours.get(path).cloned(),
            incoming: theirs.get(path).cloned(),
        };
        let names: BTreeSet<_> = before
            .keys()
            .chain(ours.keys())
            .chain(theirs.keys())
            .collect();
        for name in names {
            let (b, o, t) = (before.get(name), ours.get(name), theirs.get(name));
            let selected = if o == t || t == b {
                o.cloned()
            } else if o == b {
                t.cloned()
            } else {
                let reason = match (b, o, t) {
                    (Some(b), Some(o), Some(t)) => {
                        if [b, o, t]
                            .iter()
                            .any(|entry| entry.mode == FileMode::Symlink)
                        {
                            Some("type-or-link")
                        } else {
                            let mode = if o.mode == b.mode {
                                Some(t.mode)
                            } else if t.mode == b.mode || t.mode == o.mode {
                                Some(o.mode)
                            } else {
                                None
                            };
                            let data = [
                                self.blob(&o.blob)?,
                                self.blob(&b.blob)?,
                                self.blob(&t.blob)?,
                            ];
                            if data.iter().any(|bytes| bytes.contains(&0)) {
                                Some("binary")
                            } else if let Some(mode) = mode {
                                if let Some(data) = self.merge_file(&data)? {
                                    merged.insert(
                                        name.clone(),
                                        Entry {
                                            mode,
                                            blob: self.hash_blob(&data)?,
                                        },
                                    );
                                    continue;
                                }
                                Some("content")
                            } else {
                                Some("mode")
                            }
                        }
                    }
                    (None, _, _) => Some("add-add"),
                    _ => Some("delete-modify"),
                };
                if let Some(reason) = reason {
                    conflicts.insert(name.clone(), conflict(name, reason));
                }
                o.cloned()
            };
            if let Some(entry) = selected {
                merged.insert(name.clone(), entry);
            }
        }
        for name in collisions(&merged) {
            conflicts.insert(name.clone(), conflict(&name, "path-collision"));
        }
        let mut seen = BTreeSet::new();
        for resolution in resolutions {
            let name = &resolution.path;
            if !seen.insert(name) {
                return Err(Fault::new("DUPLICATE_PATH"));
            }
            if !conflicts.contains_key(name) {
                return Err(Fault::new("RESOLUTION_NOT_REQUIRED"));
            }
            let selected = match &resolution.choice {
                Choice::Current => ours.get(name).cloned(),
                Choice::Incoming => theirs.get(name).cloned(),
                Choice::Base => before.get(name).cloned(),
                Choice::Delete => None,
                Choice::Content { mode, data } => {
                    if data.len() > BLOB_LIMIT {
                        return Err(Fault::new("SOURCE_LIMIT"));
                    }
                    Some(Entry {
                        mode: *mode,
                        blob: self.hash_blob(data)?,
                    })
                }
            };
            if let Some(entry) = selected {
                merged.insert(name.clone(), entry);
            } else {
                merged.remove(name);
            }
            conflicts.remove(name);
        }
        for name in collisions(&merged) {
            conflicts.insert(name.clone(), conflict(&name, "path-collision"));
        }
        let count = conflicts.len();
        let checkpoint = if count == 0 {
            self.commit(
                &self.write_tree(&merged)?,
                checkpoint,
                &format!("integrate {operation}"),
            )?
        } else {
            checkpoint.clone()
        };
        Ok(Integration {
            checkpoint,
            applied: count == 0,
            conflicts: conflicts.into_values().take(50).collect(),
            conflict_count: count,
            conflicts_truncated: count > 50,
        })
    }

    fn merge_file(&self, data: &[Vec<u8>; 3]) -> Result<Option<Vec<u8>>> {
        let directory = tempfile::Builder::new()
            .prefix("merge-")
            .tempdir_in(&self.root)
            .map_err(|_| Fault::new("GIT_STORE"))?;
        let files = ["current", "base", "incoming"].map(|side| directory.path().join(side));
        for (path, bytes) in files.iter().zip(data) {
            fs::write(path, bytes).map_err(|_| Fault::new("GIT_STORE"))?;
        }
        let output = run(
            command(Some(&self.root))
                .args(["merge-file", "-p", "--diff3"])
                .args(&files),
            &[],
            UTILITY_TIMEOUT,
            OUTPUT_LIMIT,
            false,
        )?;
        match output.status.code() {
            Some(0) => {
                if output.stdout.len() > BLOB_LIMIT {
                    return Err(Fault::new("SOURCE_LIMIT"));
                }
                Ok(Some(output.stdout))
            }
            Some(1..=127) => Ok(None),
            _ => Err(Fault::new("MERGE_FAILED")),
        }
    }
}
