# Design 0048 — Lazy Scoped Plan Reference

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-09-06
- Acceptance base: `development@8a55956ff164f6e8ca27010aef88d4371e747205`
- Acceptance evidence: `docs/evidence/group-f-d0048-r1-scoped-plan-lazy-qualification-20260906.json`, `docs/evidence/group-f-d0043-r4-physical-m0-pass-20260906.json`
- Predecessor authority: D0019@r2 and D0047@r2
- Trigger: D0047 CP1 proved the lazy manifest/read and candidate boundary, but the physical M0 gate still constructed a v2 Plan from every UTF-8 blob. The exact repository contains native non-UTF-8 entries, so that path cannot complete without either an unauthorized exclusion or an explicit scoped Plan contract.
- Scope: an owner-issued scoped semantic Plan reference for the trusted-local tdev development unit
- Affected owners: `src/plan.mjs`, `src/development-unit.mjs`, `src/mcp-development-adapter.mjs`, `src/repository-model-transport.mjs`, `src/development-operation-profile.mjs`, `src/development-runtime.mjs`, `qualification/d0043-physical-termux-m0.mjs`, `qualification/d0047-cp1-scoped-context.mjs`, focused tests and current qualification documentation
- Preserved owners: D0019 remains the sole Case/Task/Attempt/result/Promotion authority; D0047 remains the manifest, scope and bounded read owner; D0043 remains the typed no-sandbox local operation owner; D0046 remains the MCP composition and provider/client gate owner; D0025 remains Git publication authority
- Explicit non-goals: no arbitrary client-selected exclusions, no silent subset digest substitution, no hostile-local-code or multi-tenant isolation, no replacement of legacy v2 Plans, no new persistent content owner, no Git publication and no tmcp comparison

## 1. Decision

Add one opt-in `tdev.plan.lazy-scoped-reference.v1` contract for a development Case whose
semantic Plan tree is the exact content selected by an owner-issued D0047 scope. The Plan
continues to use the existing D0019/CaseEngine and Promotion semantics over that admitted
semantic tree. The full repository remains bound separately by a repository base identity:

```text
exact commit/tree/object format
        + complete manifest digest and repository base digest
        + owner-issued scope and scope digest
        + selected UTF-8 semantic tree and its semantic base digest
        -> scoped Plan / Case / Agent / candidate identity
```

The scope is a declared semantic boundary, not an exclusion list. Every entry, including
binary, native, executable, symlink or otherwise unsupported content, remains in the complete
manifest and therefore in the full repository identity. Only files selected by the owner are
decoded into the semantic Plan tree. A client cannot supply or widen the scope.

Legacy v2 Plans retain their current full `baseTree` and `baseDigest` meaning. The scoped
profile uses the existing Plan `baseDigest` for the admitted semantic tree and adds an explicit
`repositoryBaseIdentity` for the complete exact repository. These digests are never compared as
if they had the same meaning. ChangeSet, Attempt, receipt and effect identity continue to bind
the Plan semantic base digest; candidate evidence additionally binds the complete repository
identity and scope.

## 2. Reference shape and invariants

The owner-issued repository identity is `tdev.repository-base-identity.v2` and contains exactly
the schema version, object format, commit OID, tree OID, complete `manifestDigest` and a distinct
typed `baseDigest` derived from that complete manifest identity. A scoped Plan carries an
immutable `baseReference` with:

- `profile: tdev.plan.lazy-scoped-reference.v1`;
- the complete `repositoryBaseIdentity`;
- the normalized D0047 scope and `scopeDigest`;
- `semanticBaseDigest`, equal to the Plan's admitted semantic `baseDigest`;
- a typed `referenceDigest` over all of the preceding fields.

The Plan's selected `baseTree` must validate under the Case contract and its digest must equal
`semanticBaseDigest`. A missing repository identity, a mismatched commit/tree/object format,
manifest, scope or semantic digest fails before Case creation. A Plan with a reference cannot
silently use the full-context profile or an arbitrary exclusion list.

## 3. Execution and candidate boundary

The context owner prepares the complete manifest without blob hydration, reads only the selected
scope, and returns the selected semantic tree plus both identities. Case and Agent carry the
reference through retries and result envelopes. The model receives a sparse exact-commit
workspace containing only the selected files. Candidate materialization always starts from a
separate full exact-commit clone, applies the result-only ChangeSet, runs the fixed validator,
and records the full repository identity, semantic base digest, scope digest and positive
warden cleanup receipts.

The current trusted-local operation binding also pins `gpt-5.6-luna` with
`reasoningEffort=low`. These are release-owned model settings used to keep the physical Termux
gate reproducible; MCP and Task input cannot select or widen them.

The Case canonical projection for this profile is the scoped semantic projection. It is not a
claim that the MCP response contains the complete repository. The candidate root is the only
place where unselected files are retained for validation. A later metadata-only Plan/root
representation may reduce even the selected semantic tree, but it requires a separate D0019
revision and is outside this implementation checkpoint.

## 4. Failure rules

- A complete manifest or repository identity mismatch rejects before model launch.
- A scope with no selected entry, a non-UTF-8 selected blob, a range/byte limit crossing or a
  stale scope rejects without Case mutation or candidate creation.
- A ChangeSet outside the owner write scope rejects; an empty implementation result remains
  invalid.
- Candidate validation failure, process loss, workspace residue or uncertain external effect is
  reported with its existing failure/unknown semantics and is never converted into success.
- Existing v2 Cases and full-context qualification retain their current behavior.

## 5. Checkpoints and acceptance evidence

The implementation line is accepted only after these source/local falsifiers pass:

1. a scoped Plan binds a full manifest identity while its semantic tree contains only the owner
   scope;
2. a binary/native entry outside the scope remains in the manifest and does not block scoped
   preparation;
3. a mismatched full identity or scope is rejected before Case/model admission;
4. the physical Termux M0 run completes one real MCP/Agent-equivalent development unit through
   sparse model workspace, full disposable candidate and fixed validation, with positive cleanup
   receipts and unchanged canonical checkout;
5. existing CP1/CP2/CP3, full-context stress and the complete source gate remain green.

Provider deployment and current ChatGPT proof remain D0046 gates. A source or physical result
does not close M1/M2, and an unavailable provider credential remains an external blocker rather
than a guessed success.
