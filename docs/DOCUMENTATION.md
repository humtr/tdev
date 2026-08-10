# tdev documentation system

> Normative owner for documentation taxonomy and cross-document authority boundaries. This file classifies documents; it does not redefine the product contracts owned by `SPEC.md`, `ARCHITECTURE.md`, `PROTOCOL.md`, `SECURITY.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, or `MCP.md`.

## 1. Three documentation layers

Every durable repository document belongs primarily to one of three layers.

### A. Product contract

Product-contract documents answer **what tdev is required to mean or do**. They must be understandable without knowing which ChatGPT session, Codex run, Termux checkout, development branch, or Design number produced them.

Current owners:

| Contract | Owner |
| --- | --- |
| product scope, terminology, product acceptance, product non-goals | `docs/SPEC.md` |
| component/fact ownership and dependency direction | `docs/ARCHITECTURE.md` |
| Case/Task/Attempt/result/Claim/Promotion records and transitions | `docs/PROTOCOL.md` |
| trust, identity, secret, path and effect boundaries | `docs/SECURITY.md` |
| runtime operation and failure behavior | `docs/OPERATIONS.md` |
| deployment, provider binding, migration and rollback contract | `docs/DEPLOYMENT.md` |
| MCP product surface and protocol boundary | `docs/MCP.md` |

A product contract may say that the final MVP requires Cloudflare, a local Agent, Git publication or secured MCP. It should not say that a particular ChatGPT session, `group/*` branch, D001x planning label, or Termux synchronization event is product semantics.

### B. Self-development / engineering

Development documents answer **how we change, sequence, integrate, review and publish tdev itself**.

Current owners and records:

| Concern | Owner / record |
| --- | --- |
| repository-wide agent instructions | `AGENTS.md` |
| implementation guardrails | `RULE.md` |
| change classification and Design lifecycle | `SDD.md` |
| current pointers | `WORKBOARD.md` |
| development identity and accumulated knowledge lineage | `LINEAGE.md` |
| final-MVP capability decomposition and high-level sequencing | `docs/ROADMAP.md` |
| development-plane, synchronization and branch workflow | `docs/development/WORKFLOW.md` |
| exhaustive capability/Design execution register | `docs/development/PROGRAM.md` |
| active Group E execution contract | `docs/development/GROUP_E_CONTEXT_DELIVERY.md` |
| one bounded Class 2 decision | `docs/design/*.md` |

Development documents may reference product contracts, but they may not silently redefine them. A branch, worktree, cache, issue, task tracker, session or planning label is never product authority merely because a development document uses it.

### C. Evidence / qualification

Evidence documents answer **what was actually observed, measured, reproduced or qualified**.

Examples:

- `docs/evidence/*.json`;
- `docs/MVP.md` executable source/provider qualification records;
- `docs/IMPLEMENTATION_REPORT.md` integration evidence and retained boundaries;
- bounded audit/review reports such as `docs/D0014_PRODUCT_EFFICIENCY_AUDIT.md` and `docs/D0014_POST_VERIFICATION_REVIEW.md`;
- GitHub Actions run/job/artifact identities referenced by those records.

Evidence does not redefine a contract. A passing test proves only its declared layer. A failed falsifier may reopen a Design or owner, but the evidence file itself does not become the replacement owner.

## 2. Dependency rule

The default information direction is:

```text
self-development / engineering
        | changes and verifies
        v
product contracts
        | are tested / observed by
        v
evidence / qualification
```

Allowed cross-references must preserve this authority direction.

- Engineering documents can say which product owner they intend to change.
- Evidence can identify the exact product contract and source identity it tested.
- Product contracts can link to `ROADMAP.md` for program decomposition, but product meaning must still be stated in the product owner itself.
- Product contracts should not depend on a current development branch, ChatGPT/Termux synchronization state, or a provisional Design ID to define runtime meaning.

## 3. Product scope versus development program

`docs/SPEC.md` owns whether a capability is a final-MVP requirement. `docs/ROADMAP.md` owns the high-level capability-group program needed to close those requirements. `docs/development/PROGRAM.md` expands that roadmap into an engineering execution register.

Therefore:

```text
SPEC / product owners
    -> required capability
ROADMAP
    -> capability group + program exit
DEVELOPMENT PROGRAM
    -> provisional Designs + dependencies + falsifiers + execution lane
DESIGN
    -> one accepted Class 2 decision
EVIDENCE
    -> observed verification
```

A provisional Design entry is not authorization. Only an accepted/implementing Design under `SDD.md` authorizes Class 2 code.

## 4. Completeness invariant

The documentation system is complete only when every final-MVP requirement can be traced through all applicable layers.

For each requirement maintain the chain:

```text
product requirement
-> product owner section
-> capability group
-> group exit criterion
-> one or more Design/gate entries
-> exact verification/evidence requirement
-> user/provider configuration step when applicable
```

No requirement may disappear merely because its implementation owner is undecided. Unknown ownership, conditional mechanisms and deferred choices are recorded explicitly as `unknown`, `conditional`, or `decision gate`.

Conversely, every planned Design must trace upward to a product requirement, risk, verification gap, or evidence-backed optimization. A Design with no such parent is not justified by numbering alone.

## 5. Program coverage ledger

`docs/development/PROGRAM.md` is the execution coverage ledger. It must record for every provisional Design-sized gate:

- capability group(s);
- problem/purpose;
- product/authority owners affected and explicit non-owners;
- prerequisites and dependencies;
- MVP criticality or conditional status;
- cheapest useful falsifier;
- required exit evidence;
- deployment/provider/user actions if applicable;
- expected work branch/integration lane;
- current status (`planned`, `decision-ready`, `accepted`, `implementing`, `verified`, `conditional`, `post-MVP`, `blocked`, `superseded`);
- unresolved questions that could split, merge, remove or reorder the gate.

When a new requirement appears, it must be entered into this ledger before it can be considered covered.

## 6. Historical documents and physical layout

Do not mass-move historical Design/evidence files merely to make the directory tree visually pure. Existing references and exact historical evidence are valuable.

The current migration policy is:

1. classify documents semantically first;
2. add explicit owners and cross-links;
3. put new self-development documents under `docs/development/`;
4. keep existing historical paths stable unless a later bounded cleanup proves the link/update cost worthwhile;
5. never rewrite historical evidence merely to match a newer taxonomy.

## 7. Naming discipline

Use these terms consistently:

- **product contract** — runtime/product meaning;
- **development program** — how the repository intends to reach the product target;
- **Design** — one accepted Class 2 decision under `SDD.md`;
- **verification gate** — observable falsifier/acceptance evidence;
- **development identity** — active `mvp-*` integration direction;
- **group branch** — `group/*` work-integration lane, never product authority;
- **published head** — observed remote ref identity at one location/time;
- **local head** — observed Termux/local ref identity at one location/time;
- **working mirror** — derived ChatGPT/CI checkout used to inspect, test, reconcile or construct candidates;
- **sync debt** — a known, provenance-preserving difference between development replicas that must be reconciled later.

## 8. Review rule

Before closing a Group or Design, review documentation in three passes:

1. **Product pass:** did product meaning change, and is the correct normative owner updated?
2. **Development pass:** are program status, dependencies, branch/integration state and remaining gates accurate?
3. **Evidence pass:** does every `verified` claim name executable or provider evidence, with unsupported layers still explicit?

A claim is incomplete if any one of these passes is silently substituted for another.
