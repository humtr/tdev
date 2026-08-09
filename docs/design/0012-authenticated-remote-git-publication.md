# Design 0012 — Authenticated Remote Git Publication

- Status: accepted
- Class: 2
- Development identity: `mvp-1a-7` — same active development direction
- Direct source predecessor: exact `mvp-1a-7@ab498c233da9cd7a414986f596f602871d86d203`
- Semantic/projection precursors: verified D0010 `tdev.semantic.path-byte-radix.v1` and D0011 `tdev.git.text-tree.v1`
- Remote publication profile: `tdev.git.remote-existing-branch.v1`

> Accepted direction decision: D0012 keeps the D0010 semantic root and transactional Case head as tdev authority. It extends the D0011 derived Git candidate to one authenticated **existing remote branch**. Remote Git OIDs, provider refs, credentials, and provider policy do not become semantic/current-state authority. Therefore D0012 continues on `mvp-1a-7`; if implementation would require provider state to replace that authority, implementation must stop as a new-direction decision boundary.

## 1. Decision

D0012 adds one bounded remote publication adapter after a D0011 local Git candidate has been validated and locally elected. The first profile publishes only to an already-existing full `refs/heads/...` branch. It does not create or delete remote branches.

The remote adapter consumes a D0011 projection candidate whose `expectedRefOid` is non-null. The candidate commit already binds the exact D0010 semantic root, Git tree, commit bytes, publication ref, and sole predecessor. Initial remote publication additionally requires the D0011 local publication ref to be at that candidate commit, so remote publication cannot bypass the verified local projection lane.

The resulting authority order remains:

```text
D0010 Case head -> D0010 semantic root -> D0011 local Git candidate/ref -> D0012 authenticated remote projection ref
```

Only the first two items are tdev semantic/current-state authority. The Git refs are publication views.

## 2. Why this is not a new development direction

D0012 does not change Case restore, Promotion, semantic-root identity, schema-v3 snapshots, the transactional Case head, v2/v3 migration, downgrade barriers, repair, GC, or D0011 candidate identity. It adds a provider-facing external-effect lane above those contracts.

A future design **would** cross the development-direction boundary if it made a provider ref/OID elect tdev current semantic state, replaced the D0010 Case head, made provider transactions own Case lifecycle, or broke the existing migration/rollback continuity. D0012 explicitly forbids those changes.

## 3. Remote target identity

The adapter is configured with a local D0011 `GitProjectionAdapter` and a Git remote name. It accepts no remote URL, token, password, SSH private key, cookie, or authorization header as public contract data.

Before observation or mutation it resolves the remote's push URL through Git and requires exactly one effective push URL. The clear URL is process-local deployment state and is not written to a candidate, receipt, evidence object, snapshot, or Case result. A domain-separated `remoteIdentityDigest` binds the remote name and resolved push URL so a changed remote target fails closed without persisting the clear URL. Before any mutation, `preparePublication(candidate)` creates an immutable remote-publication intent that binds the D0011 candidate plus that remote identity and exact observed predecessor. This intent is the restart-safe statement of **which remote target was authorized**; a later reconciliation may not infer that target from mutable Git config.

The first profile uses:

- remote identity domain `tdev.git.remote-identity.v1`;
- remote intent domain `tdev.git.remote-publication-intent.v1`;
- remote receipt domain `tdev.git.remote-publication-receipt.v1`;
- one remote name;
- one D0011 full `refs/heads/...` publication ref;
- one existing predecessor commit.

Multiple push URLs, wildcard refspecs, tags, symbolic refs, branch creation, branch deletion, and provider-specific mutable repository identifiers are outside this profile.

## 4. Authentication and secret ownership

Authentication is owned by deployment outside tdev semantic state. The default Git transport may use the caller's already-configured Git credential helper or SSH agent, but the adapter:

- accepts no raw credential parameter;
- never prompts interactively (`GIT_TERMINAL_PROMPT=0`);
- does not serialize credential environment/configuration;
- does not place clear remote URLs or remote command stderr in canonical receipts;
- strips inherited `GIT_*` process-routing overrides before launching Git, while ordinary deployment environment such as `HOME` or `SSH_AUTH_SOCK` may supply the external authentication context;
- disables repository hooks for adapter plumbing.

Authentication failure, provider authorization failure, protected-branch rejection, transport failure, and response loss are not inferred from provider text. Outcome is determined only by a durable remote-ref reread when that reread is available.

## 5. D0011 candidate admission

D0011 gains one read-only public candidate-validation method so D0012 can revalidate candidate digest, semantic-tree binding, commit bytes, object format, repository, and publication ref without requiring the local ref to remain at that candidate forever.

`preparePublication(candidate)` additionally requires local D0011 reconciliation to report `applied`, requires the remote branch to be at the exact predecessor, and returns an immutable intent binding candidate digest, semantic root, object format, remote name, `remoteIdentityDigest`, publication ref, predecessor OID, candidate commit OID, and an `intentDigest`. The clear URL is not included.

`publish(intent, candidate)` revalidates both immutable inputs, rechecks the same remote identity, and requires the local D0011 ref still to report `applied` immediately before the first remote mutation. This preserves post-Promotion -> local publication -> remote publication ordering and prevents publishing a candidate that became locally stale after preparation. Restart reconciliation does **not** require that local ref to remain current because its purpose is only to classify an already-attempted remote effect.

D0012 rejects a candidate with `expectedRefOid === null`, malformed or semantically invalid candidate bytes, a candidate for another local repository/ref/object format, a candidate whose local publication has not won at preparation/publish admission, an intent/candidate mismatch, or a changed remote identity.

## 6. Remote observation

Remote ref observation is read-only and uses an exact full ref query. `git ls-remote --exit-code --refs` distinguishes a found branch from a successfully contacted remote with no matching branch. The first profile requires the branch to exist; absence is `remote_git_branch_absent`, not an implicit create operation.

Canonical observation returns only schema/profile, remote name, `remoteIdentityDigest`, publication ref, and observed OID. No credential material or clear URL is returned.

## 7. Exact-predecessor publication

Before mutation, D0012 requires the current remote identity to match the immutable intent and the observed remote OID to equal both the intent predecessor and the D0011 candidate's exact `expectedRefOid`.

The Git transport then publishes exactly one ref using the explicit expected-value lease and exact refspec:

```text
--force-with-lease=<publicationRef>:<expectedRefOid>
<candidateCommitOid>:<publicationRef>
```

This flag is used only as an exact remote compare-and-swap primitive. D0012 never uses raw `--force` and never uses a `+` refspec. D0011 validation guarantees that the candidate commit's sole parent is the same `expectedRefOid`; therefore every **accepted D0012 publication update is a fast-forward** even though the explicit lease supplies the exact compare-and-swap guard. A mismatched predecessor fails instead of being overwritten.

Official Git semantics define the explicit `<ref>:<expect>` lease as requiring the current remote ref to equal the supplied expected value. The installed Git 2.55 transport and current repository also successfully complete authenticated GitHub push negotiation in dry-run mode without creating the target test ref.

## 8. Publication ambiguity and reconciliation

A push process exit status is not authority. After a successful push, and after any push error or injected response-loss fault, D0012 rereads the remote ref.

For candidate `C` with predecessor `P`:

- remote `C` -> `applied`;
- remote `P` -> `not_applied`;
- any third OID -> `conflict`;
- authoritative remote reread unavailable -> `ambiguous` and no blind replay.

A publication receipt is issued only for `applied`. `outcome` is `observed` for a normal post-push proof and `reconciled` when an error/lost response is resolved by reread.

The receipt binds profile, immutable `intentDigest`, D0011 candidate/semantic root, object format, remote name, `remoteIdentityDigest`, publication ref, predecessor OID, candidate commit OID, and outcome. Object existence on either side is never publication authority.

## 9. Restart and read-only reconciliation

`reconcilePublication(intent, candidate)` is restart-safe and read-only. It revalidates the immutable D0012 intent and local D0011 candidate, requires their bindings to agree, re-resolves the current remote identity and requires it to equal the intent's `remoteIdentityDigest`, then reads the remote ref and classifies candidate/predecessor/third state. It does not push objects or move refs. A changed remote binding fails before a result is promoted.

## 10. Fenced rollback

Rollback is a separate explicit remote mutation, never an automatic retry. Because this profile requires an existing predecessor, rollback never deletes a remote branch.

Given a valid D0012 receipt plus its matching immutable intent and D0011 candidate, rollback revalidates all three bindings and, if the remote is still at candidate `C`, may request an exact lease `C -> P`. Provider branch policy may reject that non-fast-forward rewind. Outcome is again decided by remote reread:

- remote `P` -> rollback `applied`;
- remote `C` -> rollback `not_applied`;
- third OID -> rollback `conflict`;
- reread unavailable -> rollback `ambiguous`.

A provider rejection that leaves `C` current is safe `not_applied`; D0012 never disables protection. Operational fallback is a new forward D0011 candidate representing the desired rollback state.

## 11. Provider policy boundary

The generic Git profile observes provider policy through authenticated Git operations; it does not claim a portable API for enumerating GitHub/GitLab branch rules. Provider-specific policy introspection, bypass credentials, merge-queue ownership, signing, approval rules, and webhooks remain separate qualification work.

D0012 may classify state only from the remote ref it can authoritatively reread. A protected-branch claim may be verified only when an actual protected validation target is exercised.

## 12. Process and routing hardening

Remote Git commands use argument arrays, not shell strings. Inherited `GIT_*` routing overrides are removed; the adapter explicitly selects repository and remote name. Hooks are disabled. The remote name is strictly bounded and may not begin with `-` or contain refspec syntax. The publication ref remains the validated D0011 full branch ref.

The adapter re-resolves the effective single push URL before mutation/reconciliation. Remote command stderr is diagnostic-only and never enters canonical typed receipts because provider tooling can echo sensitive deployment details.

## 13. Acceptance matrix

| Area | Cheapest falsifier | Required result |
|---|---|---|
| direction/authority | remote ref/OID replaces D0010 semantic head/root | stop as new-direction boundary |
| candidate binding | forged/recomputed candidate or changed local Git bytes | fail before remote mutation |
| local-before-remote order | local D0011 ref has not elected candidate | fail before remote mutation |
| target identity | effective push target changes after immutable intent is prepared | fail identity check; never reconcile against the new target |
| credentials | raw credential appears in contract/receipt/evidence | reject |
| existing branch | expected branch absent | fail; never create implicitly |
| exact predecessor | sibling candidates present one predecessor | at most one winner |
| stale/regressed predecessor | remote differs from exact expected OID | no publication |
| response loss | remote applied but push result lost | `applied/reconciled` by reread |
| known rejection | provider rejects and predecessor remains | `not_applied`; no receipt |
| third state | independent writer wins | `conflict`; preserve third state |
| unreadable remote | push unknown and reread fails | `ambiguous`; no blind replay |
| restart | new adapter reconciles immutable intent + candidate | same target and classification, no mutation |
| rollback | exact candidate current | predecessor restored if policy permits, else safe rejection |
| stale rollback | remote advanced after receipt | fenced; third state preserved |
| protection | provider refuses update/rewind | never bypass provider policy |
| regression | full source suite on compatible POSIX | no D0010/D0011/v2 regression |

## 14. Validation layers

D0012 verification is layered:

1. focused source tests against real local bare Git remotes for exact lease, races, response-loss reconciliation, restart, rollback, target identity, and secret non-persistence;
2. full source/coverage/diff gate on a compatible POSIX runtime;
3. authenticated provider capability evidence that deployment Git can negotiate push without interactive credentials;
4. actual provider publication evidence only on a dedicated validation ref or the normal canonical fast-forward lane with exact external preconditions.

Unprotected GitHub evidence cannot be promoted into protected-branch semantics.

## 15. Non-goals

D0012 does not add semantic authority in Git/provider state, remote branch creation/deletion in the first profile, provider-rule administration/bypass, credential storage or minting, signed refs/commits, multi-host Case ownership, distributed Claims, atomic SQLite/provider transactions, provider Git-object GC, ContextSlice/model transport, or Cloudflare deployment.

## 16. Completion boundary

D0012 may be `verified` only for the exact layers independently exercised. Source verification can prove the generic authenticated remote publication protocol while provider-specific protected-branch behavior remains explicitly pending if no protected validation target exists.

No D0012 milestone creates a new `mvp-*` branch. A new branch is required only if a separately accepted future design promotes provider/Git state into tdev semantic/current-state authority or otherwise abandons the D0010 continuity contract.
