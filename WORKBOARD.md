# dev-2 workboard

Execution state and navigation only. Authority: DIRECTIVE r3 -> RULE -> selected
Designs. Rebind fresh remote HEAD and read AGENTS and those owners before continuing.

## Current objective: Phase A

Complete usable same-origin public MCP cutover, then stop at the user's ChatGPT
Refresh boundary. Do not perform Phase B release completion. The old J1 -> J2 ->
J3 -> J4 order is replaced by the cutover-first dependency graph below; architectural
ownership and all exact-state/security semantics remain unchanged.

Selected Designs: D0001 work/ledger; D0002 repository/context/candidate; D0003 exact
validation/integration; D0004 four-tool contract; D0005 security; D0006 native/edge/
managed runtime and activation; D0007 verification/comparison. All select r3.

## Phase A dependency graph and implementation frontier

| Frontier | Depends on | Current state | Completion evidence |
| --- | --- | --- | --- |
| A0 Fresh authority/provider/device bind | none | Initial remote exact HEAD/tree/ancestry and selected authority read; provider origin/Access readback obtained | `docs/evidence/phase-a-cutover/` when published |
| A1 Owner requirements and public contract | A0 | r3 owner/Design synchronization complete; full closed input/output contract and owner metadata joined | Design checker, schema positives/negatives, exact frozen descriptor digest |
| A2 Usable native backend | A1 | Real joined native Git/context/candidate/SQLite/admission/preparation/observation backend; hosted execution explicitly unavailable | Real native fixture and repository calls; typed unavailable hosted effects |
| A3 Edge/device/auth/launcher | A1,A2 | Worker/routing DO/outbound device transport and immutable launcher implemented; local join tests PASS, not yet deployed | Unit/reconnect/auth tests, exact installed bundle identity |
| A4 Same-origin deployment and readback | A3 | Not performed; primary provider reads succeed; organization API read permission is narrowly unavailable | Actual provider deployment, public MCP discovery, tool/schema/hint equality and native route |
| A5 Publication and Phase B resume | A2,A4 | In progress | Clean coherent commits, remote readback, exact implementation frontier and first calls |
| User Refresh | A1-A5 | Not yet requested | User refreshes app/action snapshot; this is the Phase A stop boundary |

A1 and A2 do not wait for full hosted isolation or release benchmarks. A4 does not
wait for an old tdev live baseline, old endpoint continuity or old state migration.
One blocked capability does not halt independent frontiers. Provider permission is
established by each actual operation/readback, not assumed from available tokens.

## Existing implementation retained

F0 canonical codec/envelopes, P1 scoped capabilities and Access/GitHub identity
verification, P2 durable compact work/candidate references and attempt ownership,
P3/P4 native exact Git/context/candidate/cache primitives, P7 closed full input
unions and modern/legacy MCP wire codec, P8 bounded transport rendezvous are retained.
Historical module test results remain historical until rerun on current bytes.
Committed earlier dev-2 implementation may be salvaged only after review against
current r3 Designs; never replace current compact pointers or native/hosted security
with old large-record/local-sandbox assumptions. Preserve all unrelated dirty work.

## Phase B frontier after Refresh

Start using dev_context -> bounded dev_read of authority/WORKBOARD/resume evidence
-> dev_observe (runtime and open/request selectors), binding fresh repository and
installed identities. Continue incomplete hosted session/containment/receipt wiring,
exclusive-writer/provider CAS qualification and exact response-loss recovery,
profile/policy and release stage/activation implementation, complete joined stress
and physical Android lifetime/self-update proofs, actual MCP non-documentation
self-development and predecessor comparison. The final Phase A resume evidence
will replace this provisional list with implemented/blocked and exact next actions.
Do not infer product completion from descriptor exposure or operator bootstrap tests.

## Bootstrap and collaboration boundaries

Authorized tmcp/GitHub/project-local/provider tooling is used only to establish
this cutover while dev-2 is not usable. Record each category and reason in Phase A
evidence. No external model or model SDK is required. Independently user-started
sessions may offer isolated committed evidence; one owner performs canonical
publication and provider cutover to prevent races. Their notes are coordination,
not repository authority. Predecessor development branch/source/history and all
unrelated provider/user state remain preserved.

## Evidence interpretation

PASS means the named test/layer on the named exact source/environment only.
FAIL, NOT RUN, unimplemented and externally blocked are distinct. Canonical full
integration/release/live/benchmark profiles do not become green from a subset of
focused tests. Current mutable resource IDs, private paths and credentials belong
in installation state; redacted observations and immutable evidence references may
be linked here, not promoted into stale architecture constants.
