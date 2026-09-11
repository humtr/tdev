# P3/P4 implementation and falsifiers

Execution began from fresh `2807644416d776e58be43bb45ae8a1187e933d28`, then published
routing at `44bc8ef1bc3edc4ad40c8f58135558077eee559d` split simultaneous implementations.
P3/P4 work uses this clean-root-descended branch and an independent context test
workspace. No predecessor source/history was copied. The small path policy module
was taken from the current dev-2 P1 candidate and checked against this contract.

Implemented: exact bare Git objects, native SHA-1/SHA-256 identities, independent
candidate construction, path-level stale composition, private materialization,
bounded progressive listing/file/search/diff, durable immutable context handles,
query/generation-bound cursors, authorization before disclosure and before reply.
No shared writable checkout/index or hardlinks are used.

Actual reproduced falsifiers and bounded corrections:

- Missing immutable context retention cannot be solved by in-memory session state.
  D0002 specifies MAC-authenticated immutable descriptors in the existing object
  store, avoiding another mutable owner. Reconstructed-service tests reuse handles.
- Gitlinks name commits, not file blobs. D0002 distinguishes their typed metadata
  and fails unresolved submodules/LFS before execution, rather than inventing bytes.
- Check-then-rename can replace an existing empty directory. Materialization uses
  exclusive destination reservation, then writes/verifies/fsyncs private contents.
  Two concurrent empty candidates have exactly one destination winner.
- Filename BOM stripping changed identity. The decoder now preserves the BOM.
- Hashing only root-tree and blob bytes accepted a corrupted intermediate tree.
  `git-corruption-before.tap` reproduces the missed rejection with an owned temporary
  Git object; `git-integrity-after.tap` verifies the correction and other boundaries.
- Context reads reused issuance timestamps and could finish after grant revocation.
  `context-before.json` records those failures. Fresh observation plus final bounded
  path reauthorization and closed stale facts fix both. `context-pinned.tap` has 16
  passing core tests using the official pinned Node binary.

Core tests use injected deterministic providers. Repository/candidate integration
uses actual Git executables, immutable Git objects, native files and eight concurrent
candidate/materialization operations. It is not an eight-process container test,
production power-loss proof, remote provider proof or live ChatGPT trial.
Final entrypoint results and test summaries are recorded alongside this document.

Bootstrap exception: tmcp shell and Git publication are needed because the canonical
dev-2 development broker is not yet usable. Official Node 24.21.0 Linux arm64 is
checksum-verified and run through a private PRoot library mapping on the authorized
host. This is a bootstrap test environment, not a production isolation claim.
No external deployment/credential or other execution's dirty workspace is mutated.

D0007 superiority thresholds, repeated trials and validation requirements are not
weakened. Actual schema usability, same-ref full-validation amplification and live
runtime remain joined implementation/evidence requirements.

## Exact modular results

Canonical core: **69/69 PASS**, including 16 context tests and the in-flight cache
regression, plus prior contracts/codec checks. Native Git/candidate focused suite:
**13/13 PASS**, including both Git object algorithms and eight concurrent private
candidates. Both used official Node 24.21.0; Git was 2.55.0. The full canonical
integration profile remains unimplemented until P5 joins the required SQLite,
ref/runner coverage. No missing layer was relabelled PASS.

An independent cache eviction also invalidated another bounded in-flight read.
`cache-before.tap` reproduces it. Each read now retains its own bounded immutable
object references while allowing other work to evict shared cache entries; it adds
no lock or durable owner. The passing core suite includes the regression.

The updated remote WORKBOARD at `b43a841a49915a43c5f165aaa519d530ec3ec199`
was incorporated by verified documentation-only fast-forward before final tests.
The integration lead's scope and its protected/orphaned earlier workspace were
preserved. There was no source replacement in another root task's workspace.

## Native context join, medium repository

The additional test `test/integration/context-native.test.mjs` joins the actual
Git reader, progressive context service and candidate editor over **10,000 files**.
Three bounded directory/search/file calls return **6,404 bytes**, versus 428,895
bytes of fixture source; only the exact selected file changes and 9,999 entries
remain unchanged. The same retained snapshot works after service reconstruction.
`context-native.tap` records PASS under the official Node pin. Its PRoot timings
are not production latency or superiority evidence. CI also runs this native
module suite explicitly; it is not relabelled as complete P5 integration coverage.

The P3/P4 commit `1b717ad1d4c29520de859225413fc3bd4f0b3d10` passed Linux x64
canonical core in Actions run `34592982335`, with input digest matching the arm64
report. It was then conditionally published to `dev-2` from parent `b43a841...`.
CI exposes a real rootless Podman 4.9.3/cgroup-v2 environment; this is a capability
observation, not the selected Podman 5.x production seal or release validation.
