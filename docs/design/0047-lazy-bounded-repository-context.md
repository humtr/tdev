# Design 0047 — Lazy Bounded Repository Context

- Status: `accepted`
- Revision: 2
- Class: 2
- Decision date: 2026-09-06
- Acceptance base: `development@7a40877b365c9f0ad8037ecc9a9a57ba450ecc0a`
- Predecessor revision: D0047@r1 accepted at `development@81a7ce689ff81e4d8bd071dc2c43ec6319b9820d`; its acceptance evidence is `docs/evidence/group-f-d0047-r1-lazy-context-design-acceptance-2026-09-06.json`
- Trigger: the first lazy source slice prepared a correct manifest and bounded reads but left the durable development-unit path carrying an unbound context identity, rematerializing the wrong profile after a retry, and keeping candidate/workspace ownership outside the warden. The corrected contract joins the lazy reference to the exact Case base and candidate lifecycle without changing the meaning of the full base digest.
- Acceptance evidence: `docs/evidence/group-f-d0047-r2-lazy-case-candidate-contract-2026-09-06.json`
- Scope: an explicit owner-issued lazy manifest and bounded list/search/read context for the tdev development path
- Affected owners: `src/repository-model-transport.mjs`, `src/mcp-development-adapter.mjs`, `src/development-unit.mjs`, `src/plan.mjs`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/MCP.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, focused tests
- Preserved owners: D0019 remains Case/Task/Attempt/result/Promotion authority; D0013/D0014/D0017 remain repository preparation and selected-delivery owners for their accepted full-context profile; D0043 remains the typed local operation boundary; D0046 remains the first tdev MCP composition; D0025 remains Git publication authority
- Explicit non-goals: no arbitrary client-selected exclusions, no hostile-local-code or multi-tenant isolation, no silent full-context fallback, no change to the existing full-tree Plan digest, no Git publication, no tmcp comparison

## 1. Decision

The default development context for new lazy-capable callers is an immutable manifest plus an owner-issued scope. The exact repository identity is fixed first by repository, object format, commit OID and tree OID. A complete manifest binds every tree entry's path, mode, type, blob OID and byte length and is identified by `manifestDigest`. The Case/Plan owner supplies the semantic `baseDigest`; the context adapter never replaces it with a digest of a subset.

The new profile is `tdev.repository-context.git-scoped-lazy.v1`. It has three bounded operations:

1. `manifest` reads deterministic pages of complete entry metadata using a stable cursor and a finite page limit. It may account for a large manifest without allocating blob contents.
2. `list` selects paths from that manifest under an owner-issued prefix/path scope and finite file/byte/result bounds.
3. `read` fetches only an exact manifest entry, optionally within a bounded byte range, and proves the returned blob OID, mode, encoding and byte count.

The scope is a typed, immutable value issued by the context owner. It contains only normalized relative paths or prefixes, a scope digest, and finite limits. A request cannot widen it, choose a repository path, executable, environment, provider URL or credential. Search is a bounded operation over the admitted scope; truncated or cancelled search is reported as incomplete and cannot be treated as complete context.

The scoped descriptor carries both whole-snapshot identity (`commitOid`, `treeOid`, `manifestDigest`, owner-supplied `baseDigest`) and selected-content identity (`scopeDigest`, `contextDigest`). These identities are never substituted for one another. Binary, executable, symlink, submodule and unsupported entry metadata remain in the manifest even when their contents are not readable by the text scope. Unsupported read or write requests fail closed.

The existing `tdev.repository-context.git-full-text.v1` profile remains a compatibility profile for already compiled full-tree Plans. It is not fed an exclusion list to simulate a scope. `contextExcludedPaths` is removed from new lazy bindings; a legacy binding that uses it remains historical and cannot authorize the lazy profile. There is no inline full-context fallback after a lazy read/reference error.

## 2. Ownership and compatibility

The context owner issues the scope and binds it to the exact Case/Plan contract. Case/Plan retains ownership of lifecycle, Plan identity and base semantics. Repository transport owns Git reads and immutable descriptor validation. The model executor receives an opaque context reference and only the selected, bounded files. Candidate materialization still starts from the exact commit clone; a scoped context does not authorize canonical-tree mutation or a second candidate owner.

Legacy v2 Plans continue to use their full `baseTree` and `baseDigest` until a separately accepted Plan representation supports a lazy reference. A new scoped development-unit Plan or MCP request must carry `manifestDigest`, `scopeDigest`, a declared context profile and the owner-issued full-base identity. Its model input carries the same profile, scope, scope digest and identity on retry, and its result/candidate digest states whether it is a full canonical candidate or a scoped projection. No old digest field is silently reinterpreted.

The manifest may be paged, but the complete manifest root must be stable across pages. A changed commit, tree, object format, manifest page, blob OID, mode, size, scope or authorization contract invalidates the reference. Cache entries are disposable and rebuildable from the exact commit; cache presence never authorizes a read.

## 3. Resource and failure rules

- Metadata, blob and decoded-content budgets are separate finite counters.
- A large repository is admitted when its manifest fits the manifest/page limits even if its contents do not fit a full-context limit.
- `read` rejects path traversal, missing/stale OID, mode/type mismatch, invalid UTF-8, range overflow and byte-limit overflow.
- `list` and `search` return explicit `complete`/`truncated` state and a stable next cursor. A timeout, cancellation, provider disconnect or missing page is unknown/incomplete, never success.
- The adapter does not call `cat-file --batch` for files outside the requested scope.
- A manifest or scope mismatch prevents model launch and leaves the canonical checkout, Case and Git ref unchanged.
- Full-context loading is an explicitly named stress profile and is separately qualified; it is not the lazy profile's success path.

The source-compatible v2 development-unit path retains the existing full-tree Plan representation for Case/Promotion compatibility. It does not claim that a 1 GB repository can be placed in a durable Case snapshot. Until a separately accepted D0019 Plan representation stores a lazy base reference instead of `baseTree`, a large-repository request may use the manifest/read primitives and a disposable full exact-commit candidate only in a gate that can prove its storage budget. A request that cannot satisfy that gate remains blocked; it must not manufacture a subset digest or silently fall back to eager full context.

For a scoped model operation, the model workspace is a sparse checkout containing only admitted files while its `HEAD` remains the exact base commit. Candidate materialization is a separate full exact-commit clone. The warden owns both disposable roots and the model/validation process groups; positive absence receipts are required before reuse. Reads enforce both selected-byte and scanned-prefix limits, and incomplete/truncated search is never a complete context.

## 4. Acceptance matrix

| Gate | Required evidence |
| --- | --- |
| CP1 scoped path | a small owner-issued scope drives local MCP → Agent → disposable candidate → fixed validation once; no arbitrary exclusion, canonical mutation or credential disclosure |
| CP2 full repository | the complete manifest is fixed while one or two files are read lazily; request/context allocation is bounded by selected content rather than total contents |
| CP3 1 GB | generated exact commit with large binary/text entries preserves manifest identity, bounded reads, cancellation and cleanup; a separate full-context stress run records unsupported/limit outcomes without being called lazy PASS |
| identity | commit/tree/object-format/base/manifest/scope/context/candidate digests remain distinct and exact-joined |
| negative path | wrong commit, stale scope, missing path, range/byte limit, truncated search and changed manifest all fail closed without a candidate or promotion |

Cheapest falsifiers are a subset digest accepted as the canonical base, an unbound path exclusion changing the digest, any request allocating all blob contents for a bounded read, a missing manifest entry, a silent full-context fallback, or an incomplete search reported as complete.

## 5. Follow-on gates

Revision 2 authorizes the source lazy primitive, its durable development-unit identity binding and its local CP1/CP2/CP3 qualification. Provider deployment and current-client claims remain under D0046 and require fresh source/package/provider readback. A true metadata-only durable Case/Plan representation, changes to public MCP schemas, or a new persistent content owner still requires the affected Class-2 revision before implementation.
