# Design 0047 — Lazy Bounded Repository Context

- Status: `accepted`
- Revision: 3
- Class: 2
- Decision date: 2026-09-11
- Acceptance base: `development@e5743a4450ee0875beb7c98a2b7e07d706d6fe0e`
- Predecessor revision: D0047@r2 accepted at `development@7a40877b365c9f0ad8037ecc9a9a57ba450ecc0a`; its acceptance evidence is `docs/evidence/group-f-d0047-r2-lazy-case-candidate-contract-2026-09-06.json`
- Trigger: after the canonical D0046 runtime moved to `tdev.humtr.workers.dev/mcp`, the public context API still resolved only one deployment-time eight-file context. A new bounded self-development scope therefore still required an external bootstrap mutation or Worker redeploy, which falsifies DIRECTIVE r4 self-hosting completion even though D0047's generic lazy Git transport is already capable of exact scoped contexts.
- Acceptance evidence: live canonical/provider readback on 2026-09-11 plus read-only bootstrap investigation task `task_qf6_44421e3dc5`, which proved the fixed-context blocker, the existing D0047/D0048 identity machinery, the transferred canonical Drive namespace, and the bounded exact-release source-package size.
- Scope: owner-issued bounded self-development contexts for the exact canonical tdev release, using the existing Drive owner/namespace and existing lazy context identity without per-scope redeploy
- Affected owners: `src/mcp-surface.mjs`, `src/mcp-trial-composition.mjs`, `src/mcp-development-adapter.mjs`, `qualification/mcp-trial-base-tree-builder.mjs`, `qualification/mcp-trial-base-tree.mjs`, `qualification/cloudflare-mcp-trial-worker.mjs`, `qualification/cloudflare-case-agent-drive-worker.mjs`, `qualification/d0046-mcp-trial-deploy.mjs`, focused tests and current MCP/deployment documentation
- Preserved owners: D0019 remains Case/Task/Attempt/result/Promotion authority; D0048 remains semantic scoped-Plan identity; D0043 remains the typed local operation boundary; D0046 remains canonical MCP composition/deployment authority; D0025 remains Git publication authority; the transferred canonical Drive namespace remains the sole context registry/Drive owner rather than creating another runtime
- Explicit non-goals: no new Worker, Durable Object namespace, D1 database, Agent protocol or runtime controller; no GitHub/runtime Git fetch, branch resolution, client-selected base digest or arbitrary exclusion; no shell authority, canonical repository write or direct publication path; no silent full-context fallback; no deletion of the retained `tdev-mcp-trial` rollback source

## 1. Decision

The default development context for new lazy-capable callers is an immutable manifest plus an owner-issued scope. The exact repository identity is fixed first by repository, object format, commit OID and tree OID. A complete manifest binds every tree entry's path, mode, type, blob OID and byte length and is identified by `manifestDigest`. The Case/Plan owner supplies the semantic `baseDigest`; the context adapter never replaces it with a digest of a subset.

The new profile is `tdev.repository-context.git-scoped-lazy.v1`. It has three bounded operations:

1. `manifest` reads deterministic pages of complete entry metadata using a stable cursor and a finite page limit. It may account for a large manifest without allocating blob contents.
2. `list` selects paths from that manifest under an owner-issued prefix/path scope and finite file/byte/result bounds.
3. `read` fetches only an exact manifest entry, optionally within a bounded byte range, and proves the returned blob OID, mode, encoding and byte count.

The scope is a typed, immutable value issued by the context owner. It contains only normalized relative paths or prefixes, a scope digest, and finite limits. A request cannot widen it, choose a repository path, executable, environment, provider URL or credential. Search is a bounded operation over the admitted scope; truncated or cancelled search is reported as incomplete and cannot be treated as complete context.

Revision 3 adds one canonical self-context issuance form to the existing public `development_context_get` tool without adding a seventeenth tool. With no scope request it preserves the deployed default context for compatibility. With a bounded scope request, the caller may name normalized relative paths and/or prefixes only; the context owner intersects that request with a release-owned self-context source policy and applies owner-fixed file, selected-byte and search-result limits. The caller cannot supply a commit, tree, manifest/base/scope digest, repository identity, limit override, provider location or credential. An empty, malformed, stale, over-budget or out-of-policy request fails closed.

The issued context reference is a short deterministic identifier derived from the exact deployed repository identity, normalized admitted scope, owner policy identity and schema version. The complete scope is not encoded in the identifier. The existing transferred canonical `CaseAgentDriveRuntimeDO` namespace is the sole registry owner for dynamic references: it stores a small versioned descriptor containing the reference, exact release identity, normalized scope and scope digest under a dedicated context key. Reissuing the same scope is idempotent. A stored descriptor mismatch, package/source mismatch or stale release identity is corruption/staleness, not a cache miss that may be repaired by widening scope.

The exact-release Worker package may carry compressed UTF-8 contents for the finite release-owned self-context source policy, keyed by immutable manifest/blob identity. This payload is a rebuildable release cache, not a second source of repository truth and not authorization by presence. The complete manifest and exact commit/tree identity remain authoritative; runtime materializes only blobs selected by an issued scope and verifies manifest mode, blob OID, byte length, UTF-8 validity and owner budgets while decoding. Binary/symlink/submodule/out-of-policy content is never made readable merely because it exists in the repository.

The scoped descriptor carries both whole-snapshot identity (`commitOid`, `treeOid`, `manifestDigest`, owner-supplied `baseDigest`) and selected-content identity (`scopeDigest`, `contextDigest`). These identities are never substituted for one another. Binary, executable, symlink, submodule and unsupported entry metadata remain in the manifest even when their contents are not readable by the text scope. Unsupported read or write requests fail closed.

The existing `tdev.repository-context.git-full-text.v1` profile remains a compatibility profile for already compiled full-tree Plans. It is not fed an exclusion list to simulate a scope. `contextExcludedPaths` is removed from new lazy bindings; a legacy binding that uses it remains historical and cannot authorize the lazy profile. There is no inline full-context fallback after a lazy read/reference error.

## 2. Ownership and compatibility

The context owner issues the scope and binds it to the exact Case/Plan contract. Case/Plan retains ownership of lifecycle, Plan identity and base semantics. Repository transport owns Git reads and immutable descriptor validation. The model executor receives an opaque context reference and only the selected, bounded files. Candidate materialization still starts from the exact commit clone; a scoped context does not authorize canonical-tree mutation or a second candidate owner.

For the canonical Cloudflare composition, HTTP ingress does not become a context authority. `development_context_get` routes issuance to the one canonical Drive registry object for the deployed base. `development_context_list/search/read` and the context resolution performed before `development_start` resolve that same owner-issued descriptor. A Case-specific Drive object may receive the already-resolved immutable context projection needed by the existing development adapter, but it cannot create, widen or reinterpret a context reference. This keeps issuance, persistence and resolution in one owner while reusing the existing Case/Drive/Agent development chain.

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
- Dynamic self-context descriptors are durable only for the exact release identity that issued them. After canonical release advancement, an old descriptor may be retained as historical state but is rejected by the new release unless the complete exact-base identity still matches; there is no branch-name rebinding.
- The release payload/cache is regenerated deterministically from an exact published commit before deployment. Deployment must fail before provider mutation if the admitted payload exceeds the configured Worker/package budget or if any policy-admitted file cannot be represented and verified safely.
- `tdev-mcp-trial` remains a migration/rollback source until the canonical release is verified; context issuance must not transfer or duplicate the Drive namespace during an ordinary canonical update.

The source-compatible v2 development-unit path retains the existing full-tree Plan representation for Case/Promotion compatibility. D0048 adds an explicit owner-issued scoped semantic Plan/reference for a selected text tree while retaining the complete repository identity separately; it does not claim that a 1 GB repository can be placed in a durable Case snapshot. A true metadata-only D0019 Plan representation that stores a lazy base reference instead of any selected `baseTree` remains a separate future decision. A request that cannot satisfy its admitted scope/storage gate remains blocked; it must not manufacture a subset digest or silently fall back to eager full context.

For a scoped model operation, the model workspace is a sparse checkout containing only admitted files while its `HEAD` remains the exact base commit. Candidate materialization is a separate full exact-commit clone. The warden owns both disposable roots and the model/validation process groups; positive absence receipts are required before reuse. Reads enforce both selected-byte and scanned-prefix limits, and incomplete/truncated search is never a complete context.

## 4. Acceptance matrix

| Gate | Required evidence |
| --- | --- |
| CP1 scoped path | a small owner-issued scope drives local MCP → Agent → disposable candidate → fixed validation once; no arbitrary exclusion, canonical mutation or credential disclosure |
| CP2 full repository | the complete manifest is fixed while one or two files are read lazily; request/context allocation is bounded by selected content rather than total contents |
| CP3 1 GB | generated exact commit with large binary/text entries preserves manifest identity, bounded reads, cancellation and cleanup; a separate full-context stress run records unsupported/limit outcomes without being called lazy PASS |
| identity | commit/tree/object-format/base/manifest/scope/context/candidate digests remain distinct and exact-joined |
| negative path | wrong commit, stale scope/reference, missing/out-of-policy path, range/file/byte limit, truncated search, corrupt registry descriptor and changed manifest all fail closed without a candidate or promotion |
| canonical self-context | refreshed canonical `tdev` issues at least two distinct bounded scopes against one exact deployed base, then list/read/search and `development_start` resolve those references without tmcp/GitHub mutation or a per-scope Worker redeploy |
| ownership | provider readback proves the existing transferred Drive namespace remains the only dynamic context registry and that Case/Agent/D1 bindings are unchanged across the canonical update |
| surface | public MCP remains exactly 16 tools and every tool preserves `readOnlyHint=true`, `destructiveHint=false`, `idempotentHint=true`, `openWorldHint=false` |

Cheapest falsifiers are a subset digest accepted as the canonical base, an unbound path exclusion changing the digest, any request allocating all blob contents for a bounded read, a missing manifest entry, a silent full-context fallback, or an incomplete search reported as complete.

## 5. Follow-on gates

Revision 3 authorizes the bounded canonical self-context issuance/persistence/cache path above and the compatible `development_context_get` scope-request schema needed to expose it. D0048 continues to own scoped semantic Plan/reference meaning and must be revalidated, not redefined. D0046 continues to own provider deployment/cutover and requires fresh source/package/provider readback before and after the canonical update. The canonical update must preserve the current Case, Agent, D1 and transferred Drive identities and must not create a dated/trial replacement runtime.

This revision does not authorize arbitrary repository browsing, dynamic branch/HEAD resolution, a new persistent content owner, Git publication, automatic deployment, or metadata-only durable Case/Plan redesign. After source and provider verification, the decisive self-hosting gate is operational: a fresh bounded scope must be issued and consumed through canonical `tdev` without tmcp/GitHub mutation and without redeploying the Worker for that scope. Failure of that gate leaves DIRECTIVE r4 P2 incomplete and reopens this revision rather than permitting an external fallback.
