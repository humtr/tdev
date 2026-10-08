# Local validation evidence — 2026-10-08

## Supervised build phase — 2026-10-08

Source base: `ffe78ddf5dfebceb7599af0b638d29f3f671ae28`; product input revision **0.1.34**.
This private P4 increment connects a frozen strict recipe and acquired-input budget to the
original independent native supervisor. It does not connect public prepare, export capture,
retained objects/pins, artifact verification or deployment. Eleven implemented families remain
advertised; artifact only advertises inspectRecipe. SQLite format **3** and wire contracts are
unchanged. Ordinary source/execution spool remains **4**; private build requests use **5**.
Existing optional fields are omitted when absent, preserving format-4 request/report encoding
and fingerprints. A new build request cannot be relabelled as an ordinary format-4 job.

Ownership:

- `src/artifact/build.rs`: original strict recipe/schema decoding, validated persisted plan,
  immutable compiled-contract cache, native platform and pinned declared executables. Tools
  resolve through fresh native PATH; symlinks may resolve, but sh must be the actual frozen
  supervisor shell. No recipe command runs during preflight. Descriptor/metadata/hash and path
  replacement checks bound each tool to **256 MiB** independently of source/acquired input.
- `src/artifact/acquisition.rs`: controlled acquisition through the frozen shell's sibling curl;
  worker environment clearing cannot select another tool directory. Public helper semantics
  remain fresh-only, native verified HTTPS, selected input hashes and no ambient credentials.
- `src/git/process.rs`: original owned bounded utility I/O gains an interruption callback, with
  the same pipe/deadline and owned-group kill/reap discipline. Normal Git/provider calls use a
  no-op callback. There is no second utility or long-lived execution lifecycle.
- `src/supervisor/{spool,mod}.rs`: original request digest, dispatch/claim/worker, clean environment,
  stopped terminal result, cancellation/deadline and sampled/final working budget. The build
  deadline covers source verification, acquisition and the recipe command. Inputs/build scratch
  join ordinary working roots, while acquired-input/source/dependency capacities remain separate.
  Preparation rejection has no recipe-child dispatch. Post-stop acquired-input errors use boxed
  artifact_error facts; exit 0/stdout PASS cannot conceal them or become retained-artifact success.
- `src/execution.rs`, `src/execution/api.rs`: source import/checkpoint, source validation proof and
  source retirement refuse build jobs. Ordinary frozen execution/validation rejects artifact plans;
  existing receipts remain readable without changing task/source authority.

Declared export validation/capture and retention are not implemented by a successful process
report. Private builds preserve their source stop/capture proof and outputs; ordinary source
retirement cannot delete them before their artifact owner is connected. Source policy, successful
source validation/current admission, build slots, operation receipt and retained-object pin joins
still belong to the next public prepare connection. No supplied manifest or stdout is accepted as
an artifact result. Runtime/deployment compatibility remains separate from build-host attestation.
Executable digests do not attest shared libraries, SDK contents, every subprocess or host/network
hermeticity. Native execution remains ordinary Termux UID authority.

Focused native tool/platform/shell/path replacement/tool-budget invariants: **4 pass in 0.80 s**.
Acquisition/tool/recipe selection: **16 pass in 25.72 s**, including exact **64 MiB** HTTPS/chunked
aggregate, lower-limit one-byte overflow, in-flight utility cancellation and no retry of partial
storage. Existing Android link(2) refusal and actual multi-link-inode portable-host qualification
boundary remain explicitly recorded in acquisition evidence below.
Final source 0.1.34 private supervisor selection: **8 pass in 18.35 s**. It runs the actual
independent executable, Git source, immutable requests, native shell/curl and owned TLS fixtures:

- Fresh inputs/build scratch and frozen command/tool plan, unchanged original source, no source
  checkpoint/import or ordinary retirement, no second launch.
- Tool digest refusal before recipe-child dispatch; known stopped preparation rejection.
- Cancel, command deadline, source mutation and final scratch working budget; no replay dispatch.
- Real **2097152-byte chunked HTTPS input** after the worker environment is cleared; pinned bytes
  consumed by the recipe, selected distribution retained in private inputs and one HTTP request.
- In-flight TLS cancellation stops without recipe dispatch/refetch; acquisition consumes the same
  overall build deadline as the command; a zero-exit recipe that alters input reports the original
  ARTIFACT_DEPENDENCY_CHANGED error despite stdout PASS.
- Wrong format and caller/task environment override refusals; ordinary format-4 omission/readback.

The owned TLS fixture binds a private native tool directory through the actual identity codec and
original source-ready envelope. Its curl wrapper delegates to the real native client with only
fixture CA/loopback routing; this is test-only own-file setup, not a distributed transport mode,
TLS bypass, production trust change or caller-selectable tool directory. Fixture Python/OpenSSL
are development dependencies. Preparation/recipe execution uses the Rust supervisor and native
utilities; no reference worker is called.

Draft strict lint identified a large Observation enum after the optional error was added inline.
Boxing only the sparse error fact repairs that storage cost and preserves ordinary reports; final
strict all-target clippy passes. Earlier intermediate private selections also passed **4 / 11.99 s**,
**6 / 10.42 s**, **8 / 14.16 s**; they precede the final field representation/version and do not
qualify the final whole gate. No failed whole-script result is claimed as passing.

Affected ordinary supervisor selection initially passes **30** and fails **1 in 5.68 s**:
`input_admission_rejects_gaps_bounds_eof_and_control_identity_reuse` receives explicit
WouldBlock at EOF enqueue. It is a reserved-only fixture, and standalone **1 / 0.06 s** passes;
no live candidate pump is required for the transient lock refusal. The original enqueue owner
returns WouldBlock before reading/persisting admission. The corrected fixture waits only for
this explicit refusal using the same request/sequence within the existing bounded wait; other
errors remain observable. Original gaps/bounds/identity/EOF/corrupt-prefix assertions remain.
No product input-admission or automatic-retry behavior changes. Corrected whole affected
supervisor selection: **31 pass in 5.42 s**. No failed selection is a whole-script PASS.

Final affected public HTTP selection: **27 pass in 123.928 s**, using the source 0.1.34
executable and disposable fixtures. The initial whole run started
at 2026-10-08T00:01:55Z and its log stops during native GitHub acceptance; resumption finds
no running gate and no completion record. Rust 140 tests and identity/contract comparisons
had passed, but this interrupted run is not a whole-script PASS. The fresh full run starts
at 2026-10-08T02:30:09Z under `.artifacts/build-phase-0.1.34/retry-1`; its original log and
input witnesses are preserved. Whole regression froze all 300 product/test/doc inputs
except this evidence document and the actual corpus.

Final whole `sh scripts/check.sh`: **PASS, exit 0**, **5130.475 s**, completed
**2026-10-08T04:02:23Z**. Both the check and its witness wrapper exit 0. Results:

| Gate | Passed | Recorded duration |
|---|---:|---:|
| Rust library / execution / Git / supervisor | 65 / 27 / 17 / 31 = **140** | 22.40 / 413.71 / 73.62 / 8.51 s |
| Native common HTTP | **97** | 1109.720 s across 15 selections |
| Native failure/recovery/large-input HTTP | **96** | 1623.706 s |
| Reference whole regression | **481** | 1610.476 s |
| Capacity journey | **7** | 244.008 s |
| Total automated tests | **821** | Whole script above |
| Identity / compiled contract comparisons | **10003 / 136** | Separate from test total |

Formatting, strict all-target locked clippy, locked build and diff checks pass. The original
stdin admission fixture passes in the whole 31-case supervisor selection. Reference regression
prints **15 unclosed SQLite database ResourceWarnings**; these are recorded warnings, not failed
tests, and no warning cleanup or reference implementation change is included in this increment.
These fixture durations are not a controlled implementation-performance comparison or a P5
performance qualification.

The 300 frozen product/test/doc inputs and the corpus are unchanged before/after the whole run.
Witnesses: `.artifacts/build-phase-0.1.34/retry-1/{inputs,corpus,result}.json` and `check.log`.

- Input manifest SHA-256: `9fae1d73f0ff7bce956a43e712de3eaa6c8eaae9f212c5687b58d35ccc118913`.
- Actual exercised executable SHA-256: `f434b3eca0b33c0c83093acb74e3f5fce5eac04bfee92d13955796a995b4e040`.
- Actual corpus: **190 files / 37724943 bytes** (**35.98 MiB**, approximately 37.7 decimal MB),
  at house-md-distill/corpus/originals; ordered path/body digest
  `d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`;
  wrapper path/file-hash manifest
  `ed814bb6d98f0d3c4daeaef3d31ea422b6a6e011227247d13cbba502228bab1f`.

Current capacity qualification in this run:

| Fixture | Actual admitted bytes/files | Result |
|---|---|---|
| Native HTTP single file / committed source | 181403679 bytes, 1 file each | PASS; 69.894 / 83.749 s |
| Native HTTP aggregate | 536870900 bytes, 8 files; subsequent overflow rejection | PASS; 259.598 s |
| Native HTTP actual corpus | 37724943 bytes, 190 files | PASS; 40.050 s |
| Native committed-source controller / recipe-input controller | Same 181403679-byte source | PASS; VmHWM 29564 / 31384 KiB |
| Capacity journey aggregate / committed aggregate | 536870900 bytes, 8 files each | PASS; 55.932 / 63.279 s |
| Capacity journey committed single / actual corpus | 181403679 / 37724943 bytes | PASS; 23.093 / 20.960 s |
| Capacity journey large artifact source input | 181403679 bytes | PASS; inspection only, no build/seal |
| Capacity journey many files / single file | 1024 one-byte files / 181403679-byte file | PASS; 5.363 / 13.514 s |

Rust execution also passes its many-file, >=173 MiB and 512 MiB roundtrips and one-byte source
overflow; native HTTP passes exact **2 GiB** task-dependency/overflow and separate working-budget
invariants. Source admission/import, capture, checkpoint, integration, workspace and cleanup
qualification is included. The final seven capacity cases use the reference controller and
actual native executor; they do not qualify new Rust retained-artifact handlers.

Existing source limits are unchanged by this build connection: source/single-file **512 MiB**,
source files **100000**, pack **1 GiB**, metadata **48 MiB**, launch control **8 MiB**. Native
workingBytes remains **128 MiB default / 2 GiB maximum** and task dependency capacity remains
**2 GiB**; model wire **2 MiB / depth 128** is independent. Acquired inputs remain **64 MiB**,
headers **64 KiB**, individual transfers **20 s**, finite build deadline **1..3600 s**. Newly
implemented tool attestation has its own **256 MiB per-tool** boundary and configured/observed
`artifactToolBytes` diagnostic. Working refusal retains the original budget record. Source
capacity does not become 2 GiB merely because working/dependency budgets permit that size.

No production config, resident/provider/observer replacement or activation is performed.
Read-only installed metadata confirms product **0.1.27 / workingBytes 2147483648**, active bundle
`e502ae7ee8a1b19fc524e761b523e357659a18cf24c8553f976fcc60f53855d3`.
Executable attestation does not attest libraries/SDKs, native working limits are sampled rather
than hard RAM/disk isolation, and the Android hardlink/portable-host boundary recorded below
remains. Installed format-5 qualification, P4 export capture/retention/public prepare and
validation/deployment, P5 operator/state/performance and P6 installed/client/host/main integration
remain outstanding.

## Public input acquisition — 2026-10-07

Source base: `a372d512a754bee2ce92a754426804f407ecdbe6`; product input revision **0.1.33**.
This P4 private increment implements selected public-distribution acquisition and post-execution
input integrity checks. Eleven families still advertise only the implemented actions; artifact
prepare/build is not connected. SQLite format 3, spool format 4 and the wire contracts are unchanged.

`src/artifact/acquisition.rs` owns strict-recipe-derived dependency names/URLs/digests, fresh
private storage, bounded native curl and streaming SHA-256, descriptor-relative exclusive files,
readonly completed inputs and verification without repair. It reuses the original bounded native
utility process-group/deadline owner and supervisor native tool-directory selection. No new
operation table, dispatch, worker, stop proof, task cache or automatic recovery policy is created.
A body is accepted only after HTTP 200 over verified HTTPS; informational headers are handled,
redirects/non-200 responses fail, and transfer errors or digest mismatches never return inputs.
Existing/partial destinations are preserved and never overwritten, removed, resumed or fetched
again by acquisition. Reverification checks exactly the declared names, regular single-link files,
metadata stability and pinned hashes; root replacement cannot redirect descriptor-relative writes.

Independent boundaries: selected acquired distributions **64 MiB maximum**, configurable downward,
with `ARTIFACT_INPUT_LIMIT budget=artifactInputBytes configured=... observed=...`; response headers
**64 KiB** including informational responses, with their own `artifactResponseHeaderBytes` diagnostic;
each transfer **20 seconds maximum** and the supplied original overall deadline. Source/file remains
**512 MiB / 100000 files**, source pack **1 GiB**, metadata **48 MiB**, launch/control **8 MiB**,
recipe raw/canonical **64 KiB**, working default **128 MiB / maximum 2 GiB**, dependencies
**2 GiB / 100000 files / 1000000 nodes**, model ingress **2 MiB / depth 128**. These budgets are not
merged. Same-UID/native network and TLS host/tool assumptions remain; acquisition is not hermetic.

`src/artifact/acquisition_tests.rs` uses a real owned loopback TLS server with per-fixture CA and
routing supplied only in cfg(test), through `tests/fixtures/artifact_https.py`. No TLS bypass,
transport override or test runner is reachable through a distributed product action. Installed
curl **8.21.0**, OpenSSL **3.6.3** are the qualified local utility versions. Native curl clears
ambient environment, disables curlrc as its first argument, proxy/netrc/redirect/retry and URL
globbing; poisoned HOME/curlrc/netrc/proxy settings send no authorization/cookie, and an untrusted
self-signed certificate fails without the test CA. Fixture Python/OpenSSL are test dependencies,
not runtime helpers. The production helper invokes only native curl.

Focused acquisition plus affected recipe invariants: **11 pass in 21.13 s** after the final
HTTP header correction (the preceding selection also passed 11 in 41.85 s). These cover exact
**67108864-byte aggregate** in two HTTPS/chunked streams plus rehash, opaque non-UTF-8 HTTP field values, one-byte budget rejection,
cumulative lower-limit edge/overflow, redirect/HTTP/truncation/digest/header failures, absolute
deadline, input changes/foreign files/symlinks, destination replacement, empty inputs and budget
admission before storage/network. No recipe command runs; no acquisition receipt is fabricated.

Draft failures are not qualifications: initial compilation required explicit u64 cumulative
byte counters; strict lint then required collapsing a fixture readiness check. First six-case
selection passed five and failed one in **44.54 s** at fixture hardlink creation. A second
seven-case selection passed six and failed one in **40.37 s** at the same link(2) call even after
making the source writable. The actual ordinary Android app domain refuses link(2) with
PermissionDenied; the corrected fixture requires this exact refusal on Android, confirms no link
was created and preserves the original file. Actual multi-link inode verification remains a
portable-host qualification boundary; the helper enforces nlink==1 but this device cannot create
that adversarial inode. No failed draft is a whole-script PASS.

Strict all-target clippy and locked build pass. Affected native HTTP recipe/discovery selection:
**8 pass in 44.885 s**, using the source 0.1.33 executable and disposable roots.
Final whole `scripts/check.sh` exits **0 in 4491.996 monotonic seconds**. Recorded UTC start
**2026-10-07 05:48:50**, finish **2026-10-07 07:06:49**. **808 test executions pass**:
**127 Rust** (60 library, 19 execution, 17 Git, 31 supervisor), **193 native HTTP/fault**
(97 common plus 96 fault in 1200.394 s), **481 reference/common** in 1596.747 s,
**7 reference-controller/native-executor capacity** in 196.222 s. Canonical identity **10003**
and compiled contract **136** comparisons pass. Formatting, strict all-target clippy, locked
build and diff checks pass. No whole-script failure or qualified-input change occurred.
Reference emits **15 unclosed SQLite connection ResourceWarning events**, retained in the log.

All **299** frozen product/test/doc inputs and the actual corpus are unchanged at completion.
This evidence document alone is excluded. Input-manifest SHA-256:
`58e73a56e23f1aeb180318e0c2a95e7d51c8d69457c7a1ed5331b480b897a295`.
Qualified executable SHA-256:
`8df35fb6f0a11f4d0250b537ba7e1fc469738f55d5f6c335fb976fd23e42f4aa`.
Local witnesses: `.artifacts/artifact-acquisition-0.1.33/{inputs,corpus,running,result}.json`,
`check.log` and `affected.log`.

| Owner exercised in the final gate | Capacity result |
|---|---|
| Native acquisition mechanism (Rust library) | Exact **67108864-byte aggregate** HTTPS/chunked input plus rehash, configured-limit edge/one-byte rejection, redirect/status/truncation/digest/header/deadline rejection, no ambient auth/proxy/config, no partial-directory reuse, descriptor-relative replacement protection: PASS. No build/operation handler is implied. |
| Native controller HTTP source lifecycle | >=173 MiB single **181403679 bytes / 54.265 s**, committed single **52.187 s**, eight-file **536870900-byte aggregate / 268.149 s**, actual **190-file / 37724943-byte corpus / 33.927 s**: all PASS. Committed source isolated controller peak **31208 KiB**. |
| Native controller recipe inspection | **181403679-byte declared source input**: PASS, isolated controller peak **30968 KiB**, no acquisition/build. Source bodies remain independent of acquired distribution budgets. |
| Rust source/execution/supervisor | Exact source byte/count edge rejection, many-file, 512 MiB aggregate/one-byte growth rejection, 173 MiB/corpus capture→checkpoint→cleanup, independent working/dependency and exact 2 GiB/overflow: PASS. |
| Reference controller with actual native executor | 512 MiB aggregate **42.766 s**, committed aggregate **47.690 s**, committed 173 MiB **18.868 s**, actual corpus **20.567 s**, large artifact source input PASS, **1024 files / 4.016 s**, single 173 MiB **13.204 s**: all PASS. This does not qualify an unconnected Rust build/seal handler. |

Actual corpus remains `/data/data/com.termux/files/home/prj/house-md-distill/corpus/originals`:
**190 files / 37724943 bytes**, 37.7 decimal MB (approximately 35.98 MiB). Ordered path/body digest
`d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`;
path/file-hash manifest
`ed814bb6d98f0d3c4daeaef3d31ea422b6a6e011227247d13cbba502228bab1f`.
Capacity-journey peak measurements are cumulative and distinct from isolated native controller
peaks. These single-run timings are regression evidence, not controlled comparative performance
qualification; historical runs have different measured costs. P5's repeated/comparable performance
budget remains outstanding. No new acquisition function is called by the existing HTTP hot paths.

Read-only resident metadata at closeout: active bundle
`e502ae7ee8a1b19fc524e761b523e357659a18cf24c8553f976fcc60f53855d3`,
product **0.1.27**, workingBytes **2147483648**. No new live HTTP/health qualification is inferred
from this metadata readback.

Remaining P4: native build-tool preflight and original operation/supervisor build acquisition,
stop/export capture, atomic retained objects/pins and receipt completion, artifact runtime and
validation/export/prune, source/packaged deployment and switch/recovery. P5 operator/state/
performance and P6 installed/client/host/canonical integration remain outstanding. Installed
complete resident remains **0.1.27 / workingBytes 2147483648**; no runtime/config/provider change
or activation is performed by this private increment.

## Artifact recipe and source binding — 2026-10-06

Source base: `4bdf64ba6b4bae30795354433f767ee6413d0f49`; product input revision **0.1.32**.
This first P4 increment implements only read-only `tdev_artifact inspectRecipe`, through the
original source validation, Git, current repository/admission and contract owners. Eleven
families are advertised; prepare, retention, artifact validation and deployment remain unconnected.
SQLite format 3, spool format 4 and the public wire contract are unchanged.

Ownership:

- `src/artifact/mod.rs`: current authority, terminal source proof and source policy, exact candidate
  parent/tree check, raw recipe digest and declared-input streaming SHA-256 metadata; binding
  includes current adopted artifact policy and creates no operation/writer or reconciliation.
- `src/artifact/recipe.rs`: original compiled schema plus strict recipe JSON, raw/canonical 64 KiB
  budgets, safe paths, full-fold alias/overlap rejection, pinned public HTTPS descriptions,
  unique tools/dependencies, conditional service/runtime and reserved environment checks.
- `src/contract.rs`: original ArtifactRecipe/Inspection definitions compiled once, only inspectRecipe
  advertised; no second handwritten schema or unimplemented prepare/build capability.
- `src/identity.rs`: explicit duplicate-key rejection mode for recipes, including nested/escaped
  aliases. Existing request/legacy last-key identity semantics are unchanged.
- `src/model/casefold.rs`: the existing Unicode full-fold helper moved from source to the common
  model module for both lookup and collision checks; no stored identity is normalized.
- `src/execution/api.rs`: the original successful source-validation join additionally checks result
  operation ID/terminal flags and rejects non-null captureError. Recipe and publication use this
  same proof helper; no alternative successful-validation authority is introduced.

A lookup cannot run a recipe, fetch public inputs, inspect host executables or create a build.
Selected candidate/tree/recipe/inputs remain frozen after source edits and close; current source
policy is required, while changing only artifactValidation changes artifact policy/binding rather
than source provenance. Delegated policy overrides are read anew and removal restores the adopted
fallback. Whole source tree remains bound even when declared inputs select only some files.
Source body capacity stays independent of recipe metadata and working/dependency/model budgets.
A stopped pending writer is not reconciled by inspection, even when its private worker result exists.

Initial strict recipe invariants: **4 passed in 2.07 s**, with strict all-target clippy and locked
build. Initial common native HTTP frozen/lifecycle/authority/policy/missing-input/strict-JSON/
failed-proof cases: **6 passed in 43.198 s**. Additional tampered terminal proof and pure inspection
of a stopped writer pass after fixture corrections; delegated override/removal/revocation also passes.
The actual >=173 MiB declared input (**181403679 bytes**) passes in **178.707 s**, with isolated
controller VmHWM **30988 KiB**, no build and no acquisition of its `.invalid` dependency URL.
These are bounded streaming/identity observations, not performance or hard-memory quota claims.

Draft failures are not qualifications: the initial five-case native/delegation selection had
three failures (**46.675 s**) from replacing a repository identity already bound to an existing
workspace, using a reference spool locator instead of native `jobs`, and leaving revoked fixture
permissions in effect during owned cleanup. The corrected four-case selection had one fixture
error (**26.180 s**): it dereferenced an unsuccessful open result. Explicit construction status
then identified **BARE_REQUIRED** (**5.917 s**) because the selected Git directory is a working
checkout. A separate repository/workspace, explicit allowWorktree and 2 GiB fixture working budget
preserve the actual authority/capacity boundaries. Proof/pure-read/delegated cases pass, and the
final large-input standalone result above uses those corrected settings. Initial compile visibility/
enum errors were repaired before qualification. No failed draft is a whole-script PASS.

Final strict all-target clippy, locked build and **4 recipe invariants in 1.20 s** pass.
The final native focused/affected selection passes **23 in 124.594 s**, including all seven
common recipe cases, shared validation/publication's eleven common scenarios, tampered-proof/
pure-read native cases, exact Unicode lookup, discovery and inventory. The separately qualified
large-input fixture above remains included in the forthcoming whole native fault group.
Reference/common recipe HTTP cases pass **7 in 39.215 s**.
First whole regression gate exited **101 in 562.471 s** on **296** frozen inputs and the actual
corpus, all unchanged. The library group passed **53**; execution passed **18** with one failure
in `seal_without_terminal_worker_proof_is_not_a_checkpoint_or_retirement_authority` (**549.91 s**).
The exact assertion returned Running instead of Unknown after deleting result.json: terminal
child/capture proof had been published while the supervisor process was still alive. Native
observation correctly reports Running for that PID/start/boot identity. The fixture now proves
the original supervisor has exited, using its identity's read-only liveness check within the
existing **360-second** fixture completion budget, before removing result evidence. The original
Unknown assertion, import/retirement denial and no-relaunch fence remain unchanged. No production
stop-proof/liveness behavior is weakened. All concurrent large/many-file Rust execution fixtures
passed; later Rust/Git, comparisons, HTTP/reference and capacity stages were not reached.
Draft witnesses remain under `.artifacts/artifact-recipe-0.1.32/draft-*`.

Corrected stopped-worker fixture passes **1 in 1.45 s** with its original uncertainty/import/
retirement/no-relaunch assertions. Final whole `scripts/check.sh` exits **0 in 3584.100 s**
(started **2026-10-06 22:21:52 UTC**, completed approximately **23:21:36 UTC**):
**801 test executions pass** — **120 Rust** (53 library, 19 execution, 17 Git, 31 supervisor),
**193 native HTTP/fault** (97 common plus 96 fault in 996.863 s), **481 reference/common**
in 724.180 s, and **7 reference-controller/native-executor capacity** in 192.157 s.
Canonical identity **10003** comparisons and compiled contract **136** comparisons across
13 canonical tools/config pass; formatting, strict all-target clippy and locked build pass.
The final Rust stopped-worker regression passes under the concurrent capacity load.
Reference tests emit **15 unclosed SQLite connection ResourceWarning events**; the new native
fixtures close their read-only inspection connections. These warnings are retained in the log.

All **296** frozen product/test/doc inputs and the actual corpus are unchanged at completion.
Only this evidence document is excluded; the removed `src/source/casefold.rs` is explicitly
witnessed absent and its common-module replacement is included. Input manifest SHA-256:
`7509dd1f594610da1cd81507b3bf24cae52d0620714856790531b3f44157dc33`.
Qualified executable SHA-256:
`788b9567253cf909b0ec43aa0e7bf3f47d790eab8a787a3c975595589addd920`.
Local witnesses: `.artifacts/artifact-recipe-0.1.32/{inputs,corpus,running,result}.json`
and `check.log`; the earlier failed whole gate remains separately under `draft-*`.

Capacity evidence in this final gate:

| Owner exercised | Fixture / result |
|---|---|
| Native controller HTTP source lifecycle | >=173 MiB single file **181403679 bytes / 61.378 s**, committed same size **53.369 s**, eight-file aggregate **536870900 bytes / 241.739 s**, actual corpus **190 files / 37724943 bytes / 29.086 s**: all PASS. Committed single-file isolated controller VmHWM **31252 KiB**. |
| Native recipe inspection | Declared input **181403679 bytes**: PASS, isolated controller VmHWM **31316 KiB** (~30.6 MiB), no acquisition or build. Strict raw/canonical 64 KiB edge fixtures and tampered terminal-proof/publication refusal pass. |
| Rust execution/supervisor | Source byte/count edge diagnostics, many-file, 512 MiB aggregate and one-byte growth rejection, committed/dirty 173 MiB, actual corpus capture/cleanup, exact 2 GiB dependency and overflow, independent working budget: PASS. |
| Reference controller with actual native executor | 512 MiB aggregate **35.512 s**, committed aggregate **48.884 s**, committed 173 MiB **21.374 s**, actual corpus **14.289 s**, large artifact input PASS, **1024 files / 3.368 s**, single 173 MiB **13.260 s**: all PASS. This does not qualify an unimplemented Rust build/seal handler. |

Actual corpus: `/data/data/com.termux/files/home/prj/house-md-distill/corpus/originals`;
**190 files / 37724943 bytes** (37.7 decimal MB, approximately 35.98 MiB).
Ordered path/body identity remains
`d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`;
wrapper path/file-hash manifest remains
`ed814bb6d98f0d3c4daeaef3d31ea422b6a6e011227247d13cbba502228bab1f`.
The capacity group's process high-water measurements are cumulative, not isolated native
controller measurements or hard memory quotas. These timings are one regression run on this
Termux device, not a comparative performance qualification.

This increment changes no source/working/dependency capacity: source/file **512 MiB** and
**100000 files**, source pack **1 GiB**, metadata **48 MiB**, launch/control **8 MiB**,
recipe raw and canonical **64 KiB** independently; working default **128 MiB**, supported maximum
**2 GiB**, dependency **2 GiB / 100000 files / 1000000 nodes**. Model/HTTP ingress remains
**2 MiB / depth 128**; log/page and utility/capture deadlines remain independently bounded.
Ordinary Termux UID, sampled working budget, disk space and deadlines remain real boundaries.
No full-source inline allocation or second source-capacity ceiling is introduced by inspection.
Read-only installed metadata confirmation at closeout: active bundle
`e502ae7ee8a1b19fc524e761b523e357659a18cf24c8553f976fcc60f53855d3`,
product **0.1.27**, configured workingBytes **2147483648**. This readback is not a new live
HTTP/health qualification. No resident/config/provider change is performed.

Remaining P4: fresh native prepare/acquisition, declared-export capture, atomic content retention,
current runtime checks, artifact validation, export/prune/pins, packaged and source deployment
switch/recovery. P5 operator/install/state/performance and P6 installed/client/host/canonical
integration remain outstanding. Reference artifact tests remain evidence, not Rust build/deployment
handlers. Installed complete resident remains 0.1.27 with 2 GiB workingBytes; no production
runtime/provider replacement or activation is performed by this increment.

## Continuation and current frontier — 2026-10-05

Source base: `afa5b5f82676b798587179b03c69352ac9a89e6d`; product input revision **0.1.31**.
The native P3 source-development handlers are connected through the original owners, with ten
advertised families. This increment adds human-name continuation and closes the remaining
current/no-change/resume test boundaries; installed/host qualification remains P6 scope.
The canonical wire contract, SQLite format 3 and spool format 4 are unchanged.

Ownership:

- `src/source/continuation.rs`: exact human project/old remote locators, full-fold label search,
  authority-filtered task/pending/receipt summaries and conservative resolution/completeness.
- `src/storage/continuation.rs`: one 200-row creation-ledger scan plus lookahead; one cursor
  for pending and created work; 8 recent/40 outstanding receipts plus lookahead per task.
  SQL selects only locator/authority fields, excluding source manifests, output, environment,
  stdin and results before Rust decoding. It reuses the original SQLite connection/mutex.
- `src/admission.rs`: pending owner/name is a display-only projection from configured policy;
  revoked grants still fail the separate retained-authority check and cannot hide owned work.
- `src/application.rs`: shared current task/receipt checks can use the same locked ledger view,
  with no nested Store locking or provider/executor/Git observation in find.
- `src/source/casefold.rs`: Unicode 16 full-fold overrides to scalar lowercase, including
  expansions, sigma and Cherokee; stored source/request/project identities are never normalized.
- `src/source.rs`: task inspection bounds its observation interval and refreshes source/history/
  active together after provider reads. A changed writer is projected from the same local view.
- `src/project.rs`, `src/contract.rs`: existing project-name projection reused without a new
  naming owner; only implemented discovery changes. `scripts/check.sh` now runs all common
  source runtime, continuation and current-frontier scenarios against the native executable.

Duplicate explicit project locators remain ambiguous even with one retained task. This tightens
the reference count-based projection, which can return unique in that case. A globally unique
label can still resolve across multiple different projects. Partial scans/continuation pages
never resolve unique. Find only reads retained facts; native worker stop/capture proof can precede
SQLite completion, and does not make an unfinished private import a terminal operation. Bounded
current task reads initiate/observe original completion and expose useful next work without
relaunch. Provider/executor observations and the final local view are not an atomic distributed
snapshot; observation timestamps are excluded from the content cursor.

Focused qualifications:

- Native frontier/lookup boundaries plus discovery: **10 passed in 63.841 s**, including
  provider-observation writer replacement, unrelated lookup/composition while it waits,
  worker completion missed by the caller, 201 pending records and 41 unknown receipts with
  large private intents. An actual managed publish/cleanup/find/predecessor/edit journey passes.
- Common execution/validation/publication and current identity: **18 passed in 125.328 s**.
- Reference/common continuation/frontier/runtime: **18 passed in 100.108 s**.
- Final native Unicode/name/page/delegation/authority/global-label cases: **8 passed in 30.963 s**;
  final reference global-label case: **1 passed in 3.797 s**.
- Actual native source pin-gap pending lookup, original identity preservation and read-only
  fixture connection cleanup: **1 passed in 16.873 s**. Inventory link validation passed.
- Formatting, strict all-target clippy and locked build passed before the whole regression gate.

Draft runs are not qualifications: the initial 15-case selection had two failures and three
errors from fixture assumptions about exact .git remote locators, discovery ordering and absent
output during asynchronous preparation. Corrected fixtures preserve those product boundaries.
The expanded 21-case selection then had one premature assertion equating worker result existence
with completed private import/SQLite commit. Its corrected bounded current-read case passes in
the native frontier qualification above. Initial compile/clippy errors were corrected before
qualification. No failed draft is recorded as a whole-script PASS.

First whole-script attempt froze **292** inputs and the actual corpus; it exited **1 in
2883.292 s**, with both unchanged. It passed **116 Rust** tests, identity/compiled-contract
comparisons and **90 native common HTTP** cases. The 92-case native fault group had one failure
in `NativeImportTest.test_changed_config_checkout_binding_blocks_pending_and_completed_replay`:
`release_caller` imposed an extra **8-second** thread join after releasing the scan barrier.
The traceback reports the caller still alive at that fixture deadline; the earlier checkout
binding rejection assertions passed. The same qualified binary passed the standalone case in
**18.421 s** before any change. The fixture now waits its existing **45-second HTTP budget**,
retaining all identity/receipt/source assertions and production utility/HTTP deadlines. This is
not a product fix or a performance qualification. Reference/common and final capacity stages
were not reached by this failed script. Its logs/input witnesses remain as `draft-*` under
`.artifacts/continuation-0.1.31/`; no whole PASS is claimed for it.

After aligning the fixture wait, all **7 native checkout-import fault cases passed in
98.494 s**. Added pending/completed localChanges lookup denial passed **1 in 16.407 s**.
A further negative pending-project fixture exposed a real lookup projection bug: revoking
policy grants made `Example/Pending` appear `none` instead of `unavailable` (one failure in
2.033 s). Configured owner/name projection now remains available for identifying an already
owned intent, while the independent current policy/authority check still denies it. Final
native continuation/name/revocation/binding cases pass **15 in 72.044 s**, with fmt, strict
all-target clippy and locked build. No provider call or state mutation is part of this lookup.

Final whole regression gate: `scripts/check.sh` started **2026-10-06 00:00:02 UTC** and
exited **0 in 4795.747 s** on **292** frozen source/test/contract/documentation inputs.
Only this evidence document is excluded; every frozen input and the actual corpus remained
identical before/after. Input manifest SHA-256 is
`f32ddf37d3c49551281e98f4590bbf36fedd6cb2dc30c3f9ed9d4a310ced8807`;
qualified executable SHA-256 is
`ed3eb46ab2d4114a78772f48d76d34ce60c1142f88bc284aa5831a7f9744b976`.
The uninterrupted run passes formatting, strict all-target clippy, the locked build,
**116 Rust tests**, **10003 identity comparisons**, **136 compiled-contract cases**, and
**183 native HTTP cases** (90 common plus 93 native fault cases). The fault group passes in
**1091.686 s**, including the original failing import case and pending-policy revocation fix.
It then passes **474 reference/common cases in 1654.582 s** and **7 reference-controller/native-
executor capacity cases in 280.947 s**: **780 test executions**, plus both comparisons and
final diff checks. The last capacity suite uses the reference controller with real native
execution; it does not qualify Rust artifact handlers. Python emitted **15 SQLite unclosed-
database warning events**, all in the reference/common group; none appeared in native HTTP.
These warnings did not fail the gate and are not reported as fixed reference connection ownership.
Logs and before/after witnesses are retained under `.artifacts/continuation-0.1.31/`.

Native HTTP large-source regression passed the >=173 MiB dirty-checkout journey in **67.469 s**,
512 MiB aggregate plus one-byte overflow refusal in **253.832 s**, committed >=173 MiB source in
**54.835 s** (isolated controller VmHWM **29168 KiB**) and the actual corpus in **43.645 s**.
The 93-case native fault group also passes >=173 MiB execution/capture/SQLite completion/retirement,
large exact validation/publication, 2 GiB dependency edge/overflow and frozen working-budget tests.

The final reference-controller/native-executor capacity journeys pass:

| Fixture | Content | Journey time | Result |
|---|---|---|---|
| 512 MiB aggregate | 8 files / 536870900 bytes, plus fixture base files to the exact source edge; one-byte capture overflow rejected | 50.962 s | PASS |
| Committed 512 MiB aggregate | 8 files / 536870900 bytes | 72.944 s | PASS |
| Committed >=173 MiB source | 1 file / 181403679 bytes | 30.391 s | PASS |
| Actual corpus | 190 files / 37724943 bytes | 25.807 s | PASS |
| Artifact source input | 181403679 bytes | not separately timed | PASS, reference artifact owner |
| Many files | 1024 files / 1024 bytes | 7.973 s | PASS |
| >=173 MiB single file | 1 file / 181403679 bytes | 16.728 s | PASS |

The corpus is **37.7 decimal MB / 35.98 MiB**, not a 37.7 MiB corpus. The separate generated
190-file fixture remains **39690240 bytes / 37.85 MiB**. The actual ordered path/NUL/body journey
digest is `d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`;
the wrapper's path/NUL/file-hash manifest uses a different encoding and has SHA-256
`ed814bb6d98f0d3c4daeaef3d31ea422b6a6e011227247d13cbba502228bab1f`.
No original corpus bytes are changed or added to the repository. Final capacity high-watermarks
are **40564–43972 KiB** for the controller/utility fields; these are cumulative getrusage witnesses
within that suite, not isolated per-journey Rust measurements or hard RAM/PID/disk quotas.
Large fixture times are observed timings, not an equivalent-load performance comparison.
P5 workload/device/concurrency and small-workload performance qualification remains outstanding.

This evidence closes the **native P3 default exit gate**; continue with P4. No Python controller
or worker is used by the Rust source-development slice. Source/file 512 MiB, source pack 1 GiB,
source metadata 48 MiB, launch metadata 8 MiB, working default 128 MiB / maximum 2 GiB,
dependency 2 GiB and the bounded read/model/wire budgets remain independent and unchanged.
Read-only installed bundle/config inspection confirms active bundle
`e502ae7ee8a1b19fc524e761b523e357659a18cf24c8553f976fcc60f53855d3`, version **0.1.27**,
and workingBytes **2147483648**. No resident or provider activation is performed.

Remaining boundaries: P4 artifact acquisition/retention/build validation/deployment; P5 operator/
CLI/install/state/performance; P6 installed/client/host journeys and canonical integration/removal
of superseded runtime. The source validation alternative alone is implemented; the inventory's
shared default action does not qualify its P4 artifact alternative. Explicit remote execution
is unsupported in this native executable; the retained dormant reference adapter/fixtures do
not qualify a Rust remote handler. Live provider authentication/TLS and ChatGPT user-visible
continuity are separate qualifications. Ordinary Termux UID authority and independent source/
metadata/working/dependency/response budgets remain unchanged. The installed complete resident
remains 0.1.27 with 2 GiB workingBytes; no activation is performed by this increment.


## Source validation and publication — 2026-10-05

Source base: `6899bd10849ecc3bfb25cf5a563035f3ecdf1dd4`; product input revision **0.1.30**.
This increment joins exact source validation and non-force publication to the original execution,
Git and SQLite owners. SQLite format 3, spool format 4 and the wire contract remain unchanged.
Discovery now exposes nine implemented families; source validation only is advertised, with
artifact validation still reserved for P4. The installed complete controller remains 0.1.27;
this is not a partial-controller cutover or the complete P3 exit gate.

Ownership:

- `src/execution/api.rs`: frozen source/base/policy/candidate binding, adopted command/deadline
  origin/working capacity, new-admission-only candidate construction, original job proof, controls,
  bounded background preparation/completion and paged projection.
- `src/supervisor/source.rs` and `src/execution.rs`: stopped readonly source seal plus original
  manifest/report matching; changed/deleted/mode-changed source fails validation, new outputs
  never enter its candidate, and capture is not imported into the task checkpoint.
- `src/storage/execution.rs`: candidate binding before dispatch, original execution/validation
  CAS completion, and transaction rollback if any validation completion attempts source import.
- `src/source/publication.rs`, `src/storage/publication.rs`, `src/git/refs.rs`: current policy/source/
  expected-head checks, one writer and unique publication per validation in one transaction,
  original intent before external effects, ordinary non-force pre-push advertisement checking,
  explicit local old-OID CAS, atomic receipt/task closure and observation-only recovery.
- `src/transport.rs`, `src/application.rs`, `src/contract.rs`: source-only narrowed discovery,
  current receipt authority, source validation/control/status routing and opt-in progress SSE.

A validation candidate has the admitted source tree and exactly the canonical base as its sole
parent. Its command comes from current operator policy, not source content or stdout. Policy
identity includes adopted command, executor and tooling environment; deadline default and
working capacity are execution budgets. Changing a repository timeout alone does not invalidate
an existing successful exact candidate. Missing candidate/job preparation after controller death
stays unknown and never reconstructs/relaunches on replay. Ordinary command/process behavior
continues through the same execution owner.

Publication aliases retain every request identity but return the original effect. Different
publication input conflicts; neither aliases nor recovery push again. Exact candidate head or a
verified descendant under the enrolled no-rewrite/no-delete policy can prove completion; an old
or unrelated head leaves unknown and retains its writer. GitHub transport keeps controller
credentials out of private execution input and receipts. Fixtures use isolated provider executables
and disposable Git; no real provider or service mutation is qualified by these cases.

Focused evidence:

- Initial native source-validation HTTP cases: 9 passed in 57.943 s.
- Expanded native/capacity plus publication-writer cases: 25 passed in 322.337 s, including
  immediate (<2 s) admission of a 181403679-byte file, unchanged-source validation, exact candidate
  publication and retirement. Intent remains below 8 KiB, with no inline source body.
- Final affected native checks: 41 passed in 273.717 s, covering the 11 common validation cases,
  12 native validation/publication cases excluding the previously exercised large-file journey,
  15 existing GitHub cases and three discovery/uncertain-writer cases.
- Corrected reference/common validation cases: 11 passed in 60.517 s.
- Final native affected completion/budget/alias/forged-seal/SQL-recovery/discovery cases: 6 passed
  in 26.554 s. Standalone discovery/inventory: 2 passed in 2.222 s.
- Rust readonly changed-source stop proof: 1 passed in 1.26 s. Rust SQLite validation import
  rejection/rollback: 1 passed in 0.06 s. Formatting, strict clippy and locked native build passed
  before the whole regression gate.

Draft failures are not qualifications: one 19-case run had a malformed test edit input (SCHEMA
instead of its intended TASK_BUSY), then corrected cases passed. The first reference run had
four failures because it assumed only pre-admission rejection; reference publication can retain
failed/effect=none receipts and a refused accepted publication's unique slot. Common assertions
now check the explicit rejection or failed/effect=none result and use new validation attempts
where needed. Rust current-policy/source/explicit-head refusal happens before reservation; this
behavior difference is intentional and documented in ARCHITECTURE. One parallel standalone
fixture startup exited with EPERM; the serial rerun passed. Its cause is unproved, not a product
fix or permission rejection.

Whole regression gate: `scripts/check.sh` exited **0 in 3480.335 s** on **286** frozen
source/test/documentation inputs, all unchanged before/after. Input manifest SHA-256 is
`78641ddc1702028c8ea1c52f62aeed882ad3b0b9e440a1f2a5fa97b5fe324656`;
qualified executable SHA-256 is
`0cefbb32699f0963696d6fd73cbed77a10da2fd565bfaa9472aefb8f7252a2d9`.
The uninterrupted run passes formatting, strict clippy, **116 Rust tests**, **10003 identity**
comparisons, **136 compiled-contract** cases, the locked native build, **157 native HTTP**
cases, **464 reference/common** cases in **986.274 s**, **7 native capacity** cases in
**254.622 s**, and final diff checks: **744 test executions**, plus the two comparisons.
Python emitted **20** SQLite unclosed-database warning events: five in native HTTP fixture
processes and fifteen in reference/common tests. These warnings did not fail checks; they
are not evidence that fixture connection cleanup is complete.

The selected actual corpus remains **190 files / 37724943 bytes**, unchanged before/after,
at `/data/data/com.termux/files/home/prj/house-md-distill/corpus/originals`. Its capacity-journey
ordered path/NUL/body-SHA-256 digest is
`d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`;
the outer qualification witness uses its separate encoding and records
`ed814bb6d98f0d3c4daeaef3d31ea422b6a6e011227247d13cbba502228bab1f`.
The size is 37.7 decimal MB / approximately 35.98 MiB; the separate generated 190-file
39690240-byte fixture qualifies the requested >=37.7 MiB class.

| Final native capacity journey | Result | Seconds | Controller / utility peak KiB |
|---|---|---:|---:|
| 512 MiB aggregate (536870900-byte fixture plus base) | PASS | 58.733 | 41920 / 41920 |
| Committed 512 MiB aggregate | PASS | 63.232 | 43300 / 43300 |
| Committed 181403679-byte single file | PASS | 25.225 | 43844 / 43844 |
| Actual 190-file corpus | PASS | 17.477 | 43844 / 43844 |
| 181403679-byte artifact source input | PASS | Included in seven-case total | Not separately reported |
| 1024 files | PASS | 4.166 | 49840 / 49840 |
| 181403679-byte single file | PASS | 17.133 | 51896 / 51896 |

Peak figures are cumulative process resource high-water measurements, not a hard RAM quota.
The focused large-source validation/publication journey uses a file already present in the
remote base; it does not qualify a new 173 MiB blob upload to a live provider. Evidence logs
and frozen-input witnesses are retained under `.artifacts/source-publication-0.1.30/`, outside
tracked product inputs. Only this evidence document was excluded from the frozen input set.
Read-only installed bundle/config inspection confirms **0.1.27**, with
`artifactLimits.workingBytes=2147483648`; this increment does not change the resident.

Remaining boundaries: P3 human-name continuation lookup, remaining bounded current-frontier/
no-change/recovery inventory and exit qualification; P4 artifacts/deployment; P5 operator/state/
installation/performance; P6 final client/installed/host journeys, removal of superseded runtime
and canonical integration. Optional remote backend and real GitHub authentication/TLS remain
separate qualifications. Native execution still carries ordinary Termux UID authority with
sampled working/dependency budgets, not hostile-code isolation or hard aggregate RAM/PID/disk
quotas. Source/file 512 MiB, binary source pack 1 GiB, source metadata 48 MiB, launch/control
metadata 8 MiB, task dependencies 2 GiB, source/context response bounds and existing utility/
capture deadlines remain independent and unchanged in this increment.

## Public execution and completion — 2026-10-05

Source base: `4c60bd13f80b8b48811e81298d127ae45eece436`; product input revision **0.1.29**.
This increment connects public command/process execution, observation, controls and dependency
reset. It does not close the P3 validation/publication/recovery gate or activate the partial
controller. SQLite format 3 and public wire definitions remain unchanged; private supervisor
spool format is now 4. The installed complete controller remains 0.1.27.

`src/execution/api.rs` owns frozen public execution/control intent, supervisor proof matching,
bounded background preparation/import and caller projection. `src/storage/execution.rs` joins
admission, source checkpoint/writer CAS and terminal receipt in the existing SQLite owner.
`src/execution/reset.rs` journals operation/task/directory identity before same-device rename
and deletion, excluding logical running/unknown consumers as well as the stable kernel lease.
Completed reset replay preserves rebuilt dependencies. Identity conflict retains the original
unknown reset/writer and both directories. Process completion never changes source, another
writer or task closure. A retained writer from an unconnected feature remains busy; task
summaries stay observable without interpreting that feature's effects.

Only physical new admission schedules preparation/dispatch. At most eight controller execution
activities prepare/import concurrently; rejection reports `executionWork configured=8 observed=9`
and rolls back the new receipt/writer. This is independent of the existing eight outstanding
process slots per task. Immediate admission/status do not wait on preparation/import locks.
At most 64 pending controls per target are retained; the 65th reports
`pendingControls configured=64 observed=65` without a new row. Controls retained during
preparation reconcile to the original spool before launch, after initial stdin. Preparation
controller death preserves unknown execution/control records and never dispatches on replay.
Stopped proof permits private import/completion reconciliation; neither recovery nor replay
reconstructs input or launches another command. Logs are paged independently; task/workspace
summaries omit their bodies and stdin text.

| Budget | Qualified configured boundary / owner |
|---|---|
| Source/file bytes | 536870912 each; existing source/capture capacity owner, streaming bodies |
| Source files | 100000; independent of body bytes |
| Binary source pack | 1073741824; separate physical transport budget |
| Source manifest metadata | 50331648; no source bodies in JSON |
| Private launch/control record | 8388608; supervisor spool format 4, separate from source metadata |
| Native working bytes | Frozen per admission, default 134217728 / configured maximum 2147483648 |
| Task dependency bytes/files | 2147483648 / 100000; separate 1000000-node scan ceiling |
| Caller logs | 1048576 retained; default 24000 / maximum 65536 bytes per page |

The private record ceiling increases from 1048576 to 8388608 bytes for merged tooling/caller
environment and bounded launch strings. Source, pack, source metadata, native working,
dependency and caller response budgets remain unchanged relative to this increment's base.

The first synchronous draft exposed a large-source admission wait, despite passing private
source and small HTTP cases. Preparation/import now run in bounded controller activities.
The initial asynchronous HTTP selection passed 29/31 in **358.541s**; two fixtures incorrectly
required immediate terminal stdin-control responses during preparation. Corrected observation
checks passed **2 in 7.578s**. An initial full attempt then passed Rust/identity/contract and
131/133 native HTTP cases but failed two retained-publication writer cases. Its **2162.862s**
result is not a PASS; implementation inputs changed while those old-binary fixtures finished.
The fix preserves unsupported writer state instead of trying to interpret it. The expanded
fixture first failed because it expected busy instead of closed-task admission; it now checks
closed-state preservation and open-state writer exclusion separately. Final focused cleanup
and predecessor regressions passed **2 in 18.125s**, with all-target locked clippy/build passing.

Final full qualification freezes **282** implementation/test/script/contract inputs, manifest
SHA-256 `8f41b93c320acdaeffaee410e5f4601d7152d12186d390f4b93f6a41c13d3dbe`, with the actual
corpus selected explicitly. The completed prefix passes fmt/clippy, **115 Rust tests** (48
library in **5.99s**, 19 source execution in **483.18s**, 17 Git in **49.50s**, 31 supervisor
in **6.86s**), **10003 identity** comparisons, **136 compiled-contract** cases, the native
build and **133 native HTTP** cases. The 73-case native fault/recovery stage took **842.301s**.
The complete `scripts/check.sh` run then passed **453 reference/common cases in 1242.803s**,
**7 native capacity cases in 270.579s** and final diff check. It exited **0 in 3660.714s**;
all **282** frozen inputs remained identical. This is an uninterrupted whole-script PASS:
**708 test executions**, plus the independent identity/compiled-contract comparisons above.
Reference/common emitted **15** pre-existing SQLite unclosed-database warning events (30
ResourceWarning lines including tracing hints); no test failed. Native HTTP emitted none.
Qualified executable SHA-256 is
`bc52d9c2816fed966a5d7061b50a3f0508fe640c98e9e459cceec2fe525ee7c2`.

The actual corpus at `/data/data/com.termux/files/home/prj/house-md-distill/corpus/originals`
was selected for Rust source execution, native/reference HTTP and native capacity qualification:
**190 files / 37724943 bytes**, with ordered path/NUL/body-SHA-256 manifest
`d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`.
The outer qualification witness confirms identical corpus contents before/after; no corpus
bodies are added to this repository. The byte count is 37.7 decimal MB / approximately 35.98 MiB;
the separately qualified generated 190-file fixture is 39690240 bytes (37.85 MiB).

| Final capacity journey fixture | Result | Seconds | Controller / utility peak KiB |
|---|---|---:|---:|
| 512 MiB aggregate, including 12-byte base | PASS | 65.610 | 40272 / 40272 |
| Committed same 512 MiB aggregate | PASS | 75.331 | 40272 / 40272 |
| Committed single file, 181403679 bytes | PASS | 27.112 | 40272 / 40272 |
| Actual corpus, 190 files / 37724943 bytes | PASS | 23.082 | 40272 / 40272 |
| >=173 MiB artifact source input | PASS | included in suite | not separately measured |
| 1024 files / 1024 fixture body bytes | PASS | 3.113 | 40884 / 40884 |
| Single file, 181403679 bytes | PASS | 13.814 | 42956 / 42956 |

These reference native journeys cover admission → capture → checkpoint → integration →
workspace → retirement/cleanup, including validation/publication for committed-source cases.
Their peaks are cumulative process/child high-water observations, not a hard memory quota.
Native HTTP separately passed the same corpus (**37.448s**), 173 MiB file (**45.313s**),
committed 173 MiB source (**51.193s**) and 512 MiB aggregate (**203.353s**). The aggregate's
536870900 fixture bytes plus the original 12 bytes meet the exact 536870912 source boundary.
The new public native execution test additionally proves <2-second immediate admission for a
181403679-byte source, changed-byte capture, atomic SQLite checkpoint, restart readback and
retirement with a <4096-byte frozen intent. Private Rust source tests qualify 512 MiB capture,
one-byte overflow preserving source, file/metadata edges and many-file retirement. Public
HTTP also qualifies exact sparse dependency length 2147483648 and 2147483649-byte refusal,
1-byte frozen working allowance vs newly configured 2 GiB, process/work/control capacity edges,
preparation death, lost input acknowledgment and reset rename/rebuilt-directory recovery.
The final qualification logs, source manifest and result/corpus witnesses are retained under
`.artifacts/public-execution-0.1.29/`; LOCAL_VALIDATION remains the evidence narrative owner.

Source/capture capacity does not expand native working allowance, dependency storage or caller
context. Capture retains its 300-second deadline. Native same-UID execution and inherited OS
limits are unchanged; there is no hard aggregate RAM/PID/disk quota, and Git algorithm/internal
utility resources remain separate. Sparse exact-2-GiB dependency fixtures test accounted length
and preflight refusal, not guaranteed physical free disk. Missing preparation/worker/stop proof
remains unknown and cannot authorize retirement/reset or another launch. Source validation,
exact non-force publication and remaining recovery qualification are the next P3 increment.
Read-only installed alignment confirms bundle
`e502ae7ee8a1b19fc524e761b523e357659a18cf24c8553f976fcc60f53855d3`, version **0.1.27**
and workingBytes **2147483648**; no installed service/config/provider replacement was performed.

## Execution source lifecycle — 2026-10-05

Source base: `05cbee3a944fec07fe2e760edc3584bc03efd59a`; product input revision **0.1.28**.
This increment qualifies private Rust source execution, not public exec admission or a resident
cutover. The installed complete controller remains 0.1.27 with its qualified 2 GiB workingBytes.
SQLite format 3 and public wire definitions are unchanged; private supervisor spool format is 3.

`src/execution.rs` owns preparation, original private Git candidate construction and terminal
retirement. `src/supervisor/source.rs` owns frozen source metadata and worker-sealed capture;
`src/git/mod.rs` exports one shallow non-delta pack through existing bounded utilities.
The reservation binds source checkpoint, manifest and physical pack length/digest. Owned work
has an exact detached shallow HEAD/index and original bytes; a separate directory holds only
starting ignore files. Source bodies never enter JSON or a whole-body memory buffer. Ready
records bind directory identities; incomplete preparations cannot be repaired by replay.
Worker entry checks original source before child dispatch. Descendant stop/output closure and
final budgets precede capture. Matching scans copy no-follow descriptor bytes into owned staging,
then seal the directory and capture evidence before terminal result. Rejected capture retains
stopped execution proof and a named fault, without constructing a replacement checkpoint.
Source 512 MiB/100000 files, physical pack 1 GiB, metadata 48 MiB, working allowance and dependency
capacity remain independent. Capture has a 300-second deadline; native same-UID authority and
Git algorithm/utility resource boundaries remain those already documented below.

Private Git candidate import requires the original worker/input/stop/capture identities.
A shared per-job import/retirement lock serializes construction and cleanup; the first candidate
is retained for concurrent/delayed replay. It is not task pointer or operation receipt truth:
public admission and atomic SQLite completion remain the next increment. Retirement removes
work, source pack, ignore/capture bodies and source metadata, retaining request/digest, terminal
result, controls, bounded logs and the constructed candidate. Unknown jobs cannot be retired.

The first source draft passed 10/11 cases but failed replay identity (**87.61s**): repeating
capture import created a differently timestamped commit. The original-candidate record fixed
that case (**1 in 4.41s**). An intermediate 17-case private-source selection passed **1007.54s**;
review then identified missing shallow Git metadata, so it is not final qualification of the
single-pack path. Corrected focused checks passed shallow HEAD/index in both object formats
(**1 in 4.98s**), corrupted-pack refusal (**1 in 1.58s**) and metadata physical/path overflow
(**2 in 5.00s**). Compile/lint failures during construction are not PASS evidence.
The initial qualification froze **168** source/test/script/contract inputs, manifest SHA-256
`6678256bfd62566695b6e8d4cf3a71ef8f46c2072b1276444d861b8ed9ac69a7`.
On that snapshot, focused/affected qualification passed all-target locked clippy,
**19 execution source tests in 963.15s**, **30 supervisor tests in 5.39s**, **17 Git tests**
and **2 source metadata tests in 4.85s**; the five-stage command took **1041.067s**, exit 0.
The source suite ran serially with the actual corpus selected explicitly. It exercises
prepare → real supervisor → stopped capture → retained private Git candidate → retirement,
including rematerialization, original-candidate replay and exact named over-budget faults.

| Initial serial source fixture | Result | Worker seconds | Sampled worker VmHWM KiB |
|---|---|---:|---:|
| Actual 190-file corpus, 37724943 bytes | PASS | 25.642 | 10132 |
| Single file, 181403679 bytes | PASS | 29.423 | 10028 |
| Same large committed input, unchanged capture/cleanup | PASS | 72.024 | 9668 |
| 512 MiB aggregate, exact 536870912 bytes | PASS | 158.073 | 10476 |
| Same aggregate rematerialized, one-byte capture growth | Expected sourceBytes rejection; original source retained | 105.640 | 10092 |
| 1024 files, followed by unchanged rematerialization | PASS | included in suite | 11888 / 12288 |

These sampled peaks describe the independent worker, not Git child utilities or a hard
whole-lifecycle memory quota. The source suite also rejects a 536870913-byte file with
`sourceFileBytes configured=536870912 observed=536870913`, oversized physical/path metadata,
unsafe symlinks and special files. Incomplete dispatch, changed input, forged capture and
missing terminal stop proof cannot advance a checkpoint or authorize retirement.
The first full gate failed, exit **101 after 458.193s**: **18/19** source tests passed,
but descendant cleanup woke a waiting shell when killing its sleep child, allowing a subsequent
`late` write before the parent died. Capture correctly sealed the stopped final bytes; the
termination order still required correction. `src/supervisor/platform.rs` now freezes observed
parents before killing their wait targets. A new actual-process cancellation case exercises
eight waiting parents concurrently. The revised supervisor suite passed **31 in 5.91s**, and
the original stopped-source case passed **10 repetitions**. The combined command took
**50.075s**, including clippy, compilation and the source repetitions.
Final review also moved ignore-input metadata admission before each buffer extension.
Affected metadata and both-format capture cases, fmt and clippy passed, command **41.032s**.
Final whole-gate qualification freezes the same **168** inputs with revised manifest SHA-256
`11582d2a736af44352b79c3c1e331a46c39b0f0f6780e9f287e885ba87af5343`.
The revised `scripts/check.sh` run passed fmt/clippy, **115 Rust tests** (48 library,
19 source execution in **583.85s**, 17 Git in **64.56s**, 31 supervisor in **6.88s**),
**10003 identity** comparisons, **136 compiled-contract** cases and the native build.
Its first five HTTP stages passed **31 cases**; the capacity stage had passed its large-file,
aggregate and committed-large-source cases when the execution context ended during corpus
qualification. There is no terminal exit code for this run. The frozen inputs remained identical;
the interrupted capacity stage and all following script stages are being completed separately.
Qualified executable input SHA-256 is
`862bf4075ffa5e645be33babeb571cee49c326aff800571a9f32de9af935bc7a`.
The continuation passed every remaining stage with exit 0 on the same frozen inputs:
capacity HTTP (**3 tests**), integration (**10**), cleanup (**5**), predecessor (**5**), native
HTTP fault/recovery (**54**), reference/common (**447 in 1443.404s**), native capacity
(**7 in 328.661s**) and final diff check. HTTP coverage totals **108** cases including the
original 31-case prefix. The eight continuation commands took **3043.841s** in total and
confirmed source identity at every completed stage. Reference/common emitted **15** SQLite
unclosed-database warning events (30 ResourceWarning lines including their tracing footers);
no test failed. This is completed full-script stage coverage across interruption and
continuation, not a claimed uninterrupted script exit 0. Final source and executable hashes
still match the witnesses above.

| Final reference native capacity fixture | Result | Journey seconds | Controller / sampled utility peak KiB |
|---|---|---:|---:|
| Actual corpus, 190 files / 37724943 bytes | PASS | 24.162 | 40644 / 40644 |
| Single file, 181403679 bytes | PASS | 16.570 | 43852 / 43852 |
| Committed single file, same bytes | PASS | 38.684 | 40644 / 40644 |
| 512 MiB aggregate, including the 12-byte base | PASS | 75.929 | 40644 / 40644 |
| Committed 512 MiB aggregate, same total | PASS | 85.953 | 40644 / 40644 |
| 1024 files / 1024 body bytes | PASS | 6.085 | 42356 / 42356 |
| >=173 MiB artifact source input | PASS | included in stage | not separately measured |

These reference journeys cover admission → capture → checkpoint → integration → workspace
→ cleanup; the separate Rust source suite proves the new private execution owner. Aggregate
output records report 536870900 fixture bytes, with the 12-byte base bringing source to the
exact 536870912-byte boundary. Larger content still does not expand model responses or imply
hard aggregate memory/PID/disk containment. Source/file 512 MiB, 100000 source files,
1 GiB pack, 48 MiB metadata, 300-second capture and the existing Git/OS resource boundaries
remain independent of 2 GiB working and dependency allowances.

Final read-only installed alignment confirms active bundle
`e502ae7ee8a1b19fc524e761b523e357659a18cf24c8553f976fcc60f53855d3`, package **0.1.27**,
and workingBytes **2147483648**. No service/config/provider replacement was made for this
private increment. Public command/process admission, SQLite task/receipt/control joins,
controller-death recovery and the running/unknown-consumer reset gate remain the next P3 work.

## Resident maintenance and stopped stdin preservation — 2026-10-05

The source base is `b594de1cfc7fea10e511977a2d357ad22d8b6928`. After the earlier automatic
review rejected a new guard exception without explicit policy authorization, the operator
explicitly authorized preserving one unknown native stdin whose consumer has proved stopped,
and increasing live workingBytes from 512 MiB to 2 GiB. Product revision is 0.1.27.
This does not resolve historical input delivery or authorize a partial Rust controller.

`src/tdev/admin.py` owns the exact-ID maintenance exception. It requires an unknown stdin
control, native backend, matching consumer/owner/repository/ref/identity, and a reconciled
terminal committed consumer with exact execution identity and stopped receipt. Defaults still
reject every outstanding effect. `resident.py` rechecks the exception at fencing and pointer
switch, and retains it in the installation journal so rollback can restore the previous bundle
without erasing the original unknown control. `installer.py` and `cli.py` expose
`--allow-unknown-stdin OPERATION_ID` only for explicit existing-resident updates.
No public tool contract or credential policy changes. The workingBytes config change uses
the existing digest-CAS journaled config transaction, preserving other configuration.

Focused resident/CLI/admin checks passed **51 in 75.716s**. After adding the actual combined
publication/stdin case and interrupted-update recovery, the final four maintenance fixtures
passed **4 in 1.949s**; locked Cargo check passed. Twenty-two negative stop/identity/owner/
backend/status cases reject without changing rows, and another outstanding effect still blocks
maintenance. Positive update raises only workingBytes; readiness failure and interruption
restore the old pointer/config and preserve the original operation rows. The real resident
also passes the new read-only guard with the two explicitly named historical exemptions;
its consumer retains terminal/stopped proof, while delivery remains unknown.
All required `scripts/check.sh` stages passed on the same frozen **165-file** input
snapshot, SHA-256 `c633fc66744cca5c928a0cbfa5bd05ebb67260b7b9fe0bf8cc0347b154b90b24`:
fmt, all-target locked clippy, **93 Rust** tests, **10003 identity** comparisons,
**136 compiled-contract** cases, **108 Rust executable HTTP** cases and **447 Python**
reference/common cases (**949.074s**). The code-mode host was killed after that Python stage,
just as the capacity stage started; the original full script has no terminal exit code.
After confirming all frozen inputs unchanged, the remaining capacity stage passed **7 in
338.657s**, and final `git diff --check` exited 0. This is completed stage coverage across
an interrupted run and its continuation, not a claimed uninterrupted script exit 0.
The prefix emitted **15** SQLite unclosed-connection ResourceWarnings; no test failed.

| Final native capacity fixture | Result | Journey seconds | Controller / utility peak KiB |
|---|---|---:|---:|
| Actual 190-file corpus, 37724943 bytes | PASS | 19.903 | 41352 / 41352 |
| >=173 MiB single file, 181403679 bytes | PASS | 20.384 | 46104 / 46104 |
| Committed >=173 MiB source, same bytes | PASS | 32.567 | 41352 / 41352 |
| 512 MiB aggregate, 536870912 bytes including base | PASS | 74.154 | 41352 / 41352 |
| Committed 512 MiB aggregate, same total | PASS | 102.342 | 41352 / 41352 |
| Many-file source, 1024 files | PASS | 4.942 | 44056 / 44056 |
| >=173 MiB artifact source input | PASS | included in stage | not separately measured |

The source journeys exercise admission → capture → checkpoint → integration → workspace
→ cleanup; the aggregate also exercises one-byte overflow rejection. Actual corpus manifest
remains `d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`.
Qualified debug executable SHA-256 is
`bcc906f885672c80e686af4f24cc0426794dcc4c99510e5c7d18c7f6b8d34584`;
the **217-file** resident bundle identity is
`e502ae7ee8a1b19fc524e761b523e357659a18cf24c8553f976fcc60f53855d3`.
The executable is qualification evidence; resident activation uses the complete currently
implemented controller. The qualified implementation was committed and pushed on
`runtime-foundation` as `03c59906a3f56976c118cade01ec65a2021dfc88`, following capacity
commit `b594de1cfc7fea10e511977a2d357ad22d8b6928`. This closeout changes documentation only;
its final Git HEAD is the branch's canonical HEAD and has the same qualified bundle inputs.

The existing resident at
`~/.local/share/tdev/composition-upgrade-53vwtpp8` was aligned through `admin.stage` and
`Installation.install`, using the existing journal/fence/config-digest CAS with the two
explicit historical operation IDs. Live readback verifies **0.1.25 → 0.1.27**, the complete
217-file bundle above, and **workingBytes 536870912 → 2147483648**. This is the only semantic
config change; credentials, grants, connection settings and resident settings remain intact.
The before/after config digests are
`886b860604dd697cf8ff4729543c9297a5df0922184d839bdd6d1c1830413b81` /
`cb397b2c431c4788af6f513d64b7223e8d63817d5595b81b0f87def3beb7f9ad`.
The settings digest remains
`3ebc7986557c83cb87396e2629441bd9fb6a7e124cf171b37847c0ba4e6f60dd`.
2 GiB is a frozen native working-storage allowance, not a RAM reservation or an increase
in source/model budgets. The native source journeys above select this allowance and prove
lifecycle through 512 MiB source; they do not claim a new 2 GiB source-content capacity.

Exact full SQL-row hashes before/after remain equal:

| Retained operation | Status / effect | Full row SHA-256 |
|---|---|---|
| Managed create publication `2531fb0f9bbd4aa584865f62898e1010` | unknown / unknown | `1dc66a0e490eb272d7366d30a7ff296d99e7d55c9109320ac9f469bfe20a8e06` |
| Native stdin `9b2a9a574fea49a98a0b93cd1a6a127a` | unknown / unknown | `6ba6b6ebed6006e593176a11e59807ff4988daed572448697c85e8f6ef4ecfc2` |

Consumer `c5ededc2a5c043f9a6a543cfa76535ba` retains its terminal/stopped committed proof.
There was no input resend or historical certainty promotion. Default maintenance admission
still returns `OUTSTANDING_EFFECT`; only the explicitly named exemptions allow this update.
Installation journal and maintenance fence are cleared, with previous config retained for
canonical recovery. The initial immediate post-update assertion found both external Tunnel
polls degraded even though local installation had committed. Subsequent direct owner checks
proved both successful control-plane polls without reinstalling or changing credentials.
Final controller PID was **24786**, with Tunnel PIDs **25139 / 25148**, all desired UP.
PID values are observations, not durable identities. Backend live readback does not certify
ChatGPT-visible refresh/continuity; host refresh remains a separate acceptance action.
Safe readback evidence is retained in `$TMPDIR/tdev-maintenance-live-{before,after}.json`,
and qualification in `tdev-maintenance-{full,remaining}.log`, `remaining-result.json` and
`qualification.json`.

## Source capacity and streaming transport — 2026-10-04

The inspected source base is `ec3479b4feb118ef9ce6b41dca4abab8a0018df9` on the
current `runtime-foundation` branch. The working implementation, not earlier branches or
design notes, supplied the following effective-limit inventory. Product revision is 0.1.26.

| Budget/path | Inspected implementation | Current implementation |
|---|---|---|
| Git single blob / checkout file | 16 MiB | 512 MiB |
| Checkout / stopped source capture aggregate | 32 MiB | 512 MiB |
| Admission and final compose/integration tree | admission depended on subsequent readers; final aggregate not consistently checked | immutable sizes, 512 MiB aggregate / 100000 files |
| Execution source transfer | duplicate inline base64 files and base64 pack inside 48 MiB JSON guards | one shallow binary pack, 1 GiB physical transfer |
| Capture transfer | whole inline file bodies; 32 MiB content / 48 MiB response guards | stopped binary tar, 1 GiB physical transfer |
| Source/control metadata and utility output | 48 MiB | 48 MiB, independent of binary bodies |
| Checkout selected paths | 100000 | 250000 selected paths; final source remains 100000 files |
| Native working storage | 128 MiB default, operator maximum 2 GiB | same frozen byte budget; prelaunch/sample/final checks |
| Working files / scan nodes | owner-dependent 100000 entries/nodes | 250000 files / 1000000 scan nodes |
| Task dependencies | 2 GiB, 100000 entries/nodes | 2 GiB / 100000 files, separate 1000000 scan nodes |
| Model HTTP input / read page / search scan | 2 MiB / 64 KiB / 16 MiB | unchanged and independent |
| Artifact recipe source inputs | additional 32 MiB check and body buffering | admitted source capacity; streaming SHA-256 |

Actual owners: `contracts/tools.schema.json` owns the wire semantics; Rust
`src/git/capacity.rs` and Python `src/tdev/capacity.py` implement content/transport budgets.
The standalone dormant executor repeats these values because it is digest-pinned and installed
independently; tests compare all owners with the contract. `src/git/mod.rs` and
`src/tdev/git.py` validate admission/final construction, stream blobs and shallow packs,
and expose bounded read pages. Verified immutable object sizes are reused locally, while
aggregate accounting still counts every source path, including repeated object identities.
`src/git/checkout.rs` and `src/tdev/checkout.py` use matching file-descriptor/stat/SHA-256
scans without retaining file bodies in memory. The first scan couples its content witness
to an owned temporary file used by Git; it never rereads the mutable original to construct
the private object. A controlled equal-metadata A → B → A test proves the stored blob still
matches the witnessed bytes. Temporary copies close on every outcome.
`src/git/integration.rs`, `src/git/replacement.rs`
and `src/tdev/integration.py` stream private merge/replacement inputs and output.

`src/tdev/core.py` and `src/tdev/artifacts.py` freeze metadata plus one binary descriptor;
`src/tdev/native.py` and `src/tdev/executor.py` own materialization, stopped archive capture,
storage checks and cleanup. `src/tdev/remote.py` carries length-framed bounded metadata plus
binary streams over SSH. Capture requires the exact stopped operation/input/descriptor
evidence before Git checkpoint construction. Native retirement removes source pack, capture
archive, execution request and working directories while retaining receipts. Deployment
source hashing/materialization uses the same streaming owners through
`src/tdev/deployments.py` and `src/tdev/deployment_runtime.py`. Private Rust supervisor
storage diagnostics live in `src/supervisor/{spool,environment,mod}.rs`; its structured budget
evidence does not add unowned public Fault fields.

The removed structure was repeated whole-source guards at checkout, capture, export, core
submission, artifact submission and utility transport. Admission and final construction still
validate the same content budget deliberately; downstream transport checks physical archive
bytes and metadata, rather than imposing a smaller content ceiling. Large bodies use 64 KiB
chunks or regular file descriptors. Git bulk writes have a 1 MiB large-file threshold;
pack windows/cache are bounded separately (1 MiB window, 16 MiB mapped limit/cache).
Text diff retains its prior 512 MiB threshold/semantics. Official
[Git configuration documentation](https://git-scm.com/docs/git-config) explains why a
large default pack mapping and the text/binary threshold required separate handling.

Additional committed-source qualification exposed a second issue: a few fetched objects
were unpacked into loose files, whose mappings raised utility peak RSS to approximately
185 MiB on a 173 MiB source. Client settings alone did not configure local upload-pack.
The fetch owners now configure the local sender independently and set `fetch.unpackLimit=1`
to retain the received pack. A zero setting did not retain the pack in the measured Git
2.55.0 run; changing `cat-file blob` to `-p` also did not resolve loose mappings.
The same Python transfer owner serves admission, ancestry observation and local publication/
managed-ref object transfer; Rust source fetch applies the same settings. Corrected focused
native journeys passed: committed 181403679-byte source **25.496s / 42900 KiB peak**, and
committed 536870912-byte aggregate including base files **121.481s / 38292 KiB peak**.
These include stopped capture, checkpoint, integration, workspace inspection and cleanup,
plus the aggregate's one-byte overflow rejection. Git affected checks passed **17 in 59.78s**;
all-target clippy passed. The final full gate result is recorded below.
The committed single-file fixture additionally passed real validation/publication and
managed-ref cleanup **44.334s / 42656 KiB peak**. The actual corpus passed with the ordinary
**128 MiB workingBytes** default **24.514s / 41368 KiB peak**. An initial combined Python
affected selection passed its behavior checks but failed the HTTP fixture's memory assertion:
it measured cumulative unittest-runner child peaks from earlier physical-budget fixtures.
The HTTP fixture now measures its own live controller's `/proc` high-water mark; the isolated
native journey continues to bound controller and utility child peaks separately. That failed
selection (36 checks / 108.595s) is not a PASS.

The actual user corpus is read-only evidence at
`/data/data/com.termux/files/home/prj/house-md-distill/corpus/originals`: **190 files,
37724943 bytes** (37.7 decimal MB, approximately 35.98 MiB). Its ordered path/NUL/body-SHA-256
manifest digest is `d472c85cb1d54046b49b9a325be9596638f987489e8152e9b569370d5b201151`.
No corpus body is added to this repository. Generated 190-file evidence separately uses
39690240 bytes (37.85 MiB), meeting the requested binary-unit size as well.

`tests/capacity_journey.py` exercises actual native source admission → capture → checkpoint →
integration → workspace inspection → retirement/task cleanup, preserving original index/refs.
Fixtures include the actual/generated corpus, a **181403679-byte single file**, 1024 files,
and eight distinct files totaling **536870912 source bytes including the original 12 bytes**.
The last also attempts one-byte growth, rejects capture with
`budget=sourceBytes configured=536870912 observed=536870913`, and preserves its checkpoint.
Another journey validates/builds an artifact using a >=173 MiB source input, eliminating the
former recipe-specific ceiling. `tests/acceptance/test_capacity.py` checks checkout/edit/
integration/read/workspace/cleanup through executable HTTP against both implementations.
The Rust public execution handlers are not yet implemented; full native execution/capture
journeys qualify the current full Python surface, while Rust checks qualify its implemented
HTTP surface and private supervisor foundation.

Physical edge fixtures in `tests/git.rs` cover 512 MiB−1/exact single-file hashing, bounded
pages, a 512 MiB text replacement crossing a chunk boundary, final aggregate bounds and
100000/100001-file construction. `tests/test_capacity.py` covers manifest byte/count edges,
48 MiB−1/exact/over metadata frames, **1 GiB−1/exact/over physical binary transfer**, exact
digest/length/EOF/nofollow checks and uncertain reservation replay without relaunch.
Sparse physical fixtures are streamed/read, not allocated as whole in-memory bodies.
Additional checks keep working scan nodes distinct from file count and retain exact configured/
observed dependency/working byte diagnostics. A wrongly named `test_integration` selection
produced an import error, not PASS; the corrected affected selection passed **28 in 95.427s**.
Rust Git affected checks passed **17 in 58.01s** and all-target clippy passed.

Small-workload comparison uses disposable executable HTTP fixtures, excludes server startup,
alternates baseline/current order and takes ten samples per version for both implementations. It runs
connect + checkout start + 12 six-byte replacement/read pairs; Python additionally runs actual
native exec/capture/retire. Median Rust latency is **10.964558 → 10.414968 seconds** (0.950×);
Python is **4.931108 → 4.705780 seconds** (0.954×). No regression was observed in this bounded
local workload; this is not a concurrency or broad device performance guarantee. The final
measurement ran after focused tests completed, including the committed-source fetch correction.
Rust sampling was expanded after three samples had high variance (initial median 1.043×);
all ten samples are included, not selected by result. The Rust-only helper completed all
fourteen additional timed workloads but then selected an absent Python group in the summary
and exited 1. The corrected combiner verifies 26 initial and 14 additional completed workload
rows and ten samples in each group before computing these medians; this is not a product
failure or a PASS claim for the faulty helper. Earlier exploratory/pre-fetch measurements
remain retained but do not identify the final implementation.
Baseline Rust binary SHA-256 is
`ea8c2096005998e73c53d09ef53ff0c3f3fcb96c4defa918f0db0ff27678caec`;
measured debug binary before the independent spool publication correction is
`76043319a0db71b260dfd9a397632e4abb44f5057126bf73efb1d9fdcf474e1a`.

The next complete gate exited **101 / 50.448s** in one shared-dependency cancellation
fixture: its worker retained incomplete evidence (`kind=Other`). A deterministic serializer
barrier then proved that the old `once` implementation exposes empty cancellation JSON
before serialization completes: the baseline countertest exits **101** with **EOF while
parsing a value**. The original worker diagnostic did not record the detailed cause, so the
countertest establishes the race rather than attributing that single diagnostic uniquely.
`src/supervisor/spool.rs` now serializes/syncs a private temporary file and publishes it
with the existing tempfile no-replace primitive. On Android this uses no-replace rename;
the initial direct hard-link implementation failed PermissionDenied and was replaced.
Existing fences are never overwritten, and failed serialization removes the temporary file
without publishing a fence. Both focused visibility tests passed; clippy passed; the
supervisor's **30 tests passed five consecutive runs** after the correction. An intermediate
clippy placement error was corrected by placing the test module after production items.
Those rejected attempts are not PASS. Source/Git owners measured above did not change in
this private-spool correction. Full gate qualification of the corrected input passed below.

The subsequent full run was deliberately interrupted with actual exit **130 / 531.731s**
to correct two diagnostic owners. Rust's combined stdout/stderr utility ceiling now reports
the original configured total and the observed combined total, rather than a remaining
allowance. GitHub transport preserves these owned numeric budget errors while still hiding
provider child diagnostics. Actual-process unit fixtures prove both properties; focused Git
checks passed **17 in 48.95s**, all-target clippy passed, and Rust HTTP GitHub checks passed
**5 in 27.262s**. These changes do not alter successful source/Git work measured above.

Remaining independent boundaries: source 512 MiB/100000 files, physical pack/capture 1 GiB,
metadata/control 48 MiB, capture extension header 16 KiB, read page 64 KiB, search scan 16 MiB
and model input 2 MiB. Searching one larger file now returns a named scan-budget error instead
of rereading it or leaving a pagination cursor stuck. Native workingBytes still defaults to
128 MiB; qualification selects 2 GiB because a materialized source also holds private Git
objects. Dependency capacity stays independently 2 GiB. Filesystem space, inherited OS limits,
bounded utility/capture deadlines and private retained history remain separate constraints.
Git text merge/diff algorithms may allocate complete internal inputs; there is no hard native
aggregate memory quota. Externally packed large deltas can also require full-object Git
decoding; measured bounded-RSS fixtures contain ordinary non-delta large objects. Git's
[packed streaming implementation](https://github.com/git/git/blob/v2.55.0/packfile.c)
explicitly falls back for delta objects. The 512 MiB aggregate journey after pack-window correction measured
42760 KiB peak controller/child RSS; an earlier 531788 KiB utility peak exposed the mapping
issue and is not evidence of bounded memory. Dormant SSH/OCI stream fixtures do not qualify a
live remote host: OCI memory remains 512 MiB and /tmp 128 MiB, independent of /work's frozen
workingBytes. No partial Rust server is activated as the resident.
Retained legacy inline requests/captures remain readable for previously accepted work; their
whole-body JSON path has a 48 MiB control frame and is not a large-source streaming format.
New source operations always use the binary descriptor path, without caller format selection.

Evidence is retained under `$PREFIX/tmp/tdev-capacity-*.log`, including
`actual-corpus-final`, `aggregate-memory`, `large-artifact`, `physical-edges`,
`size-cache-{lint,rust,python-qualified}`, and `small-performance-final`. The explicit full
gate's first run was deliberately interrupted with actual exit **130** for the checkout
content/object coupling correction; its evidence is `full-interrupted.log/.exit` and is
not PASS. A subsequent run completed 89 Rust checks, identity/contract comparisons and all
107 Rust HTTP checks, but disappeared during reference artifact validation with no terminal
record. `full-lost.log/.pid` preserves that evidence, not a full-gate PASS. A third run was
deliberately interrupted for the committed-source correction: `full-before-fetch.log/.exit`
records actual exit **130**, 1074.882s. `full-before-spool` records the supervisor failure
above; `full-before-diagnostics` records the deliberately interrupted diagnostic correction.
The next full run freezes the corrected
source/test/contract/script inputs and the actual corpus, runs in a
foreground session, and independently records `full.exit` plus `full-result.json`; its
terminal result and resident readback are recorded below.

Final qualification completed **2026-10-05**: `sh scripts/check.sh` exited **0 / 2914.137s**.
Fmt and all-target clippy passed; **93 Rust checks** (46 library, 17 Git, 30 supervisor),
**10003 canonical identity cases**, **136 compiled contract cases**, **108 Rust executable
HTTP scenarios**, **443 reference/common checks in 1448.660s**, and **7 large native
lifecycle checks in 266.106s** passed. Four existing SQLite ResourceWarnings were nonfatal;
there were no skipped or failed tests. The 165 source/test/contract/script inputs remained
identical before and after the gate, with canonical input-map SHA-256
`53d8c4e3452042abf950457e61cdaa5a7c726bc3ea94f3a75eda1bafd621865a`.
Qualified debug binary SHA-256 is
`1b57e555ba28002e556b4a4a861ad0b2df07850807351efb940c1b94f9a73ad8`.
Only documentation closeout changed after qualification.

| Final native lifecycle fixture | Source bytes (excluding two original 6-byte files) | Result / journey seconds |
|---|---:|---|
| Actual corpus, 190 files, ordinary 128 MiB working default | 37724943 | PASS / 18.656 |
| Single >=173 MiB file | 181403679 | PASS / 24.772 |
| Committed >=173 MiB source, validation/publication/managed-ref cleanup | 181403679 | PASS / 26.284 |
| 512 MiB aggregate, capture one-byte overflow/checkpoint preservation | 536870900 | PASS / 54.326 |
| Committed 512 MiB aggregate, same capture overflow/cleanup | 536870900 | PASS / 66.951 |
| 1024 files | 1024 | PASS / 4.508 |
| >=173 MiB artifact source input, validation/build/cleanup | 181403679 | PASS |

Maximum cumulative controller/utility child high-water mark across the final seven journeys
was **49696 KiB**. Rust and Python HTTP independently passed the actual corpus, >=173 MiB
uncommitted/committed files, exact 512 MiB aggregate and one-byte admission overflow.
Committed-file HTTP controller peaks were **26876 KiB Rust / 37236 KiB Python**.
Physical single-file, aggregate/count, 48 MiB metadata and 1 GiB binary transfer edge fixtures
also passed in the complete gate. Because the actual corpus is 37.7 decimal MB rather than
37.7 MiB, the existing generated-corpus scenario was separately run without the corpus override:
**190 files / 39690240 bytes / 37.85 MiB**, native full journey **26.068s**, one check
**27.698s**, controller/utility peak **41080 KiB**, PASS. Its log is
`generated-corpus-final.log`; final gate evidence is `full.log/.exit` and `full-result.json`.

Resident readback after qualification reports **0.1.25**, healthy controller/two tunnels,
active bundle `f1d10cf548ff2cbc1169db2ab239b3c772a0b8264e61ad8b31bffad777877ee7`.
The qualified 217-file source bundle preview is
`a0fcb16bae5215c4e03ad219d1cd67544e929f492b5a9e39605b6d48bfa517fe` (0.1.26).
Canonical maintenance readiness still rejects **OUTSTANDING_EFFECT**: pre-existing unknown
stdin control `9b2a9a574fea49a98a0b93cd1a6a127a` targets failed execution
`c5ededc2a5c043f9a6a543cfa76535ba`; absence of retained acceptance proof cannot establish
whether prior input was delivered. No stdin was resent, operation changed, service stopped,
bundle staged or resident activated. Canonical staging also writes service desired-state
files, so it is not used merely to prepare an inactive update while this guard is closed.
Historical unknown managed publication `2531fb0f9bbd4aa584865f62898e1010` retains the exact
complete SQL-row-array digest; config/settings digests and active bundle match the prior
snapshot. An initial readback helper compared a row dictionary to the prior row array and
failed its assertion; using the same canonical array encoding proves the row is unchanged.
Snapshots are `resident-before.json` and `resident-after.json` under the evidence prefix.
The live workingBytes setting remains 512 MiB; it is not silently raised. A 512 MiB source
plus its private Git objects requires a larger independent working budget, as qualified above.

## Sequenced input and task dependency leases — 2026-10-04

The independent supervisor now accepts bounded initial stdin followed by controls at sequence
zero, with no implicit EOF. A contiguous durable queue binds control identity/content; new
controls after EOF, gaps, identity conflicts, terminal or unknown workers are rejected. Stable
acceptance replay never writes the pipe. Unknown delivery is persisted before any bytes; only
complete nonblocking pipe acceptance and requested EOF closure can persist committed delivery.
Partial delivery, EPIPE and worker death retain unknown, not a retry opportunity or candidate
acknowledgement. Cached immutable reservation identity avoids rehashing a large initial payload
on every polling iteration. Unsupported internal spool format 1 is rejected without rewriting
existing files or dispatching; new reservations use format 2. SQLite schema 3 is unchanged.

Selected task dependencies use stable per-task lease files in a namespace separate from task
directories. Shared leases cover dispatch through descendant stop, final storage checks and
result persistence. Exclusive exclusion prevents dispatch without fallback; it does not by
itself authorize reset of logically running/unknown consumers. Worker death can release the
kernel lease while a child remains alive. Persistent pip/npm/XDG caches and venv/bin/bin tool
lookup are separate from source and per-job HOME/TMP/config; fresh jobs omit task dependencies.
Dependency storage has independent 2 GiB/100000-node preflight, five-second sampling and final
checks. Mutable dependency contents are not attested or automatically installed.

Focused actual-process checks passed **29 in 5.30s**, including 14 new checks for initial/input
ordering, lost acceptance acknowledgement, partial-write worker SIGKILL, blocked stdin with
output/deadline progress, concurrent controls, bounds/gaps/EOF, EPIPE/corrupt delivery evidence,
shared consumers/exclusive exclusion, retained tools/caches/private HOME, task IDs ending in
.lock, dependency preflight/fast-exit/live growth, lost-worker lease release with surviving child,
and unsupported/linked paths. These tests invoke the actual executable; sparse files exercise
the byte limit without allocating 2 GiB of data. Full affected Rust checks then passed **84**
(39 library + 16 Git + 29 supervisor), with the supervisor suite taking **6.97s**, after removing
repeated reservation hashing. Format/lint passed after correcting an unused mutability warning.

Final PATH review replaced string concatenation with checked PATH construction. A dependency
path containing the PATH separator now fails before child dispatch, without silently adding
tool lookup locations or allowing relaunch. The final affected Rust run passed **85**
(39 library + 16 Git + 30 supervisor), with the supervisor suite taking **5.35s**; format/lint
also passed. The earlier full run was deliberately interrupted for this change with independently
recorded exit **130**, not PASS. A subsequent run lost its process/session before the reference
suite completed and left no exit record; its log is retained as `full-lost.log`, not PASS.
The final full `sh scripts/check.sh` ran independently of the interactive session and completed
with a durable exit record of **0**. Format/lint/locked build, **85 Rust checks**, **10,003
identity comparisons**, **136 compiled contract comparisons**, **105 native HTTP checks**
(51 common + 54 boundary/recovery in **593.337s**) and **429 reference/common regressions in
1246.083s** passed. The full gate's supervisor suite took **6.22s**. Four existing reference
SQLite ResourceWarnings remained visible; there was no failing or skipped suite.
Logs are retained under `$PREFIX/tmp` as `tdev-input-lease-{focused,rust,rust-final,
full-interrupted,full-lost,full}.log`; interrupted and final full runs independently record `.exit`.
This qualifies execution primitives, not public command/process admission or the P3 exit gate.
Owned source materialization/capture, SQLite operation/control reconciliation and guarded
reset intent/recovery are next. Execution remains unadvertised on the implemented HTTP surface;
no production runtime/provider cutover or main integration occurred.

## Independent supervisor and durable spool — 2026-10-04

P3 has started with the executable's independent `supervise` process role and private durable
spool. Canonical input identity freezes command/cwd/deadline/working budget and shell/tool
location. Reservation, dispatch and worker claim precede effects; existing/partial fences
never authorize relaunch. PID/start/boot identity gates live observation and exact descendant
signals. The worker owns a separate session, subreaping, SIGCHLD/reaping and no-new-privileges.
Candidates receive private fresh HOME/TMP/XDG directories and a clean environment, not
controller/provider secrets. Metadata reads reject links/special files and bound record size.
Output is continuously drained, retains at most 1 MiB and records discarded bytes; stdout
cannot supply a receipt. CPU/file-size/fd/core limits and sampled working storage apply during
execution. Deadline/cancellation stop descendants; final storage checks and log fsync follow
stop proof and precede bound result persistence.
Missing worker, malformed/unbound result or incomplete stop proof remains unknown.

The actual executable passed **15 process integration checks**: launcher SIGKILL with continued
one-effect execution, supervisor SIGKILL with surviving descendants and no relaunch, ordinary
exit/cancel of double forks, simultaneous launch, dispatch/claim gaps, input conflicts,
private environment/no-new-privileges, output flooding, file/storage limits, removed cwd,
stale start/boot identity, early cancellation and forged/corrupt terminal evidence.
Python only manufactures double-fork fixtures; no reference controller/worker completes these
executions. The initial full run was deliberately interrupted after stop-proof review with
recorded exit **143**, not PASS. The revised stop proof requires both a descendant scan and
waitpid ECHILD, covering reparenting during the scan. One subsequent parallel cancel fixture
timed out; isolated and ten repeated 15-check rounds passed, without identifying that original
timeout's exact cause. Bounded error-kind/errno diagnostics now retain failures without raw
command/provider text. Proc disappearance handles ENOENT/ESRCH while permission/read failures
stay uncertain, following the [Linux procfs documentation](https://www.kernel.org/doc/html/latest/filesystems/proc.html).
Final affected Rust checks passed **70** (39 library + 16 Git + 15 supervisor); the final
supervisor run took **1.45s** and additionally exercised unrelated process churn.

The final full `sh scripts/check.sh` completed with independently recorded exit status **0**:
format/lint/locked build, **70 Rust checks**, **10,003 identity comparisons**, **136 compiled
contract comparisons**, **105 native HTTP checks** (51 common + 54 boundary/recovery in
497.255s) and **429 reference/common regressions in 1217.704s** passed. The full gate's
supervisor checks took **1.53s**. Existing reference SQLite ResourceWarnings remained visible;
there was no failing or skipped suite. These are regression/primitive qualification counts,
not complete public native execution, validation/publication or artifact/deployment coverage.
Logs live under `$PREFIX/tmp` as `tdev-supervisor-{rust-affected,rust-final,rust-final-2,
diagnostic,stress,full-interrupted,full-lost,full}.log`; the interrupted and final full runs retain
independent `.exit` files.

This qualifies an execution primitive, not public execution admission or the P3 exit gate.
Sequenced stdin, task dependency leases, owned source materialization/capture, SQLite operation
reconciliation and validation/publication remain next P3 work. The HTTP tool list still omits
execution; stdin is closed and this primitive uses fresh private directories. No SQLite format
revision, main integration or production runtime/provider cutover occurred.

## GitHub delegated enrollment and controller provider boundary — 2026-10-04

P2 now implements delegated GitHub connect/private initialized create and current policy
discovery/inspection. Controller-owned bounded gh/Git utilities use fixed github.com and the
configured owner; personal creation checks the authenticated login first. Repository ID and
canonical name/URL checks reject same-name replacements and scope expansion. Explicit HTTP
rejection before any returned ID can fail with effect=none; response loss/malformed success
stays unknown. Returned IDs are persisted before later reads or atomic enrollment/receipt commit.
Replay without a retained ID does no provider lookup or POST; independent connect cannot finish
that creation. Policy/identity/visibility gates ID-backed recovery under current settings.
Per-operation gates protect active provider workers without holding SQLite over external waits.

Controller token/config environment and ephemeral credential helper enter provider/transport
utilities only. Private Git commands, retained config and receipts receive no token/helper or
provider diagnostics. Source work uses the shared Git/source paths. New private stores infer
format from advertised scoped OIDs; retained work survives removal of its canonical base refs.
GitHub cleanup uses the existing ownership journal/task fence with explicit exact-OID
force-with-lease. Actual death before/after deletion and a racing branch retain
or finish only the original receipt without repeating push. Deletion fixtures seed retained
publication facts offline and do not qualify P3 publication.

Focused executable checks passed **5 reference in 34.671s** and **15 native/common in 97.386s**,
both with ResourceWarning treated as an error and no such warnings in their logs. Fixtures use
synthetic provider executables, controller HTTP, explicitly closed SQLite connections and real
disposable Git transport; no real GitHub repository/account/credential was changed. The initial
native focused run exposed remaining local-only source admission gates; these were replaced by
validated enrolled transport before the passing reruns. Provider identity/status parsing and
the observation-versus-creation effect invariant passed Rust checks. Format/lint/locked build
passed after correcting an unused method and test-module placement reported by lint.
Installed CLI version is **gh 2.98.0**. Its
[versioned API implementation](https://github.com/cli/cli/blob/v2.98.0/pkg/cmd/api/api.go)
was inspected read-only: include emits status/headers before HTTP-error handling, and stdin
is the POST body. This verifies fixture interface assumptions, not live provider access.
Affected local project/source/start/import checks passed **26 in 140.206s**, with independently
recorded exit status **0**. The earlier affected run failed one fixture startup with OS EPERM
before any tool admission; its final rerun passed all 26 without masking that failure.

The final full `sh scripts/check.sh` completed with independently recorded exit status **0**:
format/lint/locked build, **55 Rust checks** (39 library + 16 Git), **10,003 identity comparisons**,
**136 compiled contract comparisons**, **105 native HTTP checks** (9 source + 4 project +
5 GitHub + 6 start + 7 import + 10 integration + 5 cleanup + 5 predecessor + 54 native
boundary/recovery) and **429 reference/common regressions in 1205.278s** passed. The 54 native
boundary/recovery checks took 554.957s. Existing reference SQLite ResourceWarnings remained
visible; no failing or skipped suite was reported. These counts qualify the P2 local/provider
gate, which is now complete, and do not claim native execution/artifact/deployment coverage.
Logs live under `$PREFIX/tmp` as `tdev-github-{reference-focused,reference-final,native-focused,
native-rerun,native-final,native-complete,rust-affected,affected,affected-final,full}.log`.
Live GitHub authentication/TLS remains a host/provider qualification obligation, distinct from
these isolated adapter checks. No storage revision, main integration or production runtime/provider
cutover occurred. Execution/publication and the P3–P6 delivery gates remain open.

## Published predecessor continuation — 2026-10-04

P2 start now accepts fromTaskId through the canonical contract. It creates independent work
from an owned managed task's retained publication OID/source/namespace, including after close,
workspace detachment or branch cleanup. Current project/branch defaults and remote HEAD cannot
replace that base. expectedHead compares with the retained publication. Destination membership
and publication facts are reread atomically with unique new task/ref reservation; no predecessor
writer is held. Later predecessor edits/publication/cleanup cannot retarget accepted construction.
Retained private evidence must be a commit; missing/noncommit objects fail without remote fetch
fallback. Actual controller death after private pin retains INTERRUPTED/none and original
identity, without constructing a partial task or repeating work on replay. Current predecessor
and resolved scope gate original receipts even after later source advancement or restart.

The common scenarios seed retained publication facts offline from actual private edit commits;
the fixture adapters transfer those objects to the disposable remote and locate each executable's
retained Git store. Assertions use real HTTP/canonical output validation without domain imports.
These fixtures do not qualify P3 publication admission/validation. The target additionally rejects
reserved ref state with a publication OID as unproved, rather than treating any OID as publication.
Focused checks passed **5 reference in 38.056s**, **10 native/common in 103.551s**,
**1 publication reservation invariant in 0.17s**, **1 real Git invariant in 5.13s** and
**1 action inventory in 0.077s**. Format/lint/locked build passed. Initial fixture failures
exposed missing private-to-remote object transfer; its adapter was corrected before the passing
rerun. A test-only Debug bound compile error was corrected before the passing invariant runs.
Affected start/import/cleanup and managed admission/import recovery checks passed **30 in
296.021s**, with independently recorded exit status **0**. The first full `sh scripts/check.sh`
passed with exit status **0**, including 52 Rust, 90 native HTTP and 424 reference/common checks
(1272.253s). Its log exposed unclosed SQLite connections in the new test fixture adapters.
Both offline writes and read-only intent reads now close their connections explicitly. Final
focused reruns passed **5 reference in 24.081s** and **10 native/common in 98.805s**, both with
ResourceWarning treated as an error and no such warnings in their logs. The final full rerun
completed with independently recorded exit status **0**: format/lint/locked build, **52 Rust
checks** (36 library + 16 Git), **10,003 identity comparisons**, **136 compiled contract
comparisons**, **90 native HTTP checks** (9 source + 4 project + 6 start + 7 import +
10 integration + 5 cleanup + 5 predecessor + 44 native boundary/recovery) and **424
reference/common regressions in 1563.000s** passed. Existing acceptance SQLite ResourceWarnings
remained visible; no failing or skipped suite was reported. These results qualify this increment,
not the remaining full delivery.
Logs live under `$PREFIX/tmp` as `tdev-predecessor-{reference-focused,reference-rerun,
reference-final,native-focused,native-final,affected,full,full-rerun}.log`. Durations are test
evidence, not a controlled performance comparison. P2 GitHub enrollment, P3–P6 and full state
qualification remain open. No schema/storage
revision, main integration or production runtime/provider cutover occurred.

## Owned local ref cleanup and deletion uncertainty — 2026-10-04

P2 now serves task cleanup and current refCleanup inspection. Admission reserves only the
owned task writer, rereads source/publication facts and allows retained cleanup after task or
workspace close and project detachment. Current repository/source/namespace authority still
gates admission, replay and operation access. Empty managed branches close/retire atomically
without a Git mutation. Foreign, unmanaged, changed, symbolic and checked-out branches are
preserved. A real deletion requires the exact recorded publication OID and uses no-dereference
old-OID CAS, with current enrolled identity and worktree checks outside the SQLite lock.

Before dispatch, the separate cleanup intent retains the exact old OID and marks effect/status
unknown. Active per-operation gates prevent premature completion from temporary absence without
blocking unrelated tasks. Actual SIGKILL before dispatch leaves no deletion; after dispatch,
replay/status/inspect observe the original request and never repeat it. Existing refs and failed
observation keep uncertainty and the task fence; absence can finish only its cleanup receipt,
never an uncertain publication. Deletion followed by SQLite completion failure reports unknown
with the original operation ID. Terminal replay preserves recreated refs. Source checkpoint,
published OID, files/index/untracked content and canonical refs remain retained.

The native deletion scenarios seed retained publication facts offline in disposable fixtures;
they do not claim P3 publication admission/validation or a complete start→publish→cleanup path.
Common empty-ref behavior runs independently against both executables with canonical output
validation. Focused checks passed **5 reference in 27.668s**, **14 native/common boundary in
147.528s**, **1 storage invariant in 0.04s** and **1 real Git invariant in 3.76s**. Format/lint/
locked build and action inventory checks passed. An earlier native focused run had one isolated
fixture server startup EPERM before any tool request; the final rerun passed all 14. Initial
common-test field/error-code expectations were corrected against actual wire responses.
Affected HTTP checks passed **80 in 776.837s**. The final `sh scripts/check.sh` completed
with independently recorded exit status **0**: format/lint/locked build, **50 Rust checks**
(35 library + 15 Git), **10,003 identity comparisons**, **136 compiled contract comparisons**,
**80 native HTTP checks** (9 source + 4 project + 6 start + 7 import + 10 integration +
5 cleanup + 39 native boundary/recovery) and **419 reference/common regressions in 1293.976s**
passed. Existing reference SQLite ResourceWarnings remained visible; no failing or skipped
suite was reported. These results qualify this increment, not the remaining full delivery.
Logs live under `$PREFIX/tmp` as `tdev-cleanup-{reference-focused,reference-rerun,reference-final,
native-focused,native-rerun,native-final,affected,full}.log`. Durations are test evidence, not a
controlled performance comparison. P2 published-task continuation and GitHub enrollment,
P3–P6 and full state qualification remain open. No schema/storage revision, main integration
or production runtime/provider cutover occurred.

## Source composition and frozen delta integration — 2026-10-04

P2 now serves task compose/integrate through authenticated native HTTP. Composition combines
compatible base-to-checkpoint deltas on one enrolled project/ref. Declared source pointers are
checked before construction and again inside atomic task/receipt completion; a concurrent
advance fails without a partial task. Integration checks selected-source ancestry outside
storage, rechecks the observed source pointer at admission, and freezes the selected version.
Only the target writer is reserved; independent source edits remain available after admission.
These pointer checks and current source authority on composition replay deliberately strengthen
the reference boundaries. Completed replay retains the original result after source advancement.

Clean text changes use bounded private Git merge-file utilities without user attributes/drivers
or hooks. Binary, link/type, add/add, delete/modify and file/directory conflicts need explicit
resolution. Unresolved integration succeeds with applied=false, the original checkpoint and
sorted conflict details capped at 50, with the total/truncation recorded. No partial edits or
markers reach the target. Complete resolutions produce a single-parent target commit; source
lineage is retained in the receipt. Source, public refs, checkout files and index stay unchanged.

Actual SIGKILL after either private Git pin retains INTERRUPTED/none, releases the target writer
where applicable and never repeats construction on replay. Deterministic barriers qualify source
changes before/after admission, grant revocation during construction, composition completion
recheck, unrelated workspace availability and utility failure. A concurrent duplicate test fixes
the requirement to drop the storage guard before nested replay after duplicate admission.

Focused common checks passed **10 reference in 46.429s** and the native common/boundary rerun
passed **16 in 202.315s**. The added deterministic duplicate-admission replay passed **1 in
17.205s**; the source snapshot/replay storage invariant passed **1 in 0.07s**, and the SHA-256
single-parent/public-ref Git fixture passed **1 in 1.98s**. Format/lint/locked build and the
action inventory check passed. The affected native HTTP rerun passed **66 in 388.087s**.
After the fixture budget correction below, focused import checks passed **7 in 67.618s**,
lost-reply proxy checks passed **2 in 17.287s**, and the final affected native boundary group
passed **30 in 214.377s**. The final `sh scripts/check.sh` completed with independently
recorded exit status **0**: format/lint/locked build, **48 Rust checks** (34 library + 14 Git),
**10,003 identity comparisons**, **136 compiled contract comparisons**, **66 native HTTP checks**
(9 source + 4 project + 6 start + 7 import + 10 integration + 30 native boundary/recovery) and
**414 reference/common regressions in 1006.115s** passed. Existing reference ResourceWarnings
remained visible; no failing or skipped suite was reported.

The first affected pass ran 66 checks in 514.988s with one existing import-pin barrier timeout
at 8s; its isolated rerun passed in 17.513s. A 12s pin wait allowed the affected rerun to pass,
but the first full check exited 1 after four import scan/pin barrier timeouts (30 native boundary
checks in 318.135s). Diagnostic discovery reproduced active requests with only the first scan
reached at the old deadline, rather than a failed source result. The import fixture now has a
45s HTTP budget and a 30s gap-arrival bound; a request ending before the gap reports its actual
response, and absent barriers no longer add misleading completion-marker failures. Other
fixture request budgets keep their 15s default. Product timeouts and recovery rules did not
change. The final focused import, affected boundary-group and full results above include this fix.
Logs live under `$PREFIX/tmp` as `tdev-integration-{reference-rerun,native-rerun,
duplicate-focused,import-pin,import-diagnostic,native-diagnostic,import-budget,proxy-rerun,
affected,affected-rerun,boundary-rerun,full,full-rerun}.log`. These durations are test evidence,
not a controlled performance comparison. P2 still needs owned-ref cleanup, published-task continuation and
GitHub enrollment; P3–P6 remain open. No main integration, schema/storage revision or
production runtime/provider cutover occurred.

## Local checkout import and private capture recovery — 2026-10-04

P2 start now accepts localChanges=true for an enrolled working checkout. Admission retains its
checkout path/identity with source branch/base and reserved task/ref identity. Two matching scans
verify directory/common-Git identity, checked-out branch/HEAD, index-based selection, final bytes
and file metadata. Tracked paths remain selected when ignored; nonignored untracked paths join
them and consistently missing tracked files become deletions. Staged and unstaged contents are
not separate versions. Executable bits and safe relative links are preserved.

Each parent is opened relative to an owned directory descriptor without following links. Regular
files are opened without following links or blocking on FIFOs, checked before/after the bounded
read and compared with the selected leaf again. Limits are 100,000 selected paths, 16 MiB per
regular file and 32 MiB captured bytes. Unmerged/skip-worktree/gitlink index states, unsafe links,
special files and linked parent directories fail without a task or public ref change. No user
index refresh/write, hook, clean filter, fsmonitor, checkout write or ref write is performed.
Unchanged capture keeps the admitted base checkpoint. Import metadata and task/terminal receipt
commit together. The scans detect observed races; this is not an atomic filesystem snapshot.

Implicit and explicit start replay retain captured contents rather than rescanning. Current
checkout config binding, repository/source/namespace grants still gate receipt access. Actual
controller SIGKILL after the changed import commit's private Git pin yields INTERRUPTED/none,
retains original intent/reservations and creates no partial task; a distinct fresh request may
capture newer contents. Unrelated workspace work stays available during utility barriers.
Detached HEAD now returns CHECKOUT_HEAD_CHANGED instead of the reference's generic COMMAND_FAILED;
link targets reject trailing-space/dot Git metadata aliases as source paths already do. These
explicit corrections and current checkout-binding replay checks are not unrestricted parity.

Focused common checks passed **7 reference in 32.200s** and the initial native pass **7 in
50.998s**. Format/lint/locked build and **4 storage source invariants in 0.09s** passed after the
descriptor-walk simplification. The final native import boundary rerun passed **7 in 67.880s**;
implicit-project lost-reply/default-change replay passed **1 reference in 2.287s** and **1 native
in 5.099s**. The final `sh scripts/check.sh` completed with independently recorded exit
status **0**: format/lint/locked build, **46 Rust checks** (33 library + 13 Git),
**10,003 identity comparisons**, **136 compiled contract comparisons**, **49 native HTTP checks**
(9 source + 4 project + 6 start + 7 import + 23 native boundary/recovery) and **404 reference/common
regressions in 893.553s** passed. Existing reference SQLite ResourceWarnings remained visible;
no failing or skipped test suite was reported. These durations are test evidence, not a controlled
performance comparison. Logs live under `$PREFIX/tmp` as
`tdev-import-{reference-focused,reference-rerun,native-focused,native-recovery,native-rerun,
reference-implicit,native-implicit,affected,full}.log`.
P2 still needs composition/integration/cleanup, published-task continuation
and GitHub enrollment; P3–P6 qualification remains open. No main integration, schema/storage
revision or production runtime/provider cutover occurred.

## Managed task start and frozen source reservation — 2026-10-03

P2 now serves remote-base `task start`: explicit project/source selection, principal or explicit
workspace defaults, and sole authorized project/ref selection. Ambiguity requires caller choice.
Current exact source grants and the intersection of managed namespaces gate admission. Unique
task/ref identity, resolved project/source/ref/namespace/base and repository identity are frozen
with workspace binding before fetch. Start writes no remote branch or user checkout/index/files.
Managed task and terminal receipt commit together; completion checks the frozen identity.
Failed/interrupted reservations remain in retained operation rows, so branch names are not reused.

Implicit-input replay checks original resolved scope before any new selection/HEAD lookup; current
default changes cannot retarget an old request. Revoked namespaces/repository/source grants block
both pending and completed receipt access. Workspace selection is reread in the reservation
transaction: a default/sole member change during Git observation cannot commit the stale choice.
Pending implicit-project starts block workspace close/detach using the resolved project binding.
Actual SIGKILL after Git pin retains frozen identity, fails private construction with
INTERRUPTED/effect=none, clears pending composition use and creates no replacement task.
Actual HEAD advancement after admission fails STALE_HEAD; it does not silently choose the new
base. A foreign branch appearing at the reserved name is preserved and never adopted.

Discovery/input validation share the narrowed canonical schema: start accepts localChanges
omitted/false. Local import and fromTaskId remain rejected before durable admission, pending
their own source-selection/publication proofs. Task composition/integration/cleanup, GitHub
enrollment and the other P3–P6 surfaces are still unfinished. No schema revision, provider/resident
cutover or main integration occurred. Freezing IDs before fetch and rechecking workspace
selection strengthen reference allocation/race behavior; they are not full crash-window parity.

Focused common tests passed **5 reference in 14.626s** and **5 native in 23.377s**. The added
SHA-256 common case passed **1 reference in 6.790s**. Initial native discovery/pin-gap/HEAD
advancement checks passed **3 in 38.230s**. Storage selection/atomic managed completion/retained
reservation and prior recovery-owner checks passed **3 in 0.13s**; format/lint/locked build
also passed. Affected native HTTP checks passed **34 in 236.550s**; the added foreign-branch
race passed **1 in 17.971s**. The final `sh scripts/check.sh` completed with recorded exit
status **0**: format/lint/locked build, **45 Rust checks** (32 library + 13 Git),
**10,003 identity comparisons**, **136 compiled contract comparisons**, **35 native HTTP checks**
(9 source + 4 project + 6 start + 16 native boundary/recovery) and **397 reference/common
regressions in 1632.452s** passed. Existing reference ResourceWarnings remained visible in the
log; no test failure or skipped suite was reported.
Logs live under `$PREFIX/tmp` as
`tdev-start-{reference-focused,native-focused,reference-sha256,native-recovery,foreign-focused,affected,full}.log`.

## Delegated local project enrollment — 2026-10-02

P2 now connects and creates local projects through the actual authenticated `tdev` executable.
Discovery still exposes six implemented tool families; project now has list/inspect/connect/
create. Only supported local policies are offered. GitHub connect/create fails before durable
admission or provider dispatch. Caller-supplied executable policy fails Schema validation.
Static enrollment remains available. No resident/provider cutover or main integration occurred.

Owned project rows retain resource identity/location and the accepted scope digest, separately
from current policy-derived grants and execution settings. Each request loads a fresh immutable
authority view and owned rows, then releases storage before any Git/filesystem observation.
Revoking/changing scope gates receipt replay and retained source tasks; current execution budget
and namespaces change the current project projection without rewriting prior receipt results.
Linked-worktree/common-directory and checkout identities reject alternative-checkout rebinding
and same-name repository replacement. SQLite enrollment and terminal receipt commit together;
failed collision or wrong-owner completion rolls back, and late uncertainty cannot regress a
terminal receipt.

Creation records uncertainty before exclusive mkdir, initializes an empty-template repository
and README commit, records exact Git/checkout identity and initial HEAD, then writes/syncs the
original operation marker. Reconciliation never runs init/commit again. Active controller gates
prevent premature reconciliation. After actual SIGKILL, completed proof allows only original
enrollment; absent proof and copied-marker/replaced-directory cases stay unknown. Recovery
honors current scope even when create permission is subsequently removed. An independent
explicit connect can enroll an unproved creation without clearing its original uncertainty.
This strengthens the reference's early marker; it is not a claim of crash-window parity.
Actual controller death is qualified, not power loss or isolation from hostile same-UID code.

Focused common project checks passed **4 reference tests in 7.869s** and **4 native tests in
12.278s**. The first reference run failed a harness keyword (`token` instead of the supported
authorization header); its retained log is not a pass. Initial actual creation-gap checks passed
**3 native tests in 11.970s**. Formatting/lint and the existing **41 Rust tests** passed; the two
added storage atomicity/ownership tests passed **2 in 0.09s**. The affected native HTTP pass
ran **23 tests in 120.061s**, including supported-provider admission rejection; the additional
changed-HEAD proof check passed **1 in 5.883s**. The complete `sh scripts/check.sh` log records
formatting/lint/locked build, **43 Rust tests** (30 library + 13 real Git), **10,003 identity
comparisons**, **136 contract comparisons**, **24 native HTTP tests** (9 source in 28.014s,
4 project in 11.463s, 11 edge/recovery in 74.501s), and **391 reference/common regression
tests in 1163.784s**, all passing. The previous execution session was no longer addressable
after resume, so its shell exit code is not independently recorded. The script's final
`git diff --check` was rerun separately and passed; no unexecuted gate is counted as passing.

Logs are private temporary evidence under `$PREFIX/tmp`:
`tdev-project-{reference-focused,reference-rerun,native-focused,native-recovery,affected,head-focused,full}.log`.
P2 remains open for managed task start/composition/integration/cleanup, local import and the
remaining GitHub enrollment boundary. Full state/operator/performance and P3–P6 qualification
remain later work; these local tests do not qualify the complete product surface.

## Authenticated local source implementation — 2026-10-02

P2 now has a serving `tdev serve` executable on Termux. The disposable acceptance launch
uses explicit state/config paths, a loopback port and diagnostics off. The implementation
does not call the reference controller or a Python helper. Discovery derives six narrowed
tool families from the canonical contract: workspace composition, task list/open/inspect/
close, every read/edit action, enrolled project list/inspect and source/workspace operation
status. Unsupported actions fail Schema validation; unsupported receipt kinds fail closed
until their authority owner is connected. Delegated enrollment and managed source lifecycle
remain open P2 work. No resident/provider cutover or main integration was performed.

Selected libraries: axum **0.8.8** with HTTP1/Tokio only, Tokio **1.52.3** with two async
workers/eight blocking workers, UUID **1.23.1** for opaque identities, base64 **0.22.1** for
wire payloads, futures-core **0.3.34** for bounded SSE streaming and memchr **2.8.3** for
byte search. Existing SQLite, Git, identity and Schema owners remain unchanged. Cargo.lock
pins the graph and the on-device build confirms the target APIs; see the
[axum API](https://docs.rs/axum/0.8.8/axum/). Eight admission permits stay with construction
workers through completion, including after caller disconnect. No provider wait occurs
under a store mutex or SQL transaction. Body/config bytes are bounded; P5 performance,
HTTP connection saturation and operational service qualification remain separate work.

Each admission uses a freshly read private config and immutable authority view. Repository
membership never grants access; replay checks current ownership, grants and configured
identity before returning the original receipt. Task reservation/CAS, private Git construction,
and atomic pointer/terminal receipt are distinct boundaries. SIGKILL after an actual object
pin leaves the previous source pointer, releases the owned busy slot on restart and retains
an INTERRUPTED/effect=none receipt; a new request can continue. Recovery leaves unknown effects,
execution and other intent roles untouched. A provider read refreshes source state afterwards,
so missed completion can become useful work immediately. Deterministic temporary utility
wrappers provide barriers; the product binary has no fault switches.

Raw HTTP fixtures distinguish integral Schema floats from RPC IDs, materialize finite IEEE
floats before Schema validation, preserve original integer/float request identity, and round
trip unbounded offsets. New ingress explicitly requires scalar Unicode and at most 128
nested containers/4,300 integer digits; this tightens noninteroperable reference input handling.
Legacy identity vectors including unpaired surrogates remain unchanged. The secondary decoder
uses the explicit ingress depth policy instead of its own accidental limit. No claim of full
raw-wire parity or whole-state transition qualification is made.

Focused evidence: the first new common-source runs failed one fixture with a noncanonical
credential ID; both logs retain that failure. Corrected reference rerun passed **9 tests in
25.933s**. The initial native source/edge pass ran **14 tests in 69.996s**; the added blocked-
remote completion and workspace guard checks passed **2 in 15.137s**. The final batch/workspace
focused pass ran **2 in 8.581s**; inventory/workspace reference checks ran **2 in 2.803s**.
Native unit/Git checks passed **40 tests** before the unsupported-receipt authority fix;
that fix passed its focused test separately. Combined final results follow below.
Logs are under `$PREFIX/tmp/`: `tdev-source-{native-focused,reference-focused,native-rerun,
reference-rerun,native-final-focused,reference-final-focused,native-transitions,native-unit,
authority-focused}.log`. Direct script execution initially returned permission denied
(exit126; no checks ran), since the tracked script is not executable. The actual combined
command is `sh scripts/check.sh`; its logs are retained separately from that invocation.

Both actual combined commands completed with **exit0**. The earlier run passed 40 native
unit/Git tests, 15 native HTTP scenarios and **387 reference/common tests in 1243.074s**.
After the unsupported-receipt authority fix, the final combined run passed **41 native
tests** (28 library, 2.70s; 13 Git, 11.20s), **15 native HTTP scenarios** (9 common source,
41.488s; 6 edge/crash cases, 36.750s), **10,003 identity cases**, **136 compiled contract
comparisons**, and **387 reference/common tests in 1276.382s**. Formatting, warnings-denied
all-target clippy, locked build, version command and whitespace checks passed. The added
beyond-EOF list/search and wide integral-float assertions passed separately on the same
final binary: **1 test in 5.068s**, `tdev-source-offset-final.log`. These correct incidental
reference paging/slice errors while preserving request identity. The native source code
did not change after the final combined run started.

Combined logs: `tdev-source-full-rerun.log` and `tdev-source-full-final.log`. The two runs
overlapped on this device; elapsed times are test evidence, not a performance comparison.
Reference fixtures emitted ResourceWarnings about SQLite/pipe cleanup; no warnings were
suppressed or counted as skipped tests. P5 resource/latency measurement and full lifecycle/
state-format/host qualification remain open.


## Local Git and materialized contract implementation — 2026-10-02

The next P2 increment implements `git` and `contract` in the canonical library. The binary
still exposes version/help only; authenticated HTTP, current-authority snapshots,
workspace/project/source admission and the Git-before-SQLite-CAS crash boundary remain open.
No resident/provider update, state format change or main integration was performed.

Local Git uses the installed **Git 2.55.0** on Termux, distinct blob/tree/checkpoint types,
configured directory inode identity, fresh identity checks around source fetch, initialized
private-store publication, SHA-1/SHA-256, private temporary indices and object pins. Fetch
does not write shared FETCH_HEAD. Whole batches validate duplicate/touched paths, blob CAS,
replace occurrence counts and file/directory collisions before writing new objects.
Modes/binary/symlink blobs retain exact bytes; no-op capture retains the source checkpoint,
while real A→B→A changes retain a distinct commit. Reads, literal-path diffs and history use
Git objects without altering the user's checkout/index/ref. Hooks, filters/textconv and
replace refs cannot reinterpret these construction/read paths. Invalid UTF-8 replacement
has an explicit internal `SOURCE_ENCODING` fault; its public feature projection is not yet
qualified. GitHub transport, publication and checkout/capture selection retain their feature
owners. Review separated the existing 32 MiB total capture budget from the 16 MiB bounded
blob-read budget; a large captured blob remains retained even when that read is rejected.
Replacement expansion is checked before allocating the result, so a bounded input/count
cannot force a multi-gigabyte allocation. Both cases have actual Git regression fixtures.
See the selected [Git fetch](https://git-scm.com/docs/git-fetch),
[index](https://git-scm.com/docs/git-update-index) and
[fsync/ref-lock configuration](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corefsync).

The Git utility adapter concurrently feeds/drains nonblocking pipes with an aggregate 48 MiB
output limit, a 30-second ordinary or 120-second fetch deadline and an owned process group.
Timeout/overflow/error closes pipes, kills that group and waits for its direct child.
The leader is not reaped before pipe closure, preventing cleanup from targeting a reusable PID.
This is bounded utility ownership, not P3's detached supervisor or arbitrary-descendant stop
proof. The initialized store's files/directories are synced before same-parent rename;
objects/packs/metadata/refs use Git fsync, and references use a bounded 5-second lock wait.
Process-level fixtures do not prove device power-loss behavior or a hardware durability bound.

`jsonschema 0.58.4`, pinned with defaults disabled and arbitrary-precision enabled, compiles
the existing Schema 2020-12 input/output/config documents. External network/file reference
retrieval is explicitly rejected. No derived schema owner, successful handler stub or public
tool advertisement was introduced. Normalized inputs/defaults are not substituted for request
identity. Integer numeric forms, absent/null/envelope alternatives, Unicode character bounds
and arbitrarily large nonnegative offsets are exercised. Raw byte decoding, finite-float
materialization/typed conversion and surrogate/depth policy remain HTTP-edge work; these
materialized checks cannot establish them. See the [validator API](https://docs.rs/jsonschema/0.58.4/jsonschema/).

Focused/affected reference checks (`test_core test_source test_contract test_surface`) passed
26 tests in 69.800s. The first combined `scripts/check.sh` run passed 36 native tests,
10,003 identity cases and 136 compiled contract comparisons, then ran 378 reference/common
tests in 546.681s with one failure: an acceptance controller's temporary localhost bind
returned EPERM during fixture setup. That full run is **not PASS**. The same bounded-wait/SSE
test passed separately (1 test, 3.279s) with an escalated command; no product change, test skip
or retry loop was used to turn it green. The combined rerun completed with **exit0**:
378 reference/common tests passed in 913.154s, including the actual HTTP/process scenarios.
Its native phase had 36 tests; the final 38-test native pass after the budget review is
recorded separately below. Both combined passes included 10,003 identity cases and 136
compiled contract comparisons; the failed first run is retained as failed evidence above.

After the capture/expansion review fixes, the final native pass ran **38 tests**: 25 library
tests (2.32s) and 13 actual Git scenarios (12.73s), all passed. Formatting, all-target
warnings-denied clippy, locked build, `--version` (`tdev 0.1.25`), whitespace and the 10,003
identity/136 contract comparisons passed on this code. The preceding reference tests are
unchanged by these Git-library fixes. Local file targets in the changed Markdown documents
were checked. Logs: `$PREFIX/tmp/tdev-git-contract-{focused,full,http-rerun,full-rerun}.log`,
`tdev-git-budget-focused.log` and `tdev-git-contract-native-final.log` in the same directory.

## Initial package, identity and storage implementation — 2026-10-02

P2 has started. One `tdev` Cargo package, library and command build on the actual
`aarch64-linux-android` Termux target with rustc/cargo 1.98.0. The current command implements
version/help only; no HTTP source slice or production replacement is claimed. Product version
ownership moved once to Cargo package metadata, and the reference executable derives it.
Inactive bundles include the manifest, proved by importing the staged package after deleting
its source checkout. Existing pinned bundles retain their original declared runtime files.

Implemented: distinct validated IDs/OIDs/digests/paths/refs; independent status/effect enums;
checked persisted operation decoding; canonical identity decoding/encoding and SHA-256;
one SQLite owner with WAL/FULL, replay-before-reservation, atomic admission/reservation and
completion/pointer callbacks, rollback, and terminal monotonicity. SQLite is linked to the
device's existing 3.53.4 library through rusqlite 0.40.2, without a bundled second SQLite.
serde/serde_json are used for ordinary typed records, ryu for shortest float digits and sha2
for hashes. The lockfile pins the dependency graph; rust-toolchain.toml records the installed
toolchain. Termux's source-built binaries are used directly, without installing rustup.
See the [rusqlite API](https://docs.rs/rusqlite/0.40.2/rusqlite/) and
[File locking API](https://doc.rust-lang.org/std/fs/struct.File.html) for the selected boundaries.

The identity representation preserves Unicode code-point key ordering, paired/unpaired
surrogates, arbitrary decimal integers, integer versus floating forms, signed floating zero
and Python-compatible exponent/fixed notation. Normal serde JSON serialization is not used
for fingerprints. The same ten static byte/hash vectors pass; `scripts/check_identity.py`
compares the compiled test executable with 10,003 fixed/deterministic numeric cases. This is
sampled compatibility evidence, not a proof over every possible floating value.

`cargo test --locked`: 15 tests, all passed (0.91s in the recorded run). They exercise real
SQLite files, failed reservation/completion rollback, restart/replay, principal scope,
terminal-write refusal, unsafe state paths, unsupported/corrupt state byte preservation and
read/write interoperability with the reference storage owner for schema versions 3/4/5.
Full artifact/deployment/entity state-transition compatibility remains P5 work. The initial
two reopen tests failed under concurrent reference-process spawning: inherited lock file
descriptors could briefly retain a lock after closing the controller's descriptor. Explicit
Drop now closes SQLite first and then unlocks the file description. The corrected tests and
cross-process lock exclusion pass. No retry was added to hide a second owner.

`cargo clippy --locked --all-targets -- -D warnings` passed after moving the test module below
implementation items. `cargo fmt` was applied. The affected reference suite
`test_admin test_resident test_contract acceptance.test_inventory test_identity` passed
30 tests in 61.599s. Earlier executable-focused evidence remains applicable to the baseline;
the final combined `scripts/check.sh` result is recorded after completion below.

Next P2 work: Git plumbing, Schema 2020-12 validation, authenticated HTTP, workspace/project
admission and the open/read/atomic-edit/inspect/replay/CAS/restart vertical slice. The identity
decoder's 128-depth bound is internal at present; edge acceptance, numeric schema parity and
handling of unpaired surrogates in new wire requests require explicit contract tests when the
transport is introduced. No library default may silently choose that public behavior.

Final combined gate: `bash scripts/check.sh` exited 0. Formatting and all-target lint passed,
15 native tests passed with no ignored tests, the compiled identity comparison passed 10,003
cases, and all 378 reference/common tests passed in 881.784s; whitespace checks passed.
The separate native command build also passed and printed `tdev 0.1.25` for `--version`.
Local Markdown file/anchor references were checked. Logs are retained at
`$PREFIX/tmp/tdev-combined-full.log`, `tdev-cargo-{build,test,clippy}.log`,
`tdev-substrate-{focused,acceptance}.log` under the same temporary directory.
This qualifies the initial library boundary and the unchanged reference behavior; HTTP source
work, process/artifact/deployment/operator parity, whole-state transition and live host acceptance
remain open in P2–P6. No main integration or live service change was performed.

## Published baseline and executable boundary — 2026-10-02

Current comparison baseline: `63e7f750e063cac336c74f60fc84d153add4bee8`.
The local baseline was behind origin by 18 commits. Existing install/observer changes were
committed as `59feec0`, then merged with current origin `c5669aa`, retaining its thirteen tools,
typed request envelope, human-name continuation, observation and exact-operation fixes.
Merge conflicts were resolved in README, LOCAL_VALIDATION, version ownership and CLI/tests;
source remains 0.1.25. The tdev branch was pushed without force; remote readback returned the
exact baseline OID above. No resident/provider activation was performed.

Baseline checks used the separate `tdev-baseline` worktree and the existing pinned dependency
directory. The first 72-test affected run had one dependency-import failure because that
worktree did not yet have `.tdev-deps`; the other 71 passed. After linking the existing private
dependency directory, the failed test passed (0.465s), then `bash scripts/check.sh` passed all
365 tests (907.221s) and the whitespace check. The missing fixture dependency was not reported
as a product success. Temporary logs are under `$PREFIX/tmp/tdev-baseline-{focused,full}.log`.

The implementation worktree preserves the user's `.artifacts/`, `node_modules/` and conversation
file. A named Git stash and private document snapshot retain the original pre-synchronization
changes; they were not dropped. Before the P2 implementation above, runtime files were unchanged
from the published baseline.
For independent byte verification, sort relative regular-file paths under `src/tdev` and
`contracts`, excluding `__pycache__`, and hash each UTF-8 path + NUL + bytes + NUL with SHA-256:
39 files, `c56e35030a111353b2197ac471143b9b2fae4ee3652dd28548f7aa847abace67`.
This source/contract digest is deliberately distinct from the older broader 89-file digest.

Environment: Android 16/aarch64 Termux, Python 3.14.6, Git 2.55.0, installed rustc/cargo 1.98.0.
SHA-256 executable/input identities: `$PREFIX/bin/python`
`4f8d78ede7fc26e96e99342dd83ce42d32c9b4d0806bc9a99ff7151396269b25`;
`$PREFIX/bin/git` `aba46d67c0c5752c27129d97136055bd8d7f3b3c4378edbf5c7c5a6f8dead5db`;
`requirements.txt` `a593b4494557bc87c50a132597f908de881735179e8a6b45502e08f16553c90f`.
The pinned dependency set is jsonschema 4.26.0, attrs 26.1.0, jsonschema-specifications
2025.9.1, referencing 0.37.0 and rpds-py 2026.6.3. These hashes do not identify all dynamic
system libraries or freeze the device/OS; a later comparison must re-record its environment.
Tool presence does not qualify a Rust build. `scripts/measure.py` on this baseline recorded
2.358 / 2.325 / 6.576s, 32 / 32 / 36 calls, one executor start and exact publication in each
trial; expanded advertised schemas were 299,416 bytes. These are unisolated two-file local
smoke measurements and show substantial variance. They are not a speed comparison with the
historical baseline or a Rust performance result. Matched resource/build/latency measurements
and real host acceptance remain pending; the comparison workload and initial investigation
thresholds are in IMPLEMENTER_REFERENCE.

The common harness has nine executable scenarios: discovery and rejected admission; full
source/edit/exec/validate/publish with closed-task retirement; invalid paths; lost response and
controller SIGKILL with single execution/input replay; missed completion/fresh forward work;
durable failed exit/no-op checkpoint; human-name ambiguity; bounded JSON/SSE observations;
and SHA-256 exact publication. It imports no tdev domain implementation. The action inventory
has 61 entries; ten fixed identity vectors have a separate Python encoder bridge. These are
initial boundaries, not full feature parity or live host qualification.

Focused/affected command:
`PYTHONPATH=src:.tdev-deps:tests python -m unittest acceptance.test_runtime acceptance.test_inventory test_identity test_contract -v`
passed 16 tests in 51.149s. Initial harness assumptions were corrected against the current
contract: file reads return base64, mutation replay does not imply captured output in that
response, progress ticks require an observation window, and publication already closes the
task. No production behavior was changed to make the harness pass.

The first full post-boundary run was interrupted during the surface tests by the session/model
transition; no running process or final result remained. It is not counted as a PASS. The final
combined qualification is recorded after completion. Logs:
`$PREFIX/tmp/tdev-foundation-focused.log`, `$PREFIX/tmp/tdev-foundation-full.log`.

## Runtime implementation foundation — 2026-10-02

Historical documentation-only preparation before the refreshed baseline above.
The selected structure is in ARCHITECTURE §10 and execution
order in IMPLEMENTATION_PLAN P0–P6; IMPLEMENTER_REFERENCE supplies non-normative test navigation.
No Rust implementation, common executable harness, runtime swap or new storage format is claimed.
Existing source/install/observer changes and unrelated untracked files were preserved.

Review baseline HEAD is `0f6b78e18ec6abfad830bfd8e65917c7c128149a` **plus working-tree changes**,
including untracked bootstrap product/test files. The executable/test/contract/script baseline
has 89 files and manifest digest
`9af043ede8af6ec9adf6d718c44893b256093284e8e50e693e4d25aa85d5a1d8`.
The manifest selects `src/tdev/**/*.py`, `tests/**/*.py`, `tests/**/*.cjs`,
`contracts/**/*.json`, direct files in `scripts/`, and
`requirements.txt`, `tdev`, `i`, `install.sh`, `bootstrap.sh`.
Sort repository-relative paths lexically; hash the UTF-8 concatenation of
`path + NUL + lowercase SHA256(file bytes) + LF` with SHA-256. Documentation is excluded from
this executable baseline. This identity is not an archived snapshot or a dependency/environment
attestation; P0 still must bind a reproducible comparison fixture and action-level inventory.

Executed during the preceding review on that executable baseline:

| Check | Observed result / scope |
|---|---|
| `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_core test_native test_recovery test_process_crash test_contract -q` | 47 tests, OK, 65.776s |
| `bash scripts/check.sh` | 326 tests, OK, 496.874s; diff whitespace check passed |
| `PYTHONPATH=src:.tdev-deps python scripts/measure.py` | Three local fixture runs: 1.171 / 1.195 / 1.227s, one executor start and exact publication each; advertised expanded schemas 283,584 bytes |

These are Python implementation results. The small workload does not isolate interpreter cost,
measure host/Tunnel latency, establish model-visible token cost or predict a Rust speedup.
For the foundation document changes, focused `test_contract` passes 3 tests in 4.273s.
The post-edit `bash scripts/check.sh` passes all 326 tests in 817.235s and the diff whitespace
check (exit 0). Local Markdown file/anchor references and test-navigation paths were checked.
The 89-file executable baseline digest remained unchanged. These checks qualify documentation
coherence and the unchanged implementation; they do not establish a new executable or live
host/runtime acceptance. Duration differences between the two full runs are not a performance
comparison: these were unisolated validation runs, not matched benchmarks.

## Original qualification context

Evidence only; README owns current status. Work location:
`/data/data/com.termux/files/home/prj/tdev`, branch `tdev`.
Starting authoritative local and remote HEAD:
`11042735d67ca029e258573ba3d800aa464fb755`.

No alternate development clone/checkout/worktree or production service change.
Synthetic Git repositories and inactive bundles were disposable authored test fixtures.
Existing unrelated .artifacts, node_modules and tools were preserved. The MCP SDK probe
was installed separately in ignored .tdev-mcp-client, not existing node_modules.

## Historical executed checks (before independent review below)

| Command | Observed result |
|---|---|
| `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_native test_http test_process_crash test_contract -v` | 21 tests, OK, 20.189s |
| `sh scripts/check.sh` | 57 tests, OK on the native-CGO/termux-chroot Tunnel-compatibility line; diff whitespace check passed |
| disposable `sh install.sh --no-start <private-root>` | `prepare-tunnel` selected `native-cgo`, built tunnel-client 0.0.14 for Android/arm64 with CGO, and staged the private binary in the DOWN Tunnel service template |
| `PYTHONPATH=src:.tdev-deps python scripts/check_mcp.py` | Official @modelcontextprotocol/client@2.0.0, pin 2026-07-28, modern era; connection, seven-tool listing and structured tool call passed |
| `PYTHONPATH=src:.tdev-deps python scripts/rehearse.py` | Real staged native edit/exec → controller SIGKILL → restart/stdin replay → validate → exact local publication/readback; wrong bearer 401 and seven tools on both starts; runit shell syntax and DOWN templates passed |
| `PYTHONPATH=src:.tdev-deps python scripts/measure.py` | Three default-native exact-publication trials, below |

Rehearsed runtime bundle SHA-256:
`06992d4b0b47d71512af3d86bc393b6e0519477d203bdf4033f8233bab808633`.
It covers source, contracts and pinned Python dependencies, not a Git commit or production
deployment. The disposable bundle was removed after rehearsal; no active install changed.

The first official SDK probe rejected missing cache metadata on tools/list. Added required
ttlMs/cacheScope to discovery/list results and reran successfully. This was a real wire
failure, not treated as a PASS or hidden by relaxing the client.

Coverage: actual Draft 2020-12 schemas and positive/negative config/tool fixtures;
native default and explicit SSH no-fallback; SHA-1/SHA-256 source, atomic edits, CAS/ABA,
parallel refs/workspaces, immutable candidate HEAD and exact non-force publication;
actual controller SIGKILL while native execution remains live; lost launch reply without
re-execution; sequenced stdin; detached-descendant cancellation; timeout/partial capture;
bounded output; environment credential sentinels; validation source-change and forged
stdout rejection; terminal retirement and inactive rollback/tamper.

Missing native process identity is fault-injected to check unknown effect and per-workspace
fencing; it is not represented as an actual whole-UID kill. Optional OCI control-flow tests
use an authored mocked engine, not deployed Linux isolation. Native tests run the real
default supervisor on this Termux device, but do not prove hostile same-UID isolation.

## Small measurement, not a comparative benchmark

Advertised input/output tool schemas: **25,262 UTF-8 bytes**, canonical JSON.
Workload: open, batched read/search, atomic two-file edit, one real native validation,
exact local publication and status polls. No injected fixture executor.

| Trial | Wall seconds | Calls | Polls | Validations | Native starts | Exact publication |
|---|---:|---:|---:|---:|---:|---|
| 1 | 1.136 | 26 | 21 | 1 | 1 | yes |
| 2 | 1.119 | 29 | 24 | 1 | 1 | yes |
| 3 | 1.146 | 27 | 22 | 1 | 1 | yes |

Five semantic calls plus aggressive 10ms polling explain call counts; these are not
recommended ChatGPT polling intervals. No HTTP/Tunnel/GitHub latency, remote cold start,
large-repository throughput or comparative architectural speedup was measured. Fresh
per-operation copies and HOME do not retain ignored dependencies between runs. File
payload plus shallow Git pack still duplicate source. No broad performance claim follows.

## Tunnel host-compatibility follow-up — 2026-09-21

The installed tunnel-client 0.0.10 treated absent OAuth metadata (HTTP 404 candidates) as a
doctor failure. The official stable 0.0.14 was checksum-verified before replacement; its
doctor accepts that bearer-only configuration and reports the OAuth discovery candidates as
optional. The original binary was retained as a local backup.

The official 0.0.14 linux-arm64 binary is statically linked and was built without cgo DNS
support. On Android there is no /etc/resolv.conf, so its pure-Go resolver fell back to
[::1]:53 even though Termux curl resolved normally through $PREFIX/etc/resolv.conf.
GODEBUG=netdns=cgo was observed to be unsupported.

Two working Termux compatibility paths were then falsified and qualified. First, the pinned
official v0.0.14 source was built locally with `CGO_ENABLED=1 GOOS=android GOARCH=arm64`.
The resulting Android binary used the platform resolver and system trust directly: no PRoot,
GODEBUG resolver override or CA_BUNDLE was required. A read-only metadata lookup succeeded
and a bounded run emitted `🟢 tunnel-client started`. The simpler
`go install github.com/openai/tunnel-client/cmd/client@v0.0.14` route with CGO enabled also
produced a working Android binary.

Second, the installed official Linux binary was tested through `termux-chroot`. The wrapper
made Termux's resolver visible as /etc/resolv.conf, while `CA_BUNDLE=$PREFIX/etc/tls/cert.pem`
was still required for TLS verification. With that CA setting, metadata lookup and bounded
startup also succeeded. termux-chroot is provided by the Termux proot package, so this is a
simpler fallback wrapper rather than removal of the underlying PRoot dependency or a security
boundary. Product direction is native CGO first, termux-chroot fallback.

These probes established the Termux control-plane startup path. Live host evidence followed
on 2026-09-21.

## Live ChatGPT/Tunnel acceptance — 2026-09-21

The development Tunnel used the prepared native-CGO tunnel-client 0.0.14 and the private
installation bearer. After ChatGPT connector creation/Refresh, the host exposed all seven
tdev tools. The first read-only `workspace list` call was blocked by the host before reaching
tdev because the mixed-action tools were advertised with destructive/open-world annotations.
All seven public tools were then aligned to the then-used tmcp convention
(`readOnlyHint=true`, `destructiveHint=false`, `idempotentHint=false`,
`openWorldHint=false`). Focused contract/HTTP checks passed and the then-current full suite
passed 57/57. After server restart and connector Refresh, live `workspace list` succeeded.

That successful authenticated discovery and subsequent calls prove the configured bearer was
forwarded to the local server: tdev authenticates before discovery/tool dispatch. The server
also rejects mismatched MCP protocol/method/name metadata before tool effects, so successful
ChatGPT calls exercised the required **MCP 2026-07-28** request metadata/header path rather
than a silent legacy downgrade.

A first disposable GitHub-ref acceptance then completed workspace open/read/edit and a real
native exec. The exec initially returned `running`; a same-turn process status read exposed
the terminal result, exit 0 and captured stdout. The first native validation did **not** pass:
the enrolled command rebuilt ignored dependencies with
`python -m pip install --target .tdev-deps ...` inside the fresh operation copy, exceeded the
native disk budget, and terminated with `DISK_LIMIT` / exit -9. A temporary external tooling
path proved the diagnosis: the same checkpoint then ran 57/57 tests, published exactly to
the disposable ref, replayed the same publish request without a second effect, and preserved
the same terminal validation/publication state after a controller restart.

The product repair is commit
`18303db9c280c8578c92896c0048610345db11e2`
(`Add operator tooling environment for native validation`). Repository config may now supply
a bounded, non-secret `toolingEnvironment`; reserved HOME/TMP/XDG/Git/SSH lookup variables
remain unavailable. The exact tooling environment is included in execution input and the
validation policy digest, so changing it invalidates prior validation for publication.
Local post-repair `scripts/check.sh` passed **58/58 tests in 95.285s**.

For the final live revalidation, the tdev repository used `sh scripts/check.sh` with
`PYTHONPATH` pointing to an operator-owned warm tooling directory outside the operation
source copy. The ChatGPT-driven disposable ref opened and edited normally; validation began
directly with unittest output, performed no `pip install`, and passed **58/58 tests in
98.198s**. Validation operation
`14e5549a0aa541a7ab1fc2f3240afed0` produced candidate
`2841dc7d8d83a9d7027e8d717c92d820c45d2c25`, which was published to the disposable ref
and same-request replay returned the identical publication without a second effect.
The disposable remote ref, temporary authorization and acceptance worktree were then
removed; canonical `refs/heads/tdev` remained at
`18303db9c280c8578c92896c0048610345db11e2` before this documentation closeout.

The live status stream advanced through increasing output cursors and reached
`running → terminal` in the same model turn. Earlier controller-restart acceptance also
read back the already-completed validation/publication instead of relaunching it. These are
direct observations of the progress-continuity and reconnect invariants on this path, not a
claim that every future timing race is impossible.

## Protocol and host acceptance boundary

The requested version is **MCP 2026-07-28**. Implemented per-request metadata/header
validation, server/discover, complete results, explicit cache metadata, and structured
unsupported-version errors. Core HTTP has no legacy initialize/session protocol or silent
downgrade. The official SDK pinned-version probe tests interoperability, while the historical
ChatGPT acceptance above confirms the tested host drove that then-advertised annotation
profile through Secure MCP Tunnel. It does not qualify subsequently corrected annotations.

Primary references:
[MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning),
[MCP HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http),
[MCP discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover).
[OpenAI's server documentation](https://developers.openai.com/plugins/build/mcp-server) and
[Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
describe the product route used for the observed live acceptance.

Not executed: entering an intentionally wrong bearer in the ChatGPT host UI, alternate
account/session isolation (not claimed for shared credentials), optional remote OS
isolation/egress, or production cutover. Local wrong-bearer denial remains covered by the
HTTP/rehearsal evidence above. No separate Linux executor is needed for the default native
path. Production activation requires separate authorization.

## Independent canonical review and Local Codex qualification

Fresh starting local HEAD and remote `refs/heads/tdev` both resolved to
`989f580434c5ed865b84e84f84a835aa923b64c5`; the review range begins at
`99372b5b7988f0640e12c70943cdcac3a7abf40f`. Both heads were rechecked after resume.
Only `/data/data/com.termux/files/home/prj/tdev` was used for product development.
Existing `.artifacts/` and `node_modules/` were preserved. Authored bare repositories and
inactive bundles were disposable tests, not alternative product checkouts.

| Review area | Finding and disposition |
|---|---|
| Exactness/authority | Termux-native default, exact source/candidate, current authorization, durable replay and non-force publication survived the reviewed commits. No mandatory remote executor was reintroduced. |
| Tool annotations | `41f6018` marked arbitrary command/write/publish operations read-only and closed-world to pass host gating. Corrected conservative hints: only read is read-only; tests assert real semantics. Older successful host calls do not qualify these changed hints. |
| Warm tooling | `18303db` binds exact environment values to execution and validation policy, not external directory contents. Current warm path contained Python dependencies, not tdev source. Added candidate-module precedence, credential sentinel and source-change rejection tests; documented immutable/versioned dependency paths and owner trust. Old pre-policy-format validations fail closed at publication, rather than gaining authority. |
| Progress/reconnect | `0025f62`/`66006a8` added requirements but no bounded frontier; replay could return an old running result. Added reconciliation on same-request replay, bounded inspect/pages/closed-resource discovery and freshness cursors. Logs expose retained available bytes even beyond the returned page. No new table/planner. |
| Historical live evidence | Read-only inspection of retained validation `14e5549a0aa541a7ab1fc2f3240afed0` confirmed success, exit 0, stopped proof and candidate `2841dc7d8d83a9d7027e8d717c92d820c45d2c25`; publication `f4f021990f754bc698742f115e5dc4ba` matched it. Retained output includes 58 tests/98.198s/OK. No retirement records were present and execution copies remained; prior cleanup wording did not prove full resource retirement. No historical runtime data was deleted. |
| Tunnel operations | Existing native Tunnel and controller processes remained alive; localhost health returned up. Managed runtime alias listing was empty, consistent with the foreground runtime not being an alias. Ephemeral health port had no URL file, so guessed-port results were not used as health evidence. New inactive service templates persist the health URL; existing services were not restarted. |

The earlier acceptance date headings are retained as reported evidence labels, not a claim
of a new ChatGPT run during this review. No previously completed ChatGPT coding acceptance
was repeated. Source-integrity/credential claims remain the owner-trusted same-UID model,
not hostile-code isolation or immutable dependency attestation.

### Installed Local Codex and extension evidence

Installed `codex-cli 0.155.1` sent legacy initialize against the HTTP endpoint; the direct
probe failed with missing required request headers (`-32020`). The correction is an explicitly
selected `tdev.codex_bridge` stdio compatibility edge, not a core downgrade. Core requests
remain 2026-07-28. Adapter initialization reports 2025-11-25 and forwards the same schemas,
annotations, arguments and durable identity, once; current auth remains at the controller.
An additional disposable loopback capture, without the adapter, recorded the actual client
proposal as `initialize` with `protocolVersion: 2025-06-18`. Thus 2025-11-25 is the adapter's
accepted response/negotiated revision, not the client's original proposed date. The capture
logged only method/version, no credentials, and made no calls to the development runtime.

The prepared native tunnel-client 0.0.14 installed its bundled Tunnel MCP plugin (0.1.4) into
the initially active `jgnh` Codex profile. On resume the active profile was `janmori101`;
installation was repeated specifically there, preserving unrelated configuration. Fresh
Codex app-server discovery then found the plugin and its read-only `list_runtime_aliases`
call succeeded. No Tunnel runtime was created, stopped or replaced by the plugin.

`scripts/check_codex.py` launches the installed Codex app-server with an ephemeral test MCP
configuration and thread, without model inference or permanent tdev MCP registration.
Actual MCP discovery/list/call exercised all seven tools on a synthetic bare Git ref:
open/read/edit → native exec → client exit/restart → same-request replay → sequenced stdin
and replay → validate → exact local publication → execution retirement → closed-workspace
inspection. The synthetic ref/state disappear with the test directory. These are installed
client facts, not a ChatGPT model turn, GitHub acceptance, or Local Codex through Tunnel.

The authored external CLI fixture consumed JSON stdin, produced a captured artifact, exited
7 despite forged PASS/admin/validation stdout, and could not be used as a validation receipt.
Owner-mandated validation remained mandatory and retirement remained available. This closes
the selected command-first extension path without a gateway. Remote/device/API adapters are
not selected or qualified; they are not prerequisites for native use.

### Checks for this review

| Command | Observed result |
|---|---|
| Baseline `sh scripts/check.sh` at `989f580` | 58 tests, OK, 54.998s |
| Review `sh scripts/check.sh` | 64 tests, OK, 109.940s; final post-documentation rerun 64 tests, OK, 121.885s; diff whitespace checks passed |
| `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_adapter test_admin test_bridge test_progress test_contract test_native -v` | 21 tests, OK, 45.967s |
| `PYTHONPATH=src:.tdev-deps python scripts/check_mcp.py` | Official SDK 2.0.0, protocol 2026-07-28, seven tools and structured call passed |
| `PYTHONPATH=src:.tdev-deps python scripts/check_codex.py` | Installed client seven-tool native path, client restart/replay, exact local publication, retirement passed; installed Tunnel plugin discovered/read-only call passed |
| `PYTHONPATH=src:.tdev-deps python scripts/rehearse.py` | Inactive bundle `29a01f536a86fe06b9827d81b9a3edbf1540c11a404ff41c8bf4a68bb57a2736`; real native SIGKILL/recovery/publication; two HTTP starts each denied wrong bearer (401) and exposed seven authenticated tools; no production services touched |

Schema-edit failures during development were genuine failures (misplaced JSON fields),
localized and repaired before successful fixture/schema reruns; no invariant/test was removed.
Canonical UTF-8 `x-tools` advertisement (expanded schemas, descriptions and annotations) grew
from 25,271 bytes at `989f580` to 37,069 bytes. This is a real context cost for the inspect
frontier/freshness contract; tool count remains seven and no handshake was added to core HTTP.
The explicit legacy adapter adds one upstream discover during its own initialize and one
upstream request per tool request. No comparative latency/throughput speedup is claimed.

Remaining acceptance is targeted, not a new design/governance gate: deploy the reviewed
changes only to an authorized development runtime, Refresh the ChatGPT connector and check
truthful mixed/write annotations with the host's supported approvals. If blocked, record the
actual host behaviour instead of restoring false hints. Persistent Local Codex registration
requires selecting the intended instance/private bearer; the disposable client path already
passes. Interactive model behaviour, Codex-through-Tunnel, wrong-secret host UI, optional
remote isolation and production cutover were not executed. Shared credentials still do not
promise account/session isolation.

### Approved development controller restart

After explicit user approval, source HEAD `00edb5fe88f1737a0d36c9a65fc50da0793b180d`
was loaded by restarting only the identified development controller. Preflight found no
running/unknown operations and no busy workspace; SQLite quick_check returned ok.
PID/start identity and repository cwd/argv were checked before SIGINT. An owner-private
SQLite online backup and startup log were retained under
`/data/data/com.termux/files/home/.local/share/tdev/controller-restart-wmfxyqfg/`.
New detached controller PID 13295 replaced PID 19587 on the same localhost port 8765,
state and config. Native Tunnel PID 26918/start identity was unchanged; no service manager
activation, credential/grant change, remote publication or native execution was performed.

Post-restart local checks: health up; authenticated MCP 2026-07-28 tools/list exactly equals
the current expanded contract (seven tools, only read marked read-only); wrong bearer 401;
workspace list succeeds, includes nextAfter and reads canonical head `00edb5f`.
All ten operation rows and both workspace rows were unchanged across restart; config digest
was unchanged. These are localhost deployment checks, not refreshed ChatGPT acceptance.
Documentation/contract checks passed (3 tests, 0.610s); `sh scripts/check.sh` passed all
64 tests in 56.576s after this follow-up, with no source/contract implementation changes.
Next human action: Refresh the existing ChatGPT connection, then use a new conversation to
verify changed discovery/approval behaviour. The prior complete coding path need not be
repeated solely because controller memory was refreshed.


## Delegated projects and managed branch lifecycle — 2026-09-21

Implemented `tdev_project` list/inspect/connect/create for ordinary local Git folders and
GitHub repositories, operator-delegated root/owner policies, automatic workspace start,
publication by absence CAS, cleanup of owned exact-OID refs after close, and continuation
from retained publication. Existing user dirty/untracked state and canonical refs are preserved.
SQLite schema 2 migrates existing rows and adds project enrollment; bundle compatibility is
bound to hashed config-schema metadata and incompatible rollback is rejected.

Executed checks:

- Focused project/HTTP/admin/contract/adapter/bridge suite: 28 tests, OK (66.499s).
- Additional provider late-failure and schema migration coverage; focused project/admin suite:
  18 tests, OK (46.909s); subsequent admin/migration/contract checks: 7 tests, OK (3.490s).
- `sh scripts/check.sh`: 81 tests, OK (179.135s); final rerun after client-script/documentation
  updates: 81 tests, OK (156.375s), including diff whitespace check.
- Official SDK probe: @modelcontextprotocol/client 2.0.0, protocol 2026-07-28, eight tools,
  structured call success.
- Installed Local Codex probe: eight tools, native coding path, reconnect replay, exact local
  publication and cleanup success through the explicit stdio adapter.
- Inactive packaged rehearsal: bundle
  `1f697463c66fe3a687e6f1a5f3bbacb8d49dfa40d68355ae1472308ad309a559`,
  native SIGKILL recovery/exact publication, eight tools before/after restart and wrong bearer
  401. No production service activation.

Within the user's request to implement and enable project management, the existing development
controller at localhost:8765 was restarted (PID 14108 → 9803) with the same state, bearer and
provider credentials. Private config and SQLite backups, migration-copy check and activation
receipts are retained under
`/data/data/com.termux/files/home/.local/share/tdev/project-upgrade-wx0tqehv/`.
Nine workspace rows and 45 operation rows were preserved during activation. Delegation now
covers `~/prj` through `local-projects` and GitHub owner `humtr` through `github-projects`;
both permit create/connect and use adopted validation `sh scripts/check.sh`. Existing `tdev`
is the default project/base `refs/heads/tdev` with managed namespace `refs/heads/tdev-work/`.
No credential text was logged. Local GitHub readback confirmed the existing credential has
push/admin access to humtr/tdev; this does not prove creation permissions on other owners.

Real GitHub lifecycle acceptance through authenticated localhost HTTP:

- Workspace `dfb983f12a5442d6a2ecf36d0ff47e95`, generated ref
  `refs/heads/tdev-work/project-acceptance-dfb983f12a5442d6a2ecf36d0ff47e95`.
- Started from canonical `e7124860dfb6e014b4943ee0614a350987393a47` without manually supplied
  repo/ref/head; only `tdev-managed-project-probe.txt` was added.
- Validation `81b07c751ae64e91a2510afc6a3a4010` ran that remote candidate's existing **64-test**
  suite, exit 0 (119.235s). This is separate from the local changed-source 81-test suite.
- Published exact frozen commit `a21e057ad39e7fbf9ba4700e7b4577d57c9661b5`; Git readback
  matched exact commit and probe-only diff.
- Managed cleanup deleted the branch, repeat cleanup and publication replay returned the
  original results, workspace is closed, validation execution copy was retired.
- Canonical HEAD remains `e7124860dfb6e014b4943ee0614a350987393a47`.

The previously stranded `refs/heads/tdev-host-acceptance-20260921` was independently checked
against expected OID `0f8492c849d3416f0b25001ebfc635a2a6b63ffe`, sole parent e7124860 and only
`tdev-host-acceptance-probe.txt`. It was deleted with advertised-old-OID Git CAS; its temporary
exact-ref grant was removed. It was not retroactively adopted as a managed workspace.
Post-run checks found zero running/unknown operations, zero busy workspaces and HTTP health 200.

Limits: GitHub repository creation uses provider fixtures and has not created a real repository;
new-project local creation/native validation/publication/cleanup ran over actual HTTP in disposable
fixtures. These localhost/SDK results do not claim refreshed ChatGPT host discovery. Optional
remote/OCI isolation and production cutover were not performed. Source changes remain uncommitted.

## Workspace composition and source-task separation — 2026-09-21

This qualification supersedes the earlier source-workspace/process contract for the current
working source. Historical evidence above retains the names and state formats actually tested.
`tdev_workspace` now manages project composition; `tdev_task` manages one project's source
state; `tdev_operation` observes every operation and controls execution processes when applicable.
The executable patch revision was changed only in `src/tdev/__init__.py`, under README policy.
Internal state schema 3 uses fresh state; old experimental state is rejected without migration
or deletion. No existing development controller restart or production activation was performed.

Executed checks:

- Source core checks: 7 tests, OK (16.998s).
- Contract checks: 3 tests, OK (2.656s).
- Project lifecycle checks after the rename: 14 tests, OK (35.408s).
- HTTP checks including real native local project → workspace → task → edit → validation →
  publication → cleanup/retirement → workspace close: 6 tests, OK (17.310s).
- New composition checks, final focused run: 8 tests, OK (19.802s). They cover repository-free
  spaces; durable replay across restart; operation status for non-process effects; two projects
  with independent exact publications; reuse of one project in another space; default-space
  concurrent creation; revision races; cross-principal denial; revoked/replaced membership;
  pending source admission blocking close/detach; bounded pending-operation visibility;
  same-turn completion/no-change observation; and owned cleanup after workspace close.
- The old-state test opens an actual old-shaped SQLite fixture twice, verifies rejection and
  released lock, and checks that its table/data/revision remain unchanged. The prior automatic
  schema migration test was removed because that compatibility is no longer offered.
- `sh scripts/check.sh`: **88 tests, OK (166.078s), exit 0**, including `git diff --check`.
- `scripts/check_mcp.py`: official @modelcontextprotocol/client 2.0.0, pinned protocol
  2026-07-28, nine tools, source-task and workspace structured calls passed.
- `scripts/check_codex.py`: installed Codex app-server through explicit stdio → local HTTP;
  nine tools, workspace creation/inspection/close, native coding, client reconnect/replay,
  exact local publication and resource retirement passed. This profile reported no Tunnel
  plugin installed; it was not installed as part of qualification.
- `scripts/rehearse.py`: inactive bundle
  `06a3e9198b9d48bcfa1efac639c5ab24e82f7fb9eada15fe75611e4e9087d71a`;
  real native controller SIGKILL/restart and exact publication passed, nine tools on both
  starts, wrong bearer 401. No production services touched.
- `scripts/measure.py`: three authored default-native trials completed exact publication in
  3.202s / 2.763s / 3.103s, with one validation and executor start each. Calls were 33/29/30,
  including 28/24/25 status polls: five semantic calls each, no explicit workspace setup call.
  Expanded advertised tool schemas measured 111087 bytes. The script uses aggressive local
  polling; these timings ran alongside other checks and are not a matched speed comparison,
  host/Tunnel/provider latency result or an end-to-end productivity claim.

An HTTP header test initially retained the base64 encoding of the old source-tool name and
correctly received a mismatch rejection; its encoded fixture was updated to the renamed tool.
New composition tests were corrected to account for the existing rule that successful
publication closes the source task (closed tasks require includeClosed in listings). Neither
HTTP admission checks nor publication terminalization was weakened to make tests pass.

Remaining: qualification in a newly prepared actual development installation and refreshed
ChatGPT discovery; the rest of the Git/local development loop and actual resident deployment
remain separate implementation milestones. Multi-project publication is independently proved
per repository, not an atomic cross-repository transaction. No Blender/device/model integration
or production deployment is claimed by this qualification.

## Local checkout import and task integration — 2026-09-21

The current source adds explicit local checkout import, same-repository task delta integration
and bounded source comparisons. The executable patch revision changed only in
`src/tdev/__init__.py`; the product remains within the authorized 0.1 line. No state format
change, existing controller restart, canonical publication or production activation was made.

Executed checks for this source revision:

- `test_source`: 12 tests, OK (18.485s) before the final UTF-8 pagination and older-source
  checkpoint assertions. The final affected run below includes those assertions.
- `test_source test_http test_projects test_contract`: **35 tests, OK (46.212s)**. Local import
  preserves original index bytes, files and refs across validation/publication, captures final
  staged-plus-unstaged working bytes, omits ignored untracked files, preserves executable bits
  and safe links, and does not execute a configured clean filter. Changes between scans,
  unsafe links, tracked FIFOs, sparse/unmerged indexes, moved identities and switched HEAD are
  rejected without admitting a partial task. Linked worktrees use their own branch and cannot
  silently rebind an existing project.
- Integration fixtures exercise independent edits within one text file, explicit content and
  side selection, binary/delete-modify/file-directory conflicts, unchanged target on conflict,
  frozen source replay after restart, newer-base targets, stale target/source rejection,
  same-repository admission, private utility failure without a stuck writer, and rejection of
  validation from before integration. Diff pagination reconstructs UTF-8 bytes losslessly.
- The HTTP project lifecycle fixture now imports actual local edits, integrates a second task,
  reads a patch, validates natively, publishes the exact candidate, cleans the branch/retires
  the process and closes the composition space.
- `scripts/check_mcp.py`: official @modelcontextprotocol/client 2.0.0, pinned 2026-07-28,
  nine-tool discovery and task/workspace structured calls passed.
- `sh scripts/check.sh`: **100 tests, OK (124.709s), exit 0**, including `git diff --check`.
- `scripts/rehearse.py`: inactive bundle
  `a699dd8d8a47cebae439fbe8f9f7a78eab89564f2328d9450aa95144d1d5c696`;
  packaged native controller SIGKILL/restart and exact publication passed, nine tools on both
  starts, wrong bearer 401. This exercises packaging/recovery; the new import/integration
  journey is qualified by the focused HTTP fixture, not by this rehearsal.

These are local fixtures and an inactive installation. They do not qualify live ChatGPT tool
refresh, persistent development environments, checkout writeback, complete Git merge-parent
history or resident deployment. Integration keeps a single target parent and an operation
receipt for the selected source delta. Existing deployment and extension milestones remain.

## Development connection refresh repair — 2026-09-21

The reported stale tool list was reproduced directly against localhost:8765: the old running
controller advertised eight tools, including tdev_process, while working source advertised
nine including tdev_task/tdev_operation. Its health version was 0.1.0 and state schema was 2.
Refresh could not load implementation changes into that process. During repair the user
stopped the manual Tunnel; the old controller itself remained alive.

Prepared the already tested bundle
`a699dd8d8a47cebae439fbe8f9f7a78eab89564f2328d9450aa95144d1d5c696` under
`/data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8/`.
Its config preserves existing bearer hashes, exact grants and local/GitHub delegation.
Schema-3 state is separate; the old schema-2 directory remains intact, with a SQLite backup
in previous-state.sqlite. The existing delegated humtr/ai project was reconnected through
the project API with the same repository identity and ID. Historical source tasks/operations
were not migrated into the new state. Preflight found 14 closed old source workspaces and
77 terminal operations, with no open source workspace or running/unknown operation.

The candidate was first started at localhost:8766. Authenticated HTTP advertised all nine
tools, and workspace create → default task start → native command (exit 0) → task close →
process retirement → workspace close passed. This smoke fetched existing source and did not
publish a remote ref. Original credentials were accepted without exposing them in output.

After qualification, the old controller PID 9803 and temporary candidate were stopped.
Controller PID 13651 now runs the packaged source/state/config on the original port 8765;
health reports 0.1.2. The existing remote Tunnel identity is retained, with native managed
runtime alias tdev-development and profile tdev-managed forwarding to localhost:8765/mcp.
The HTTP attachment uses native runtimes connect because the plugin connect tool accepts
stdio only; plugin list/status/stop were used where available. No remote tunnel was created
or deleted, no production runit service was installed, and canonical source was not published.
Private preparation/activation receipts are retained in the new installation root.

Final authenticated discovery on port 8765 returned HTTP 200 and the nine expected tools.
Native runtime status proved process_running/healthy/ready. Its admin-UI poll summary was
unknown, so `tunnel-client health --url-file ... --require-control-plane-poll --json` was
checked separately: healthz/readyz were 200 and a successful control-plane poll was recorded,
exit 0. The initial unauthenticated legacy initialize probe remains 401 as expected; it is
not a failed authenticated modern MCP request. `git diff --check` passed after documentation
updates. No source implementation changed during this connection repair.

Remaining host acceptance: Refresh the existing ChatGPT connection, verify tdev_task and
tdev_operation (and the new tdev_workspace composition actions), then test in a new conversation.
Local authenticated discovery/native execution and Tunnel health are separate from that host
acceptance. Old foreground server/Tunnel commands must not be restarted alongside this runtime.


## Resident service installation — 2026-09-21

The user explicitly requested Termux service registration, automatic `bash install.sh`, and
retirement of the previous implementation occupying the service names. The implementation now
uses owned runit services `tdev` and `tdev-tunnel`; the executable patch revision remains in
the authorized 0.1 line and is defined only in src/tdev/__init__.py.

Qualification performed:

- Initial focused resident/admin/HTTP tests: 19 tests, OK (14.359s); repeated after profile
  identity hardening: 19 tests, OK (25.895s).
- Initial full suite: 110 tests, OK (151.846s). A second full check after profile identity
  changes: 110 tests, OK (143.758s). These precede the final additional regression tests.
- Final focused resident tests: 12 tests, OK (4.618s), including installation ownership,
  first-registration rollback, interrupted partial update, readiness rollback, explicit old
  service retirement, incompatible pre-resident rollback rejection, concurrent foreign service
  preservation, installer locking, credential reference handling, executable/profile checks,
  maintenance admission fencing and outstanding-effect preservation.
- `scripts/rehearse_services.py` uses actual runsv/runsvdir and a private copy of the installed
  termux-services recovery script with a separate PREFIX/SVDIR. Installation/reinstallation,
  server and fixture-tunnel SIGKILL recovery, root SIGKILL/monitor recovery, persistent DOWN
  and uninstall/data retention passed. No shared live graph was killed. Tunnel provider health
  is a fixture in this test and is qualified separately on the actual installation.
- `bash install.sh --takeover --retire-legacy tdev:<verified-run-digest>` completed against the
  existing private schema-3 installation, followed by a no-argument `bash install.sh` and
  `bash install.sh --check`. Both services were UP, controller bundle/arguments matched,
  native-cgo tunnel identity matched and control-plane polling succeeded.
- Real scoped process recovery: controller PID 24402 was killed and recovered as PID 7011;
  tunnel PID 24568 was killed and recovered as PID 7166, with final live checks passing.
  Recovery evidence is retained in resident-acceptance.json under the installation root.

Installation root remains
`/data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8/`.
Existing config/state/project enrollments and authentication were retained. The live service
markers bind installation `5319069b4e6a4fe2bd5b0d43c553cc78` and launcher hashes. The former
manual controller and managed Tunnel alias tdev-development were stopped. The same remote
Tunnel identity now runs directly under the tdev-tunnel runsv service. No second tmux runtime
or live tdev-oai-tunnel alias is used.

The legacy Node tdev service, its release-control-tdev-epoch3 helper, and the two already-DOWN
historical tdev-agent registrations were verified by their executable paths and removed from
the live service graph. Their directories/receipts remain under retired-services outside that
graph. User projects, historical private state, other Termux services and canonical Git refs
were not removed or published. Shared termux-services and its monitor were reused, not replaced.

The controller advertises the same nine public tools. Service administration remains local to
the operator installer; no installer/config/credential-management MCP authority was added.
This qualifies resident operation of tdev, not persistent authored development environments,
arbitrary project deployment, Android reboot startup or host acceptance of every tool.

Final installed bundle:
`87412906077b744eeb9f7549ad401bee997acc35692d3a26941d3bbd2d11d35c`.
No-argument install completed with controller PID 18946 and native-cgo Tunnel PID 19011;
subsequent `--check` passed with controlPlanePoll=true. Authenticated HTTP on port 8765
returned 200 and exactly the expected nine tools. The isolated real-runit rehearsal was
repeated against the final source and passed all listed lifecycle/recovery checks.

Final `sh scripts/check.sh`: **112 tests, OK (144.297s), exit 0**, including whitespace
verification, against the final service ownership/rollback implementation. `bash -n install.sh`
and post-documentation `git diff --check` also passed. No canonical push was performed.

## Persistent environments and processes — 2026-09-21

- Product remains on the user-authorized 0.1 line; executable revision is 0.1.4 from
  src/tdev/__init__.py. Nine tools remain; exec adds mode/environment, validation adds
  environment, task adds resetEnvironment and inspection of outstanding snapshot processes.
- Focused `test_environments test_native test_contract`: **25 tests PASS**, 35.506s, exit 0.
- `sh scripts/check.sh`: **123 tests PASS**, 151.429s, exit 0, including git diff --check.
- New native checks cover actual venv dependency reuse across controller restart and operation
  retirement; fresh/private environments and different tasks; exact validation source checks;
  a real loopback HTTP server serving its old checkpoint during edits and validation; stdin,
  cancellation, close/retire and another writer's ownership; lost dispatch replay/deadline;
  bounded process admission and remote feature rejection; reset stop requirements, symlink
  rejection, lost response and crash after rename; sampled persistent disk budget.
- `scripts/check_mcp.py`: official @modelcontextprotocol/client@2.0.0, pinned 2026-07-28,
  nine tools, new input schemas advertised and calls PASS, exit 0.
- `scripts/check_codex.py`: installed Codex through explicit stdio adapter → local modern
  HTTP, discovery/native coding/reconnect/exact local publication/composition/cleanup PASS,
  exit 0. This fixture made no production changes.
- Persistent dependencies are task-scoped, mutable and explicitly resettable; source and HOME
  remain per-operation. Process mode is fixed-snapshot development execution, not hot reload,
  PTY debugging, resident deployment or a new OS isolation boundary. Cross-task dependency
  sharing and authored-project deployment remain later work.
- Authorized `bash install.sh` updated the existing owned installation, exit 0. Active bundle:
  `75730adcd31762a2672958a3f0e7659ebcd22432012541c5e9144990b2bfa7cb`.
  Controller reported 0.1.4, PID 15907; native-CGO tunnel PID 15918, controlPlanePoll=true,
  recoveryMonitor=true. Existing root, configuration, state and Tunnel identity were reused.
- Live authenticated HTTP MCP acceptance on the installed controller: nine-tool discovery with
  process/environment schemas; managed task start; dependency marker reuse across commands;
  process with no deadline; edit and command while it remained running; snapshot identity and
  bounded task frontier PASS. Task `f3375fcce55c4b53892f1f6548924edd`, process operation
  `0d155254709c40858a0c1ab415434415`. All three execution operations were stopped/retired,
  task closed, environment reset and absent owned-ref cleanup completed. No source publication
  was performed. This is installed loopback MCP acceptance plus Tunnel control-plane health,
  not a claim of a new ChatGPT-host invocation.
- The first temporary live probe omitted the required Accept header and received no JSON
  response before any task admission. Correcting that probe header completed the acceptance;
  credentials and product code needed no repair.
- Final `bash install.sh --check` PASS, exit 0: both owned services UP with the same
  bundle identity and successful control-plane polling. Outstanding running/unknown operations:
  zero; probe dependency directory and maintenance fence absent. Local canonical source HEAD
  remains `e7124860dfb6e014b4943ee0614a350987393a47`; changes remain uncommitted/unpublished.

## Native project deployment — 2026-09-21

- The user explicitly authorized source commit/push and continuation into deployment. The
  accumulated 0.1.4 work was committed as `1f3edb690ab93db3f5e22b34cf2b453353c118e3` and
  pushed without force to origin refs/heads/tdev. Remote readback matched that exact commit.
- The next executable revision is 0.1.5, still inside the authorized 0.1 line. tdev_deploy adds
  the tenth tool: delegated native Termux source-release deploy/inspect/log/start/stop/update/
  rollback/remove. Artifact/dependency packaging and other runtime adapters are not claimed.
- Initial deployment/contract/HTTP/admin focused run: 26 tests PASS, 60.375s, exit 0.
- Official MCP SDK probe PASS on 2026-07-28 with ten tools. Installed Codex adapter probe PASS
  for ten-tool discovery and existing native coding/reconnect/publication/composition/cleanup.
  Its installed Tunnel plugin was discovered and only its read-only runtime list was called.
- Real isolated runit rehearsal passed validated release and HTTP release-header identity,
  supervisor crash recovery, controller reconnect, update/rollback, deliberate DOWN across
  shared-root recovery, readiness failure restoration and data-preserving removal. No live
  shared-service graph was touched by that rehearsal. Initial runs exposed transient supervisor
  control timeouts and an early PID-file read during root recovery. The rehearsal now waits
  for a new healthy graph and, when recovery remains unknown, observes the original operation
  to finish restoration instead of reissuing the release. Unproved recovery is never success.
- An initial full 137-test run failed only the CLI adapter's obsolete nine-tool assertion.
  It was updated for ten tools, and its focused test passed (5.135s). Further cleanup tests
  verify that changed source cannot start but does not prevent stopping/removing owned services.
- Final focused deployment/contract/admin/adapter run: **23 tests PASS**, 27.379s, exit 0.
  The final isolated runit rehearsal again reported every acceptance dimension above as true.
  A subsequent full-check attempt was interrupted before a terminal test summary; it is not
  counted as a pass and was rerun after resuming the session.
- Resumed full run: 139 tests in 355.691s, one failure in the existing unrelated-operation
  concurrency test. Its first status read assumed `true` had already exited. The fixture now
  waits for terminal executor receipts without reconciling the controller, then still proves
  the second reconciliation completes while the first is blocked. Focused test PASS, 3.723s.
- Final `sh scripts/check.sh`: **139 tests PASS**, 411.615s, exit 0, including diff whitespace
  validation. No runtime code was changed to make the concurrency fixture pass.
- Authorized `bash install.sh` updated the owned resident installation, exit 0, to bundle
  `c375fa9707d83ff9c210c1eb07442b71a7b5266a47a5ff77193f6eec98378102`.
  Controller 0.1.5 PID 16551 and native-CGO tunnel PID 16565 were UP; controlPlanePoll=true
  and recoveryMonitor=true. Existing configuration, state and Tunnel identity were retained.
  The operator CLI delegated target `termux` with the `tdev-app-` prefix to existing principal
  `owner`; it starts no service and changes no project/provider credential grants.
- First installed acceptance reached the inherited fixed 300-second validation deadline
  before the full tdev suite completed. It correctly failed with timedOut=true/stopped=true;
  no deployment was admitted. Validation was retired, task closed, environment reset and
  absent owned ref cleaned. Outstanding operations returned to zero.
  `tdev_validate` now accepts the same bounded timeout range as command execution (1–3600s,
  default 300); existing launch machinery already binds it into the immutable execution intent.
  Adopted validation command/source checks are unchanged. Explicit timeout/failed validation
  plus contract checks: **4 tests PASS**, 7.315s, exit 0.
- Deadline contract was installed through the same owned update path, exit 0; active bundle
  `56d6c26b4672bd5f6054256d60f115c7a551760afa0997fe7be1fbfbb7b1797f`.
  Controller 0.1.5 PID 7454 and native-CGO tunnel PID 7703 were UP with controlPlanePoll=true
  and recoveryMonitor=true. Final official MCP SDK probe again passed ten-tool discovery/call.
- Final `sh scripts/check.sh` including the deadline contract: **140 tests PASS**, 402.384s,
  exit 0. This supersedes the earlier 139-test qualification for the final source tree.
- The next installed validation completed the old 123-test suite in 334.613s without a
  timeout, but failed its aggregate-environment-budget fixture: one sparse 2GiB file exceeded
  the outer native runner's 128MiB per-file limit. No release was admitted; task/environment/
  validation cleanup completed. The fixture now uses sixteen sparse 128MiB files plus one
  byte, preserving the real 2GiB aggregate-limit check. Focused test PASS, 3.096s, exit 0.
  Final installed acceptance imports the complete current implementation diff before running
  the adopted `sh scripts/check.sh`, rather than validating the older published implementation.
- An intermediate nested run correctly stopped with DISK_LIMIT because the budget fixture
  also exceeded its outer operation's aggregate allowance. The fixture executor now uses an
  independent, automatically cleaned host temporary spool, while retaining native per-file
  and aggregate checks. Product resource limits were not relaxed. The affected environment
  suite passed **11 tests**, 48.743s; stopped validation/task/environment cleanup completed.
- Final installed authenticated MCP acceptance, exit 0: imported the complete current
  runtime/contract/test diff and a disposable HTTP app, then ran the adopted `sh scripts/check.sh`
  with timeout=1200. **140 tests PASS**, 306.231s, plus app compilation and diff checks;
  validation `a597e42b4e0e40afb2373b740291e9ba` exited 0 for exact candidate
  `773403428b4752962390bc8f3d7ef900f0959239`.
  Deployment `005c4ca6cab54dbf354e30e58e908227` released
  `7806cfc2cfcadf12f22e169c187951b08f335d84e2338a254424ef55deddd3f3`.
  Actual HTTP release-header/body identity, stop, restart, renewed readiness and removal passed.
  Final deployment revision is 4/removed; its service directory is absent. Validation retired,
  task closed, dependency storage reset and absent owned-ref cleanup completed. Releases, logs,
  data and operation receipts remain intentionally retained. No probe source was published.
- Final `bash install.sh --check` PASS, exit 0: 0.1.5 controller and native-CGO tunnel UP,
  controlPlanePoll=true. The active bundle's full file digest equals the current repository
  runtime/contract/dependency bundle. Outstanding running/unknown operations: zero; maintenance
  fence absent. This is installed loopback MCP acceptance and Tunnel health, not a claim of
  a new invocation from the ChatGPT host.

## Continuity and Android feasibility review — 2026-09-22

Investigation and documentation only. No product code, wire schema, installed runtime, provider,
credentials or device permissions changed. This section records evidence and design reasoning;
selected semantics belong in ARCHITECTURE, execution order in IMPLEMENTATION_PLAN. The user
explicitly requested documentation updates in addition to reviewing the supplied hypotheses.

### Current authoritative state and actual gaps

Fresh local branch `tdev`, HEAD and remote `refs/heads/tdev` readback both
`758ef37eaa164370d94486b247f1bd8bdbd1cb62` in `humtr/tdev`. Entry WIP was the previously
requested packaging plan in IMPLEMENTATION_PLAN.md; untracked `.artifacts/` and `node_modules/`
were preserved. AGENTS/README navigation, relevant ARCHITECTURE and plan, tool schemas,
server ingress and workspace/task/operation/deployment implementations were reread. The
canonical source implements ten tools; no note/artifact/resource tool is currently advertised.

| Capability | Finding in current source |
|---|---|
| Workspace/project/task/checkpoint | Implemented in `store.py`, `workspaces.py`, `core.py` and Git; workspace membership/defaults and isolated source tasks are durable. |
| Intent/result/effect certainty | Implemented operation IDs, request replay, retained intent/result and unknown-effect handling; `operation` observation/control is independent of transport reconnect. |
| Validation/publication/deployment | Implemented exact source validation/publication and native HTTP-service deployment/recovery. Dependency/build packages remain planned. |
| Processes/dependencies/cleanup | Implemented supervisor identities, outstanding process discovery, task environment reuse and cleanup after close. A retained environment is mutable, not an attested dependency artifact. |
| Current external state | Partial bounded observations; provider errors/uncertainty are explicit. Workspace inspect is not a complete atomic view of every deployment/process/provider. |
| Semantic meaning | Project purpose/design/plan survive in repository documents. Public/store state has no general current objective, objective-change history, decision rationale, blocker or cross-conversation capsule. |
| Host/resource access without a task | Workspace/deployment listing is source-free, but arbitrary native filesystem/process/toolchain inspection has no source-free public adapter. Native exec already has app-UID power but requires source-task context. |

`server.py` requires protocol/capability `_meta`, verifies matching HTTP method/name/version
headers, and authenticates a Bearer principal. Extra metadata can be present, but tools dispatch
passes only principal, name and arguments to `controller.call`; `openai/subject` and
`openai/session` are not preserved. Request logging is suppressed. No current request metadata
capture proves those fields are present or absent in today's ChatGPT requests. Transport
`MCP-Session-Id` is not a semantic identity owner in this implementation.

`store.py` has workspace, workspace_project, task, operation, project and deployment tables,
not semantic history. Task inspect reconciles busy work/processes and reads remote state;
deployment inspect can restore an interrupted release. Therefore calling all existing inspect
actions is not a safe substitute for a strictly observational resume envelope. This review
read source rather than invoking those recovery-bearing production paths.

The plan's fresh-session requirement is implemented for bounded material task recovery, not
for reconstructing lost intentions or a whole multi-project objective. The review corrects the
plan's overbroad one-frontier wording; it does not infer a new planner from “next admissible
action.” Exact problem: a fresh model can discover what happened but often must ask/research
again to learn why, which objective is current and which next work is useful.

### Local Codex: observed persistence and public implementation

Installed `codex-cli 0.155.1`, native Android arm64 executable; selected profile
`.codex-profiles/wrlab`. Read-only SQLite connections used `mode=ro` plus `query_only`; output
was limited to schema, counts and JSON key/type/array-size metadata. No auth files, token/key
values, prompt text or raw tool output were printed. No Codex resume/compaction was triggered.

- `thread_history_1.sqlite` contained 91 `contextCompaction` items at observation. Recent item
  objects had `type` and `id`; this UI/history item alone is not the compaction payload.
- Projection state tracks rollout byte offsets/ordinals. This supports treating this DB as a
  history projection/index, not assuming it is the sole resume authority.
- Two recent tdev rollout files were inspected by event shape. One contained five `compacted`
  events; the other none. Recent compacted records included `replacement_history`,
  `guardian_history`, `retained_context`, window identities/number, compaction response identity
  and latest token-usage metadata. Replacement-history lengths were 33, 40 and 44 items in
  the three sampled checkpoints; raw history still existed in the rollout. These are observed
  structures, not an attempt to decode private model reasoning or encrypted content.

The matching public version tag's [compaction code](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/core/src/compact.rs)
builds a replacement model history from bounded user messages and a summary and installs
persisted compaction metadata. This is model-context compaction, not SQLite VACUUM or deletion
of all original history. Its [rollout reconstruction](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/core/src/session/rollout_reconstruction.rs)
selects a surviving replacement-history checkpoint and replays its suffix, accounting for
rolled-back segments. The [context manager](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/core/src/context_manager/history.rs)
separates working history and retained context/review history and tracks history revisions.
These are version-tag source observations, not proof that the installed executable has an
identical build hash or that every session uses the same compaction path.

Conclusion: worktree/Git is source truth; rollout plus installed compact checkpoints and
subsequent events reconstruct model history; DBs support durable session/history discovery
and indexing; current tools/OS/providers still determine current effects. Neither Git alone,
a `contextCompaction` DB row alone nor a summary alone recreates complete continuity. Reusable
principles are bounded working context separate from retained evidence, atomic revision-bound
replacement and suffix preservation. Codex's private formats/guardian/window internals are not
requirements for tdev. MCP cannot own the host's turn scheduler, full transcript, compaction
trigger or next model input in the way the Codex client does.

### tmcp: evidence, not reference architecture

Local tmcp HEAD `ce3f2a78c98853fba06e4ec1a3b21955283ca4b9` was read without modification or
live probes. Its current `docs/REFACTORING_EXECUTION.md`, relevant plan and `src/mcp.ts` are
historical evidence, not tdev authority. `sharedIdentityDigest` reads bounded subject/session
metadata and hashes the pair; deterministic `tests/shared-mcp.test.ts` supply fabricated values.

| Evidence class | What the records establish | What they do not establish |
|---|---|---|
| Recorded direct ChatGPT call | T-OTP-4 ledger explicitly records a real ChatGPT caller unable to complete elicitation; no grant was created. | Successful post-repair conversation reuse, or today's tdev metadata values. |
| Scripted live public/local probes | T-OTP-6 ledger reports fixed-ngrok/local session bootstrap, consumption, same-conversation reuse and cross-conversation rejection. | That those successful probes originated in ChatGPT rather than the scripted client. |
| Deterministic tests | Metadata parsing/digesting and grant behaviour for constructed inputs. | Host delivery, actual conversation semantics or live user experience. |
| Explicit open acceptance | Ledger still lists foreground clipboard proof and direct ChatGPT retry as remaining. Later Bearer restoration reports local/public auth probes, not closure of that acceptance. | A completed direct ChatGPT OTP/session lifecycle. |

No retained raw direct-host metadata trace was established by this bounded review. The evidence
does not justify “ChatGPT always sends these keys.” Nor does an old implementation justify
copying OTP/conversation grants or root tasks. The tmcp ledger's numerous task/gate/authority
layers are a warning: extracting the failure cases is useful; importing its workflow is not.

### Candidate comparison and selected minimum

| Approach | Benefit | Cost/failure | Verdict |
|---|---|---|---|
| No new subsystem; docs + current task/operation inspection | Already works for durable shared design; zero new state. | Ephemeral intent across conversations requires repeated reconstruction or repository handoff edits. | Keep as baseline/fallback, insufficient alone for the requested UX. |
| First-call bootstrap | One early intent snapshot. | Server cannot see the user prompt; first call may precede understanding; later goal changes are missed. | Optional model contribution, never a gate or automatic inferred intent. |
| Semantic payload on every tool call | Frequent capture. | Repetition, stale claims, tokens, schema pollution, writes and additional failure coupling. | Reject. |
| Explicit semantic sync tool | Clear boundary and optional failure. | Extra public concept if all state already belongs to workspace context. | Keep sync semantics, use workspace actions initially. |
| Existing workspace action with compact state | Few concepts, multi-project context, revisioned selection. | Requires the model to remember useful boundaries; uncaptured meaning cannot be recovered. | Selected initial design. |
| Hybrid event journal plus compaction | Recover intermediate decisions and compact long histories. | More storage, replay/retention/suffix rules and summary risk before benefit is measured. | Defer; add only if note/revision trials expose a real loss. |
| Full transcript/local-attached mode/private Codex DB dependency | Superficial similarity to another client. | MCP lacks full host context; doubles workflow/truth and couples private formats. | Reject. |

The selected design is [ARCHITECTURE's optional semantic continuity](ARCHITECTURE.md#optional-semantic-continuity):
workspace resume notes, a separate two-table sidecar, bounded revisioned model-authored state,
typed references and targeted fresh observations. It deliberately omits a distinct logical
thread owner/event taxonomy at first. Content is lossy working context, not an audit transcript;
decisions that must be normative still belong in their existing repository owner.

### Capability comparison and practical ceiling

| Capability | Local Codex pattern | ChatGPT + proposed tdev notes |
|---|---|---|
| Same-conversation continuation | Client retains model history and schedules calls. | ChatGPT owns this; tdev provides current tool results and optional recalled intent. |
| Context-window compaction | Client installs replacement history and resumes after its boundary. | Cannot replace ChatGPT's window; model can write/read a bounded note at useful boundaries. |
| Fresh-session recovery | Durable rollout/checkpoint reconstruction plus fresh tool state. | Candidate discovery + chosen note + relevant current material reads; no full transcript recovery. |
| Multiple conversations | Client-specific thread/resume/fork behaviour. | Workspace note identity is independent of conversations; concurrent updates require CAS. |
| Tool/effect recovery | Tool-specific current evidence still matters. | Existing tdev operation/supervisor/deployment recovery remains the owner. |
| Material reconciliation | History does not make current files/processes immutable. | Rebind references, observe unknowns, enforce current grants/CAS/policy as before. |

Meaningful cross-conversation recovery is feasible without full history, but equivalent recall,
host-controlled compaction and guaranteed automatic bootstrap are not established. The upper
bound is the quality of information the model actually records and later retrieves. No measured
token savings or fresh-ChatGPT success rate is claimed yet; the plan includes paired baseline
and note-enabled trials including update/rebind overhead and model variance.

### Failure and tmcp-regression audit

| Risk | Minimum prevention selected |
|---|---|
| Authority pollution / semantic permission | Prose is recollection; existing current authentication/admission/validation owns effects. |
| Duplicate HEAD/PASS/deployment truth | Typed references only; current evidence remains in its owner and is returned separately. |
| Workflow creep / recursive planner growth | No mandatory note, campaign, root task, semantic gate, decision owner or second development mode. |
| Context pollution / stale assumptions | Current objective replaces old one; dated assumptions, brief evidence-linked rationale, rebind relevant changed facts. |
| Per-call model overhead | Meaningful-boundary updates only; ordinary tool contracts/results remain unchanged. |
| Excessive storage | Bounded capsule/revisions, no transcript/stdout duplication; explicit limits/forget. |
| Wrong attach / authorization leak | Candidate discovery then model selection within current grants; metadata cannot authenticate or force attachment. |
| Host dependence | No session keys required; names/defaults/handles work on any supported client. |
| Compaction hallucination | No current-fact authority in summaries; revision CAS, source references and limited optional history, no silent loss of later updates. |
| Sidecar failure | Lazy isolated semantic storage; core does not open it; deleting it leaves product state/cleanup intact. |
| Too many durable owners | Two semantic tables own recorded text/replay only, not tasks, effects, decisions or permissions. |

Residual risk remains model omission/misinterpretation and host failure to invoke resume. It is
addressed by real-host acceptance and concise tool guidance, not another enforcing workflow.
Implementation placement, proposed actions/fields and falsification matrix are in the existing
architecture/plan owners, not a new review authority.

### Android inventory, feasibility and limits

Read-only local inventory: Android **16**, API **36**, `arm64-v8a`; current native process
UID **10379**, SELinux domain `untrusted_app_27`. This is ordinary Termux app authority, not
system/root or ADB shell. JDK **21.0.12** is installed. `aapt`, `aapt2` (**16.0.0.4-1**) and
`zipalign` are installed Android arm64 ELF tools. `termux-api` CLI package **0.59.1-1** is
installed; this alone does not prove the compatible Android add-on or its grants are usable.
`gradle`, `sdkmanager`, `d8`, `apksigner` and `adb` were not on PATH. Standard checked SDK
locations (`$PREFIX/opt/android-sdk`, `$HOME/Android/Sdk`) and `$HOME/.gradle` were absent.
This bounded check does not rule out project wrappers or tools in other locations. No toolchain,
APK, private key or companion was installed/created and no screen/sensor/clipboard was read.

On-device Android building is **plausible and practical to qualify**, not already verified for
arbitrary projects. Existing native resource tools and JDK remove obvious prerequisites, while
a compatible Gradle/AGP/platform/D8/signing chain and its host executable requirements still
need qualification. The official [Termux apksigner recipe](https://github.com/termux/termux-packages/blob/master/packages/apksigner/build.sh)
provides a Java-based signing route. A bounded future build must pin exact tools and record any
Termux-native replacement; incompatible native/NDK tooling may require an explicitly selected
other host. Neither “all Android projects build here” nor “a remote host is always required”
is supported by this inventory.

Android's [command-line build documentation](https://developer.android.com/build/building-cmdline)
distinguishes APK signing with apksigner from AAB signing with jarsigner/Gradle and generating
installable APKs from bundles with bundletool. Thus APK/AAB is a concrete requirement for generic
artifact production, not a reason to make every artifact a service or installable file. Preserve
final-byte validation, signing provenance and build-host/target separation now; qualify actual
APK/AAB production without waiting for UI control.

| Android interaction | Feasibility and boundary |
|---|---|
| Termux alone | Its permitted filesystem/process/network and exposed Android interfaces; no generic cross-app private-data or arbitrary UI authority. Android applies its [app sandbox](https://source.android.com/docs/security/app-sandbox) to native processes too. |
| Termux:API | Selected device APIs through the add-on and CLI, with required permissions and compatible signing. The [official app](https://github.com/termux/termux-api) requires matching Termux signatures; package presence is not live permission proof. |
| Optional companion | User-enabled [AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService) can expose window content/actions/gestures subject to capabilities and app support. Secure windows can reject screenshots. This is a feasible observe/act/observe substrate, not universal control. |
| Screen / notification / clipboard | Separate Android capabilities, not implied by Accessibility. [MediaProjection](https://developer.android.com/media/grow/media-projection) requires consent per capture session; [clipboard access](https://developer.android.com/about/versions/10/privacy/changes#clipboard-data) has foreground/default-IME restrictions. [Notification access](https://developer.android.com/reference/android/service/notification/NotificationListenerService) also requires its own user-enabled service. |
| Beyond ordinary apps | Companion alone does not read other apps' private data, override protected UI or provide root-only system management. [Shizuku](https://github.com/RikkaApps/Shizuku) delegates an explicitly started ADB/root service and documents limits of ADB authority; [Device Owner](https://developer.android.com/work/dpc/dedicated-devices) is a separately provisioned management role. These are optional future adapters, not substitutes for existing grants. |

No IPC/API architecture or Android-use implementation is warranted now. Preserve authenticated
optional adapter boundaries and independent core failures. Runtime/resource control shares
identity, freshness, provenance and recovery vocabulary with continuity, but needs neither its
DB nor its summaries. The important packaging omissions were artifact export, non-service
outputs, build-vs-target platform and final signed-byte identity; speculative device frameworks
would not resolve them more cheaply.

### Review verdict and next work

There is sufficient value to implement a small **optional resume-note trial**, not evidence to
implement the entire proposed history/compaction subsystem. Use meaningful-boundary model sync
through workspace actions, not a new continuity tool or per-call metadata. Full history is not
needed; current-note rewriting is the initial compaction mechanism. Session keys are optional
provenance only. Multiple source tasks can reference one workspace note; no second work mode.
Independent storage permits the entire context feature to disappear without losing material
state. tmcp-style expansion remains a risk only if these explicit boundaries are relaxed.

The best value/complexity scope is bounded notes, revision CAS, candidate discovery, targeted
fresh state and real-host recovery measurement. Codex-like useful resumption is a testable goal;
Codex-equivalent context control is not an MCP-server capability. Android APK/AAB requirements
are explicit; current on-device feasibility is conditional, generic Android-use is insufficient
with Termux alone, and a separately authorized companion is a realistic later option. Core
development needs none of these optional Android components.

Proceed with generalized packaging, then minimum notes, then the complete journey qualification;
source-free resource inspection and demanded Android/external adapters follow. Only a concrete
blocking prerequisite may move earlier. Detailed slices/acceptance are recorded in
[IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md#deployment-packaging-implementation-plan).

### Checks for the documentation review

- Focused `test_contract.py`: **3 tests PASS**, 1.811s, exit 0.
- `sh scripts/check.sh`: **140 tests PASS**, 237.316s, exit 0; diff whitespace check passed.
- Local documentation link targets exist. Only README, ARCHITECTURE, IMPLEMENTATION_PLAN and
  this evidence file changed; existing packaging WIP and unrelated untracked state were preserved.
- These checks verify existing regressions/document consistency, not implementation or measured
  acceptance of the proposed notes, artifact packaging, Android builds or companion. No new
  direct ChatGPT metadata/resume acceptance, Android build or production activation was run.

## Packaging recipe and identity foundation — 2026-09-22

Implemented the first packaging slice in the development checkout after the approved review;
product patch version is 0.1.6. Canonical base remains `758ef37eaa164370d94486b247f1bd8bdbd1cb62`
until publication. Prior review/packaging document edits and unrelated untracked state remain
preserved. This slice is recipe inspection and identity validation, not a completed package builder.

- Added `tdev_artifact inspectRecipe` as the eleventh tool. It reads an exact successful source
  candidate and current adopted policy without dispatch/recovery, downloading dependencies,
  requiring a service target or creating an operation. Native/HTTP tests prove frozen-source
  inspection survives later edits, task close and controller restart; maintenance permits it.
- Recipe/manifest checks cover strict JSON, bounded relative inputs/exports, content pins,
  public HTTPS input descriptions, build-vs-target requirements and conditional service launch
  metadata. APK/AAB kind acceptance is descriptive only, not Android toolchain qualification.
  The eventual sealer must verify real bytes; caller-provided manifest hashes do not prove builds.
- Source-only receipt checks are shared with publication and source deployment/start/rollback.
  Artifact-subject receipts and inconsistent candidate/stop/exit identities are rejected;
  earlier retained source receipts without an explicit subject remain usable. The adopted
  artifact-check policy defaults to source validation and can be overridden once in project
  policy; changing/removing the override changes the binding without stale policy inheritance.
- Initial focused run found three fixture errors (unknown principal expectation, omitted close
  checkpoint and aliased platform dictionaries). Corrected fixtures: **16 tests PASS**, 33.171s.
  Affected artifact/contract/deployment/project/HTTP/bridge/CLI suite: **53 tests PASS**, 139.448s.
- Pinned official `@modelcontextprotocol/client@2.0.0` probe PASS, exit 0: modern 2026-07-28,
  eleven tools, expanded inspectRecipe schema and genuine error call. No direct ChatGPT claim.
- Inactive bundle rehearsal first exposed stale pre-resident template assertions. Updated it to
  inspect the resident launcher and exercise staged `run_service` with synthetic settings and a
  mocked exec boundary. Final `scripts/rehearse.py` PASS, exit 0: bundle
  `df54e6d79a6e852ccdec4b2d38e2ac7fe874f7ce0a796c9f15e8d02d2407c2f1`, wrong-Bearer rejection,
  eleven tools before/after restart, native SIGKILL recovery, exact source publication and
  synthetic native tunnel argv/profile/health settings. No real tunnel or shared service started.
- One full regression run was interrupted before completion during the session transition;
  its partial log is not PASS. The complete final rerun is recorded below.
- Final `sh scripts/check.sh`: **152 tests PASS**, 400.740s, exit 0, including the source
  receipt compatibility assertion added after the affected run. Final diff whitespace check
  passed. This validates the recipe/identity slice and existing paths, not retained builds.

Remaining: supervised retained builds/sealing/recovery, artifact verification and export/prune,
Python dependency layout and packaged release integration. Public prepare/validate-artifact/
export actions are intentionally absent until their implementation. The resident installation
still exposes its previous bundle; no production activation, commit or push occurred in this slice.

## Retained native builds — 2026-09-22

Extended the same unactivated 0.1.6 checkout with `tdev_artifact prepare/list/inspect`.
Existing operation intent/result/request identity owns builds; one artifact pin table joins
completed build operations to retained content digests. No new planning/workflow owner.

- Actual native fixtures build declared file outputs from frozen validated source, while edits
  and task close proceed independently. Reconnect and lost-dispatch replies reuse the original
  process; operation retirement removes scratch and leaves independently verified retained bytes.
  HTTP and staged-bundle fixtures exercise prepare/inspect/retire without deployment targets.
- Negative cases cover source mutation, undeclared output, symlinks, hardlink rejection, missing
  exports, case aliases, size limits, dependency hash mismatch, stored-byte tampering, changed
  authority/policy/tool/platform, cancellation/deadline and forged stdout. On this Android domain
  actual hardlink creation is denied by the OS; the file-reader's link-count rejection is also
  exercised with a deterministic stat fixture. Do not infer kernel isolation from these tests.
- Deterministic HTTPS response fixtures cover pinned public acquisition and redirect refusal;
  retained distribution capture/recheck is separately exercised. No real third-party dependency
  download or whole transitive package-manager build is claimed here. Build tools/host network
  are not hermetic; dynamic libraries and SDK data are not fully attested.
- Injected copy failure (ENOSPC-shaped OSError) and lost SQLite completion after object rename
  recover by verification/sealing without another build. A pre-reservation dispatch failure
  remains unknown, visible outside paged history, cannot be retired without proof, and counts
  against the eight-build bound. This is not an exhaustive SIGKILL test at every seal instruction.
- Initial focused runs exposed unnormalized symlink errors and native missing-job log errors
  leaking into the output-success schema. Fixed both. A fixture now distinguishes Android's
  hardlink syscall denial from capture rejection. Final affected artifact/build/HTTP/contract
  suite: **30 tests PASS**, 104.866s, exit 0.
- Official MCP SDK 2.0.0 probe: PASS, exit 0; modern 2026-07-28, eleven tools, all four artifact
  action schemas and an actual error call. No direct ChatGPT acceptance claim.
- Inactive bundle rehearsal: PASS, exit 0, bundle
  `4b68f03f856dbfca839ff84f592372365b4a6ec2b0173cc18828d33dde6d19e1`.
  Staged HTTP server passes authorization, native SIGKILL/restart and exact source publication,
  then builds retained output after task publication/close and rechecks it after scratch retirement.
  Controller/tunnel service-template checks remain synthetic; no shared service/provider changed.

Next is slice 3's concrete relocatable dependency/runtime fixture, then artifact validation and
release integration. Export/prune, operator-configurable artifact budgets, signed outputs,
APK/AAB qualification and installed build acceptance remain outstanding. No commit, push or
resident activation is included in this slice. Full regression outcome is recorded below after
completion; partial progress is not a PASS.

Final `sh scripts/check.sh`: **162 tests PASS**, 428.011s, exit 0; diff whitespace check
passed. The full suite includes existing deployment/recovery/resident-installation/source/
workspace regressions. Local documentation targets also resolve. These are checkout and isolated
fixture results, not activation or direct ChatGPT acceptance of the new installed tool surface.

## Pure-Python layout and runtime compatibility — 2026-09-22

Implemented packaging slice 3 in the same unactivated 0.1.6 checkout. The project-owned
`examples/python-package` recipe installs fixed wheel inputs into a new artifact-local layout;
there is no copied live venv or new Python package-manager authority. The shared internal runtime
helper verifies retained bytes and declared host requirements and returns launch inputs for the
existing supervisor architecture. It does not activate services or add a second process lifecycle.

- Service `inspect` now reports current runtime compatibility separately from retained-byte
  integrity. Optional `service.runtime.files` pins explicit host files such as shared libraries.
  Missing/changed platform, executable or file requirements never trigger install/rebuild;
  inspection, historical success and scratch retirement remain usable. Scratch inside retained
  storage and overrides of runner-owned HOME/cache/environment paths are rejected.
- The example uses no-index/no-deps/hash-checked binary installation from selected inputs,
  disables bytecode, and invokes an artifact-relative launcher with Python `-I -S -B`. It does
  not process `.pth` files or inherit host site-packages/PYTHONPATH. Generated pip wrappers are
  discarded; deterministic fixtures exercise console-entrypoint metadata, package data, a
  generated asset, relocated paths, external data writes and missing dependency failure.
- Four deterministic runtime tests use a source-pinned synthetic wheel and real native pip/
  build/runtime execution without registry access. The fixture wheel remains a frozen source
  input; the independent live rehearsal below exercises the public dependency acquisition path.
- An initial fixture omitted the existing `resetEnvironment.expected` field; corrected the
  fixture, not the product's checkpoint semantics. Also removed an imported test class from
  module discovery to avoid duplicate test execution. Final affected artifact/runtime/build/
  contract suite: **28 tests PASS**, 56.590s, exit 0. Added scratch-scope and reserved-environment
  assertions then ran the two affected tests: **2 PASS**, 5.340s, exit 0.
- Opt-in `scripts/rehearse_python_package.py`: PASS, exit 0. Actual public distribution
  `packaging-25.0-py3-none-any.whl`, SHA-256
  `29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484`, was fetched through the
  production acquirer. Two independent builds produced identical artifact digest
  `1ad2e8138b167f0a8bb892c0c74fa608457d1bd4ad0865dce5b95f05c9ea194b` in that fixture.
  After task/environment cleanup, removal of development/native build directories and package
  relocation, the app imported retained packaging 25.0, read its generated asset and wrote
  only external data. Post-run retained-byte verification passed; 11 selected host-library
  requirements were checked. No runit service, deployment target or resident runtime changed.
- This measured equality applies to the selected fixture and host. It is not a universal
  reproducible-build claim. Native extensions, editable/.pth-based layouts, entire stdlib/pip
  implementation, unlisted system libraries/future dlopen inputs and OS state remain outside
  this qualification. Actual network isolation was not asserted; launch uses no acquirer or
  package manager, but native commands retain host network authority.
- Official MCP SDK 2.0.0 probe: PASS, exit 0, modern protocol 2026-07-28 and eleven tools.
  Documentation link targets and diff whitespace checks passed. No direct ChatGPT acceptance,
  commit/push or installed activation was performed.

The next slice is artifact validation and packaged release integration, reusing the checked
runtime helper before each verification/start/rollback. The pure-Python example is a finite
launch probe; it does not itself prove HTTP readiness or service recovery.

Final regression log from `sh scripts/check.sh`: **166 tests PASS**, 299.200s, ending in `OK`.
The process handle was unavailable after the profile/session transition, so its shell exit code
was not independently recovered. A fresh final `git diff --check` passed with exit 0; no test
failure or incomplete test run is being promoted to PASS.

Implementation references: [pip install flags](https://pip.pypa.io/en/stable/cli/pip_install/)
and [Python isolated/no-site invocation](https://docs.python.org/3/using/cmdline.html). These
explain the selected invocation; executed fixtures, not documentation alone, establish the
local qualification above.

## Artifact validation and packaged deployment — 2026-09-22

Implemented packaging slice 4 in the unactivated 0.1.6 checkout, continuing the accumulated
packaging changes on canonical checkout HEAD `758ef37eaa164370d94486b247f1bd8bdbd1cb62`.
No commit/push or production service/provider change was performed for this slice.

- Added artifact-subject validation through the existing tool/operation lifecycle. File artifacts
  run the adopted policy without a service target. Service artifacts execute their manifest
  entrypoint on a separate test port, prove HTTP release identity, run the adopted check, stop
  descendants and recheck disposable and retained bytes. Neither exit zero nor stdout is a PASS
  receipt. Source publication continues to reject artifact validation.
- Packaged release uses the existing deployment controller, ownership, revision CAS and switch
  recovery. It forbids command overrides and rechecks current source/artifact policy, content
  and runtime before taking down an existing service. Build/validation retirement and task close
  preserve deployability; changed runtime/content does not prevent stopping/removing an owned
  service. Writable application data stays outside the package.
- Artifact admission advances internal storage to schema 4; source-only state stays at 3. A
  dedicated regression rejects selecting a schema-3-only bundle after artifacts exist and then
  reopens the retained state successfully. This is not a product version change.
- Seven new tests exercise file validation after source close, current policy and receipt
  mismatch, forbidden command override, output mutation, deadline, early service exit, lost
  dispatch response/reconnect without resubmission, failed/interrupted deployment recovery,
  runtime/content preflight and old-bundle rejection. HTTP coverage executes a real native
  build → artifact validation → inspection → scratch retirement and preserves source publication.
- Final affected artifact-validation/runtime/deployment/HTTP/contract/admin suite: **39 tests
  PASS**, 134.312s, log ends in `OK`. The earlier profile's process handle is no longer available,
  so its shell exit code was not recovered. An initial fixture used a disallowed service prefix;
  corrected to the required `tdev-app-` namespace. One earlier concurrent runtime test exceeded
  its iteration-based polling budget; the shared fixture now uses a bounded 20-second monotonic
  deadline. Product deadlines were not relaxed.
- `scripts/rehearse_artifact_deployments.py` completed all assertions and printed its success
  record. It uses real native validation, the public pinned `packaging==25.0` wheel, generated
  app data and an isolated real runit graph: update while the old version serves, controller
  reconnect/rollback, supervisor SIGKILL recovery, failed activation restoring the old version,
  and stop/start/removal preserving application data. Source/build/validation scratch was retired
  before release. Rollback ran with the acquirer patched to reject any call; this proves no
  hidden reacquisition, not OS-enforced network isolation. The shared live graph was untouched.
  The earlier process handle was unavailable after the profile change; shell exit code was not
  independently recovered. This does not qualify shared runsvdir-root recovery or ChatGPT calls.
- Official MCP SDK 2.0.0: PASS, exit 0, protocol 2026-07-28, eleven tools and the advertised
  artifact validation variant. `scripts/rehearse.py`: PASS, exit 0, inactive bundle
  `0722a890de95bf836febd366ac939d9f410b8453ac92c1879185ff99c656ebb0`. Its authenticated HTTP
  path executes native crash/reconnect/exact publication, retained build, artifact validation
  and scratch retirement. Service/tunnel template checks remain synthetic; the resident
  installation was not changed.

Next is explicit retention/export/prune and configurable budgets (slice 5), then remaining
qualification/delivery. Android build/signing, native extensions, other package managers,
remote/container targets and installed artifact acceptance are not claimed by this fixture.
Final `sh scripts/check.sh`: **173 tests PASS**, 228.474s, **exit 0** (also captured in a durable
exit marker). Documentation file/heading links and final `git diff --check` passed. These results
qualify the checkout and isolated fixtures, not installed activation or direct ChatGPT acceptance.

## Artifact retention, bounded export and pruning — 2026-09-22

Implemented packaging slice 5 on the same uncommitted, unactivated 0.1.6 checkout. The separate
ChatGPT monitoring investigation remains deferred; no bounded-wait or host orchestration change
was included. No resident service, project provider, credential or operator config was changed.

- Added `tdev_artifact usage/export/prunePreview/prune` to the existing eleven-tool surface.
  Export returns bounded verified file pages and whole-file identity; it needs no HTTP service
  or destination-path grant. Usage is a bounded authorized metadata page with explicit unknown
  historical sizes; it does not claim total installation disk consumption.
- Current/previous deployment versions (including stopped services), pending verification and
  ambiguous switches prevent pruning. Pending builds retain their own capture and capacity
  reservation without blocking unrelated cleanup. Preview tokens
  are rechecked under the same lifecycle serialization as deployment admission/reconciliation.
  Source tasks remain independently editable. Historical success receipts now disclose their
  retained/pruned storage state; pruned receipts cannot reactivate the artifact.
- Retirement is journaled before an operation-owned rename/delete. Tests interrupt both rename
  and deletion, reconnect, preserve a newly built identical shared object, reject an untrusted
  tombstone symlink, and race release against prune. Removed service data and historical release
  copies remain untouched. There is no automatic GC or arbitrary-path deletion API.
- Operator packaging limits separately bound acquired bytes, output bytes/files, sampled working
  storage, deadlines, retained admission capacity and minimum retention age. Build reservations
  survive unknown dispatch and pending prune retains conservative capacity. No source-copy or
  task-dependency ceiling was disabled. Output/input/file ceilings remain the conservative format
  bounds; native budgets are not OS quotas or hostile-code isolation.
- Storage accepts schema 3/4/5, preserving old source and artifact rows. New artifact admissions
  mark schema 5; schema-3/4-only bundles are refused. A temporary legacy-schema fixture verifies
  additive metadata upgrade, explicit unmeasured bytes, subsequent verified accounting and
  unchanged retained content. Product line remains 0.1; no new major/minor release was declared.
- Initial affected build/validation/contract checks: **20 PASS**, 55.142s. Initial new retention
  suite had one test expectation failure: an undelegated principal correctly returned
  `PERMISSION_DENIED`, while the fixture expected `OPERATION_NOT_FOUND`. The fixture was corrected;
  product authorization was not relaxed. Subsequent affected suite: **41 PASS**, 242.925s,
  exit 0. Final retention/HTTP/contract suite: **20 PASS**, 100.501s, log ends in `OK`; its process
  handle did not survive session resume, so no independent shell exit code is asserted for it.
  Final metadata-upgrade/shared-page checks: **2 PASS**, 11.765s, exit 0. Final review then
  removed an overly broad pending-build deletion fence: it could prevent freeing disk space
  needed to recover a pending seal. A targeted lost-receipt/equal-content test checks cleanup
  followed by reconciliation from the independent native capture without rebuild. Those final
  pending-seal/protection checks: **2 PASS**, 10.595s, exit 0. Full regression was restarted for
  that final source revision; the earlier in-progress run is not its qualification evidence.
- Official MCP SDK 2.0.0 probe: PASS, exit 0, protocol 2026-07-28, eleven tools, new action schemas
  and usage call. Inactive `scripts/rehearse.py`: PASS, exit 0; tested bundle
  `8ba5e6a29cce4f409cb4dd8023cef5cca034f141bf0417077a488258c98c3edc` exercised authenticated
  HTTP/reconnect/exact source publication, artifact validation, export and explicit prune.
  Subsequent edits moved historical size measurement outside its SQLite transaction and clarified
  action descriptions. After the pending-build cleanup correction, the inactive rehearsal passed
  again with final bundle `80e92599b2c11459425569a4b8f4a2df605407132ba406a208a2c78a2164010d`,
  exit 0 (durable marker), including the same export/prune and HTTP/reconnect assertions.
- Real isolated `scripts/rehearse_artifact_deployments.py`: PASS, exit 0 (durable exit marker).
  Actual public `packaging==25.0` acquisition, artifact verification, update, reconnect/rollback,
  supervisor crash recovery, failed activation restoring the old release, and data-preserving
  stop/start/remove all passed. New assertions reject pruning an active package and export/prune
  it after removal while preserving app data. Its temporary runit graph was independent of the
  shared live graph. This is not direct ChatGPT or installed-runtime acceptance.

Remaining packaging work is slice 6 delivery/installed acceptance and final journey qualification.
Large-file transfer throughput, historical deployment-copy pruning, signed transformations,
APK/AAB/native-extension/other package-manager qualification remain outside this slice.
Final `sh scripts/check.sh`: **186 tests PASS**, 599.780s, **exit 0**, including
`git diff --check`. Both the completed process result and durable exit marker confirm success.
This run includes the final pending-seal cleanup correction and all 13 retention tests.

## Optional HTTP lifecycle diagnostic isolation — 2026-09-24

The lifecycle investigation first prototyped detailed HTTP recording, then adopted the user's
requirement that ordinary operation must not depend on the diagnostic layer. The current source
therefore defaults to `--diagnostics off`: no collector import, diagnostic storage, writer or
operator socket. Explicit `trace` enables bounded collection/export. Hooks isolate observer
exceptions from dispatch/response; failed optional startup is exposed in health without writing
a potentially blocking stderr notice. Core MCP contracts and retained-operation semantics are
unchanged. Automatic watch, runtime activation/expiry, incident delivery and policy mitigation
remain proposed in ARCHITECTURE; they are not claimed as implemented capabilities.

Evidence is retained under `.artifacts/lifecycle-forensics-20260924/`:

- `diagnostic-optional-health-focused.log`: **25 tests**, **52.420 s**, PASS. Includes HTTP
  compatibility, blocked/failed writer, active-stage snapshot, bad auth/body, serialization and
  socket failures, restart correlation, bounded rotation, export gaps, private paths, optional
  module absence, observer failures, and escaped Unicode IDs.
- `diagnostic-conditional-delivery/rehearsal-results.json`: inactive bundle
  `eddbb9cbe48395e609e0bb77bb022b97e2804249ac8f7c680f8c3911fa11d595` ran twice on disposable
  state/ports. Authenticated MCP and CLI exports passed; runtime instances differed while key,
  RPC and operation tags persisted. Exact bundle verification passed before/after execution.
- `diagnostic-conditional-delivery/off-results.json`: actual entrypoint with the diagnostic
  module unavailable still served health and all 11 tools in both default-off and requested-trace
  cases. Health distinguished `off` from `unavailable`; no diagnostic directory was created.
- `diagnostic-optional-delivery/benchmark-results.json`: pre-health-field candidate, alternating
  240 local status calls/path with concurrent test load; p50 baseline **6.589 ms**, default off
  **6.546 ms**, persistent trace **10.404 ms**. No sink drops/errors. This is a local smoke
  comparison, not statistical or ChatGPT visible-liveness qualification.

The bundle is inactive: no live active-pointer/service registration, config/provider replacement,
original diagnostic evidence cleanup or Codex live-state change. Resident identity is checked
separately. Export is bounded and non-atomic; server write success does not prove host receipt,
continuation or visible progress. Previous prototype results do not qualify the final source.

Final `bash scripts/check.sh`: **205 tests**, **622.036 s**, **PASS**, exit 0;
`git diff --check` passed. See `diagnostic-conditional-full.log`.

## Automatic diagnostics, expiry and response notifications — 2026-09-25

The user authorized implementation, remote commit/push and resident delivery, then selected
`watch` for the diagnostic operating configuration. Product version is **0.1.7**. New installations
still default to off. The implementation adds scoped `tdev_diagnostics` control/acknowledgment,
watch-triggered bounded capture, independent timer expiry, asynchronous bounded incident storage,
and compact notification offers in tool response text and metadata. It never cancels/retries work.

Scope and failure checks:

- Automatic slow-dispatch/dispatch-failure triggers, expiry without new calls, no lease extension
  on replay, stop cooldown, return to off/watch, private incident visibility, cross-principal ack
  rejection, bounded retention, restart interruption and retained acknowledgments.
- A blocked incident writer does not block expiry, inspect or ack. Persistence errors are exposed;
  corrupt/incompatible evidence is preserved. API output excludes raw arguments, logs and secrets.
- Lazy authorized activation from off; unauthorized activation does not create the runtime.
  Fresh diagnostic-grant revocation is enforced. HTTP and Local Codex bridge preserve alert offers.
- Config update/recovery uses the operator config lock plus expected-content checks. An injected
  crash restores the old bundle/config before service restart. A concurrent operator edit is
  preserved and leaves recovery evidence; rollback retains a compatible config receipt.

Evidence under `.artifacts/diagnostic-activation-20260925/`:

- `policy-final.log`: **9 tests**, **6.405 s**, PASS.
- `resident-config-lock.log`: **14 tests**, **4.294 s**, PASS.
- `mcp-sdk-alerts.log`: official `@modelcontextprotocol/client@2.0.0`, protocol **2026-07-28**,
  **12 tools**, authenticated call, notification text/metadata and acknowledgment PASS.
- `inactive-coding-rehearsal.log`: installed coding/build/validation/export/prune and restart
  rehearsal PASS on isolated state; no production/provider service changes.
- `final/watch-rehearsal.json`: exact staged bundle
  `54453e39389dedab29a945490110a53ff986173f52ac97de2e9628173113c399`, real server entrypoint,
  watch config, one-second manual capture, notification acknowledgment, automatic expiry,
  restart-preserved acknowledgment/key identity and local export PASS. Two process generations
  served the same verified package; no live service activation during rehearsal.

Local HTTP/SDK/bridge success is not ChatGPT UI qualification. Offers mean a response was prepared,
not received/rendered. Explicit ack records caller receipt, not visible surface delivery. There is
no unsolicited push/wake path in this request/response server. During an unavailable host channel,
retained incidents and subsequent response offers/inspection are the recovery path. Recent state
can still be lost before asynchronous storage completes; counters disclose pending/error status.

Final `bash scripts/check.sh`: **216 tests**, **664.561 s**, **PASS**, exit 0;
`git diff --check` passed. Log: `final/full-check.log`. The exact staged source above includes
both automatic diagnostic behavior and serialized config update/recovery. Production acceptance
is recorded separately after the authorized transition.

### Authenticated ChatGPT connector continuation acceptance — 2026-09-25

After Local Codex completed source qualification, commit `794129df1a82ba0672782dfcc40f033bbd9d3591`, push, and the installed-runtime transition, ChatGPT continued the explicitly authorized acceptance through the refreshed authenticated connector. This continuation changed no product source or tracked runtime configuration.

- Installed identity was rebound before acceptance: source commit `794129df1a82ba0672782dfcc40f033bbd9d3591`, bundle `54453e39389dedab29a945490110a53ff986173f52ac97de2e9628173113c399`, version `0.1.7`, diagnostic base mode `watch`.
- Fresh connector discovery exposed `tdev_diagnostics`; authenticated `inspect` succeeded from ChatGPT.
- ChatGPT activated a bounded 2-second manual capture. Incident `a7d9271c582e3fa6bb9478b80d1eaac7` was offered on an ordinary subsequent connector response (`offers=1`), then acknowledged by the same authenticated principal.
- A later fresh `tdev_diagnostics inspect` observed `capture=expired`, `delivery=acknowledged`, `offers=1`, base `mode=watch`, `storageErrors=0`, and `storagePending=false`. This proves request/response offer, principal-scoped acknowledgement, expiry and return to watch for this connector path; it does not claim ChatGPT UI rendering or unsolicited wake/push behaviour.
- Durable evidence: `.artifacts/diagnostic-activation-20260925/chatgpt-connector-acceptance.json`. That artifact is operator evidence and remains untracked by design.

The implementation/source qualification remains the Local Codex work recorded above. This section records only the subsequent ChatGPT-operated acceptance so a later independent reviewer can distinguish authorship and re-evaluate the evidence without trusting the conversational handoff.

### Post-ChatGPT independent review — 2026-09-25

The resumed Local Codex review read current repository instructions, source and the ChatGPT
continuation commit `9ca2c8c`; that commit changes only this file and OPERATIONS. The remote
branch still pointed at `794129d` when reviewed. The continuation's own full-check log records
216 tests in 721.567 s, exit 0. This is retained prior evidence, not a newly executed test result.

Independent read-only installed checks:

- `install.sh --check` verified owned controller PID 13744, version 0.1.7, bundle
  `54453e39389dedab29a945490110a53ff986173f52ac97de2e9628173113c399`, and native-cgo Tunnel
  PID 13764 with control-plane polling. Health reported watch. Installed manifest file hashes
  matched the checkout's packaged source, and the live config matched the deployment receipt.
- Comparing that private config with its rollback receipt showed only the selected watch mode
  and owner diagnostic grant changed. No credentials were printed. Read-only SQLite inspection
  reported internal schema 3; this does not qualify a schema-5 artifact journey.
- A new same-UID snapshot/export independently found the recorded ChatGPT incident
  `a7d9271c582e3fa6bb9478b80d1eaac7` expired and acknowledged, with one offer and matching ack time.
  It corroborates retained server state; the ChatGPT origin/host receipt remains the continuation's
  recorded evidence, not something the local socket independently attests.
- At that sample there were no active observed requests, no sink drops/errors, no incident storage
  errors or pending writes. The ring had 2,796 overwrites among 3,052 emitted events. That is expected
  finite retention, but means this snapshot cannot reconstruct the whole intervening session.
- Two later expired manual incidents were still unacknowledged, with **98 and 93 offers**. Source
  `DiagnosticsPolicy.offers` bounds frequency and per-response count, but not total offers before
  acknowledgment/eviction. This is a demonstrated notification-overhead candidate, not proof of a
  ChatGPT stall or of user-visible delivery. Their actor/client cannot be inferred from the manual
  reason alone. No incident was acknowledged or removed by this review.

An isolated four-incident policy probe reproduced an additional selection defect. With no ack
and one eligible response every 16 seconds, 20 responses produced offer counts **[20, 20, 20, 0]**.
`DiagnosticsPolicy.offers` filters in insertion order then takes the first three; those three
become eligible again before every response, so the fourth incident is starved. Serialized alert
metadata alone totaled 12,473 bytes in this fixture, excluding the duplicate text block and normal
response. This is a deterministic selection result for that schedule, not a universal runtime
threshold or ChatGPT reproduction. `offer-fairness.json` records the fixture. Fair selection and
bounded total retries are the next runtime change; this review does not alter live delivery policy.

A disposable scheduling prototype then prioritized never-offered/least-recently-offered incidents,
used 15–300 s exponential delays and capped each incident at eight offers. Over 120 responses
spaced 16 seconds apart, the four-incident case changed from `[120,120,120,0]` to `[8,8,8,8]`;
serialized metadata fell from 75,036 to 6,743 bytes. At the 32-incident retention bound, all 32
received eight offers; the current policy reached only the first three. These are local simulated
schedules, not host performance measurements or selected production defaults. The prototype still
needs restart/clock-change tests and explicit inspection semantics for exhausted retries; bounded
retry does not guarantee receipt. `compare_offer_policy.py` and `offer-prototype.json` remain
isolated artifacts and are not imported, packaged or installed by tdev.

The earlier `live_accept.py` local authenticated check failed because the assumed
`connector.secret` file did not exist. Its failure log remains intact. Subsequent same-UID
operator acceptance and the separately recorded authenticated ChatGPT acceptance cover different
boundaries; neither turns that failed script into a pass. No credential search or replacement was
needed for this review.

Added two isolated HTTP boundary regressions in `tests/test_diagnostic_policy.py`:

- Hold a real authenticated HTTP dispatch open, advance the injected diagnostic clock, and inspect
  through the independent Unix socket. Slow dispatch activates capture; expiry returns to watch
  while the HTTP client is still waiting. Releasing dispatch delivers its normal successful result
  and the expired incident offer. This exercises diagnosis without another MCP poll.
- Commit a real disposable task-open effect, inject a body-write disconnect after headers, and
  observe client `IncompleteRead`. Evidence distinguishes successful dispatch from failed response
  delivery. The next same-request replay returns the original receipt and offers the pending
  incident without treating the failed write as acknowledgment. No live tasks were touched.

Focused policy checks: **11 tests**, **11.261 s**, PASS. Affected diagnostic/HTTP/bridge checks:
**38 tests**, **82.303 s**, PASS. Full `bash scripts/check.sh`: **218 tests**, **784.542 s**,
PASS, exit 0; `git diff --check` passed. Log: `full-check.log`.
New evidence is under `.artifacts/diagnostic-review-20260925/`, including
`rebind.json`, a new private export and test logs. Existing diagnostic evidence remains intact.
This review changes tests/documentation only; no runtime reinstall or provider change is required.

The next implementation order is recorded in IMPLEMENTATION_PLAN: bound alert repetition, capture
one actual first divergence with independent server/host/visible observations, compare a fixed
workload across clients, then test ownership/Stop separately. The source can diagnose server-side
failures, but watch cannot detect UI-only silence and response notifications cannot wake a stopped
host. Visible continuity remains an open product requirement.

## Bounded alerts, error aggregation and independent observation — 2026-09-25

The user selected implementation along the lifecycle roadmap and easier error observation during
ChatGPT use. The 0.1.8 candidate keeps diagnostic adapters optional and adds no operational retry,
cancellation, provider mutation or always-on observer service. Prior authority to publish/update
the resident installation and keep its watch configuration remains applicable.

Implemented and checked boundaries:

- Never-offered/least-offered eligible incidents replace insertion-order selection. Three offers
  per response, eight total per incident and 15–300 s exponential delay bound retries. Exhaustion
  remains distinct from acknowledgment; full inspection and ack work afterward. Existing counts
  above eight are preserved, not reset. Elapsed-time scheduling and clamped restart delays handle
  wall-clock jumps without unlimited delay. Alert text no longer duplicates the entire metadata row.
- Principal-scoped summaries count server tool/protocol errors and lifecycle failure signals,
  independently of incident cooldown. Classified client reports have separate counters and no
  free-text/raw error field. Request replay does not recount or extend capture; conflicting
  categories/actions fail. Grant revocation, schema rejection and privacy boundaries remain live.
- Counters survive incident eviction and ordinary restart. Aggregation has its own 32-principal
  bound, explicit eviction count and coverage timestamps; categories overlap and are not distinct
  operation counts. Healthy responses cause no aggregation writes. Revision-1 incidents upgrade
  without invented historical counters. A prior bundle preserves revision-2 bytes and reports
  diagnostic storage incompatibility rather than overwriting them.
- An independently launched observer records bounded private snapshots or unavailability records,
  including file hash and stop reason. It makes no MCP calls and never restarts/activates tdev.
  A test sends SIGSTOP to a disposable diagnostic process: the separate observer records a timeout,
  and after SIGCONT observes the same PID. Duration/byte ceilings and refusal to overwrite evidence
  are tested. These signals do not independently identify ChatGPT UI state or a private host cause.

Evidence under `.artifacts/diagnostic-observation-20260925/`:

- `initial.log`: **19 tests**, **19.210 s**, PASS for the initial policy/contract slice.
- `observer.log`: **3 tests**, **4.697 s**, PASS, including actual process suspension/recovery.
- `affected.log`: **49 tests**, **95.735 s**, PASS across diagnostics, observer, HTTP, bridge and contract.
- `sdk.log`: official `@modelcontextprotocol/client@2.0.0`, modern MCP 2026-07-28, 12 tools;
  report replay and compact summary passed in addition to activation/ack.
- `watch-rehearsal.json`: staged bundle
  `8d57b4da3ac0010dfe06db322b51fa1000a0d5e3563f3ce9ac7753927722dec9`, real 0.1.8 entrypoint,
  direct modern MCP and the tdev legacy Codex Bridge adapter. Both paths produced classified reports;
  a genuine missing-operation response incremented the server error counter. Summary omitted full
  incidents. Replayed reports, counts and ack survived restart, key identity stayed stable and process
  instance changed. The staged external observer/export worked in both generations. No live services
  or provider runtime were changed during this rehearsal. This is not the Local Codex agent loop or
  ChatGPT Code Mode qualification. The inactive root's Tunnel selection was not exercised; the
  resident native-cgo Tunnel remains separately checked at installation.
- `resident-before.json` and `before-export/`: preserved pre-update config digest, watch grant,
  zero outstanding operations at that sample, and bounded existing diagnostic evidence.
- `offer-comparison.json`: the actual candidate policy produced `[8,8,8,8]` over the earlier
  four-incident/120-response/16-second schedule, with 8,321 metadata bytes. This is an isolated
  schedule measurement, not ChatGPT latency or visible-liveness qualification.
- `downgrade-sidecar.json`: the actual installed 0.1.7 policy was run against a disposable copy of
  revision-2 state. It reported one storage error and preserved the incident file byte-for-byte.
  No live rollback or operational-state downgrade was performed.

The first `full-check.log` stopped without a completion result across session interruption; it is
preserved and is not counted as PASS. The resumed `bash scripts/check.sh` completed **226 tests**
in **735.971 s**, PASS, exit 0; `git diff --check` passed. Log: `resumed-full-check.log`.
Actual ChatGPT discovery of the
new report/summary contract and a real visible-divergence/control experiment remain separate host
acceptance. Do not manufacture client error reports in production merely to claim that acceptance.

### Installed 0.1.8 acceptance

Implementation commit `dcaaf10` was pushed to `origin/tdev` before the authorized resident update.
The first installation attempt returned `OUTSTANDING_EFFECT`, effect none: a newly running exec
appeared after the preflight snapshot. Existing controller PID 13744 remained healthy on 0.1.7.
The operation was not cancelled, retried or force-terminalized. A later read-only SQLite check
found no outstanding operations; the supported installer retry succeeded and verified the services.
Both attempt logs remain in the evidence directory.

- `install-live-retry.json` and `resident-after-check.json`: controller **0.1.8**, PID 28483,
  bundle `8d57b4da3ac0010dfe06db322b51fa1000a0d5e3563f3ce9ac7753927722dec9`; owned native-cgo
  Tunnel PID 28509 with control-plane polling. Health reports watch.
- `live-acceptance.json`: installed manifest files equal the tested checkout; private config digest
  is unchanged. All **five** prior incidents remain, existing acknowledgments/times and accumulated
  offers are preserved, correlation key is unchanged and process instance changed. Incident storage
  advanced to revision 2 with no storage error. No production client-error report was fabricated.
- `after-export/` preserves a new live snapshot and retained log/incidents. Missing higher rotated
  segments are reported as absent/rotated rather than silently presented as complete history.
- `live-observer/`: the installed observer recorded **four** snapshots over **two seconds** with
  zero unavailable samples, bounded bytes and a verified file hash. This qualifies the local installed
  observation path, not ChatGPT UI continuity or the ability to interrupt old host continuations.

The remaining roadmap work is real ChatGPT discovery/report/summary acceptance and first-visible-
divergence correlation, followed by paired workload and separate control-ownership qualification.
No host-private success claim is substituted from the direct MCP or Codex Bridge evidence.

## Caller execution witness — 2026-09-26

Fresh entry bound root AGENTS, README Current work/version policy, the local lifecycle diagnostic
architecture, diagnostics wire contract and implementation-plan follow-up order. Local branch
`tdev` and remote `origin/refs/heads/tdev` both named
`839026fef7a99eae60b082fed1149b6566d806a5` before this change; origin is `humtr/tdev`.
Tracked source was clean; untracked `.artifacts/` and `node_modules/` were preserved. The latest
user instruction permits source implementation/qualification but explicitly forbids resident
replacement/restart/config/provider changes. Earlier installation authority was not reused.

**Prompt assessment and independent design decision.** Its objective is appropriate, with three
corrections: marker presence is an assertion whose meaning depends on the actual await-ordered
caller; marker absence does not identify the stalled boundary; every probe perturbs call budget
and timing. A later ordinary tool call or report can already establish that *some* caller code
continued, given its saved script. Thus it would be false to claim no existing surface can ever
provide an external witness. The missing feature is explicit, correlated, bounded observation
without operational mutation or activating an incident/capture. Existing report activates trace
and counts incidents; acknowledgement concerns an incident, not arbitrary response receipt.
Watch/trace/HTTP and the independent observer describe the server; retained operation success
and replay describe durable effects. Local bridge evidence describes that client, not ChatGPT's
private continuation. Task/file markers unnecessarily mutate operational state. These alternatives
do not supply the same non-activating, correlated diagnostic contract.

Selected one `mark` action under the existing owner, not another standalone MCP tool. Added optional
response metadata to join a returned call to the existing instance/request server identity.
Principal + instance + run + sequence replaces a second independent requestId for this ephemeral
probe: one identity controls ordering, conflicts, deduplication and an evicted-retry rejection.
It deliberately does not pretend to use durable operational replay. Thirty-two process-local run
watermarks never evict; 256 receipts evict with a count. This bounded refusal policy prevents old
retries becoming fictitious fresh progress. Reuse one run across cells; a full run registry is a
reported diagnostic limitation, not permission to restart production. Receipt denotes memory
acceptance, not flushed storage. Raw IDs are keyed tags in retained events; strict input excludes
messages, outputs, commands, paths, auth, exceptions and arbitrary fields.

The available environment tool catalog exposed no supported reader for private ChatGPT turn-runner
telemetry. The official [plugin troubleshooting guide](https://developers.openai.com/plugins/deploy/troubleshooting)
checked on this date recommends correlating server/client evidence and escalation for internal
reproduction; it does not provide that private reader. This is a bounded availability finding,
not a claim that no internal OpenAI interface exists. No internal telemetry is fabricated here.

The retained `reported_visible_stall` incident, created at 2026-09-26 00:00:47 UTC, independently
preserves relevant server evidence: event 1458 admitted a running exec; event 1462 reports the same
keyed operation as succeeded/terminal; event 1463 records HTTP completion at 2026-09-25 23:48:58 UTC.
The next retained event (1464, diagnostic inspect) is about **695.93 seconds** later at 00:00:34.
This corroborates operation completion followed by an observed server gap, not host receipt or
UI delivery. The exact visible phrase `Checking and Raising File Size Limits`, the user's Stop and
resume, and the separate observer's continuity are not independently time-bound by this incident;
those remain user observations. Watch did not retain detailed socket stages for that earlier call.
A new **read-only** resident export confirms PID 28483, instance `4bc43da834047048`,
key generation `7ca33a31371bbfad`, watch, no active requests at sampling, and 256 recent records
with 2,508 ring overwrites. The current ring cannot reconstruct or falsify that earlier UI event;
the incident's bounded excerpt is why the server frontier above survives. It was not used
to assert that server silence means host/UI failure; no incident was acknowledged or removed.

**Relevant defect found and corrected.** In `make_server.Handler.do_POST` response assembly,
alert retrieval was protected but alert text formatting and JSON serialization
were not. A malformed optional diagnostic record could therefore discard an otherwise completed
operational response after dispatch. Rendering and serializability now succeed before the alert
is attached; optional response correlation metadata is similarly isolated. Fault injection
reproduces this failure class and verifies the ordinary response survives. This is a real failure
window in tdev, but no evidence links it to the reported natural ChatGPT stall.

**Source candidate:** 0.1.9; inactive bundle
`345288b3581da6d8128805cd5312516c3fec42ab5d5e81e478f728b749817afe`.
Owner changes: `src/tdev/diagnostic_policy.py` (witness policy/replay), `diagnostics.py` (detached bounded
record), `server.py` (optional receipt/fail-open rendering), `core.py` (fresh grant/maintenance
check only), `__init__.py` (patch version), `contracts/tools.schema.json`; qualification in
`tests/test_diagnostic_witness.py` and `scripts/check_mcp.py`; README, ARCHITECTURE, OPERATIONS,
IMPLEMENTATION_PLAN and this validation record. No observer implementation or production service
graph change. Operational core still imports no diagnostic implementation.

Evidence is preserved under untracked `.artifacts/host-witness-20260926/`:

- Focused: **8 tests PASS**, 7.575 seconds (`focused-final.log`). Initial `focused.log` failed
  because the test used `response_body_written` instead of the actual `socket_body_written`;
  corrected and reran. The controlled timeline waits for server finalization explicitly: real
  client receipt can race handler-finalization logging, so the public semantics do not assume
  strict ordering between all client/server timestamps.
- Affected: **57 tests PASS**, 64.029 seconds (`affected.log`), diagnostics/policy/observer/witness,
  contract, HTTP and bridge. A later strict ID-length assertion (including trailing newline) is
  included in the full run, after the affected run.
- Official pinned MCP client **PASS** (`sdk.log`), protocol 2026-07-28, twelve tools, mark schema,
  response metadata, original-receipt replay and unchanged report/ack coverage.
- Probe overhead (`probe-overhead.json`): one isolated watch-mode task-list response used 885
  JSON bytes, of which optional request correlation added 72. Enter/return/exit marker result
  envelopes used 739/811/737 bytes and added three tool calls to one target call. These exclude
  HTTP headers, host wrapping, setup and latency; they are not a ChatGPT performance measurement.
  This supports sparse probes rather than adding markers to every production tool call.
- Inactive package rehearsal **PASS** (`rehearsal.json`, `rehearse.py`): verified bundle bytes,
  actual staged server processes, direct modern HTTP MCP, Codex Bridge adapter, separately spawned
  observer, three ordered phases with exact request join, lost-reply replay without another
  witness, watch/no incident creation, stable key and changed instance after restart, stale marker
  rejection. No active pointer, tunnel startup, live provider change or production registration.
- Full `scripts/check.sh`: **234 tests PASS**, 407.094 seconds, plus `git diff --check` PASS
  (`full-check.log`).
  The run emitted an unclosed-SQLite `ResourceWarning` during existing artifact tests; the same
  warning is present in the prior 0.1.8 full-check logs. It is recorded rather than hidden or
  attributed to this witness change.

The focused cases also cover concurrent duplicate delivery, retained payload conflict, evicted
replay refusal, run capacity, ring bounds, off with no lazy load, trace expiry/persistence/storage
failure, fresh authorization, invalid/extra/raw fields, principal scope, unchanged source/database
and operational receipt, no operational retries, detached active-request accounting, local socket
non-writer boundary, and malformed diagnostic metadata after normal dispatch. Existing regression
coverage retains report/incident/notification/ack semantics and recorder queue/drop accounting.
These are local harness assertions, not observation of the private ChatGPT runner.

**Resident remains unchanged:** 0.1.8, bundle
`8d57b4da3ac0010dfe06db322b51fa1000a0d5e3563f3ce9ac7753927722dec9`, controller PID 28483,
tunnel PID 28509, native-cgo/control-plane polling healthy (`resident-check.json`). The source
and installation are intentionally different generations. Installation is the explicit stop point.
After separate authorization, verify the approved checkout produces the candidate above, then use
`bash install.sh --root /data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8`
and its `--check` path as documented in OPERATIONS. No config/provider options are required for
this already-watch installation. Outstanding effects must remain a blocking fence; do not force
through them or copy files over the live bundle. No installation command was executed here.

**Remaining acceptance/roadmap:** after a separately authorized install and fresh ChatGPT discovery,
verify inspection generation and metadata exposure; execute a short real physical cell with
enter → fulfilled real call → return witness → exit while the independent observer records.
Then collect the first natural visible divergence, preserve coverage/loss and the actual script,
and align the user-visible Stop/successor/resume timeline without inferring it from silence.
Classify only the positive execution frontier, compare a sparse probe with an uninstrumented
bounded workflow, then target the implicated response, continuation, scheduling or UI boundary.
Report/Stop/resume ownership remains separately qualified. Direct MCP and the bridge are a tdev
reference harness; neither the actual Codex agent loop nor real ChatGPT Code Mode is qualified by
this local rehearsal. tdev can preserve resume state and reduce round trips; it cannot guarantee
host scheduling, wake-up or user-visible progress over a stopped request/response channel.

## Caller witness resident update attempt — 2026-09-26

The user subsequently authorized resident replacement and commit/push. Fresh local and remote
`tdev` both named `6b891f884b738c6a35b9c87cbc15a8e59d51d54f`; tracked source was clean.
Candidate verification still matches the qualified 0.1.9 bundle
`345288b3581da6d8128805cd5312516c3fec42ab5d5e81e478f728b749817afe`.
The prior source qualification (234 tests, SDK, affected tests and inactive rehearsal) applies;
this installation attempt changes no executable code and does not claim a new full-suite run.

`bash install.sh --check --root /data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8`
passed for the existing 0.1.8 controller/tunnel. The authorized install then returned
`OUTSTANDING_EFFECT` before the service transition. Read-only SQLite inspection identifies
validation `ce5e5082fe69457b8b148a382ad5d0f3`, task `93ebb4d236d2416ba6386b3f64ff8b1b`,
with status running/effect unknown. Its existing native result is terminal with exitCode 0,
timedOut false and cancelled false. Those process facts do not replace the controller's validation
reconciliation or prove the controller receipt is terminal. `Controller.status` normally invokes
that reconciliation; the installer correctly refuses the unreconciled row.

On resume the same blocker remained. This local session exposes no tdev MCP tools or configured
tdev MCP registration; the installation has no conventional connector.secret file. The missing
file prevented a local authenticated status call before any HTTP dispatch. No credential was
created, changed or extracted from unrelated state. The user was asked to invoke the existing
authenticated `tdev_operation status` for that operation or identify its existing bearer-file
reference. Do not directly edit SQLite, manufacture a terminal receipt, cancel/retry validation,
or bypass the installer's fence to finish an update.

Evidence remains at `.artifacts/host-witness-install-20260926-9v4_w7we/`: before binding/check/export,
failed install log, bounded process-result summary, and prepared `verify_installed.py`.
That post-install verifier has **not run** because installation has not completed. Config digest
is unchanged, no maintenance flag remains, and resident health still reports the previous bundle,
version 0.1.8 and PID 28483. No existing incident was acknowledged or deleted.

Next: reconcile through the normal authenticated status path, confirm no outstanding effects,
rerun the already-authorized installer, then the prepared installed readback and service check.
Record and publish actual installed acceptance afterward. The authorization persists; another
deployment approval is not required. Real ChatGPT mark/metadata/visible-control acceptance remains
separate and outstanding.

## Caller witness installed acceptance — 2026-09-26

This entry supersedes the preceding installation blocker. The user identified the existing local
bearer location; `.local/share/tdev/connector.secret` matched the resident principal hash and was
used in memory for authenticated loopback requests without printing, copying or changing it.
Normal `tdev_operation status` reconciled validation `ce5e5082fe69457b8b148a382ad5d0f3` to
succeeded/committed. Zero outstanding operations, unchanged config digest and exact candidate
bytes were confirmed before retrying the already-authorized installer. No direct database edits,
forced fence bypass, cancellation or execution retry were used.

The installer successfully replaced the owned controller/tunnel with **0.1.9**, bundle
`345288b3581da6d8128805cd5312516c3fec42ab5d5e81e478f728b749817afe`, executable source commit
`6b891f884b738c6a35b9c87cbc15a8e59d51d54f`. Checkout at installation was `986e4ae`, which only
adds documentation. Controller PID 21787, tunnel PID 21798; native-cgo tunnel control-plane polling
and the separate `install.sh --check` pass. Watch remains enabled. Installation config digest is
unchanged; all **seven** existing incidents, their identities and acknowledgments survive.
Correlation key generation `7ca33a31371bbfad` is preserved; process instance changed to
`658aa49fc2d185c2`. No diagnostic storage errors were observed.

Evidence remains in `.artifacts/host-witness-install-20260926-9v4_w7we/`:

- `reconciled-operation.json`, `install-retry.log`, `after-check.json`: normal terminalization,
  successful controlled installation and service health.
- `live-acceptance.json`, `verify-installed.log`: exact installed file verification against the
  qualified source, config/key/incident preservation and a separate installed observer process
  (four samples, zero unavailable). Export reports absent/unrotated segments 1–3 explicitly;
  missing optional rotated files are not represented as complete historical coverage.
- `live-mcp-acceptance.json`, `live-mcp-verified.log`: actual authenticated modern HTTP tool
  discovery (12 tools including mark), inspection, ordered enter → real task-list await → return
  with exact response request reference → exit, then identical marker replay with no new witness.
  Final event IDs 78/87/92, referenced request 29, same process instance. No report/activate/ack
  calls were added by the acceptance; watch remained watch.
- `live-witness-observer-verified/`: independent installed observer recorded all three final
  witnesses; 30 samples over 15 seconds, zero unavailable, within the 8 MiB bound.

Two initial harness failures are retained: a four-second observation window ended before the
approximately five-second live task-list call returned; its marker existed in the later server
snapshot, but absence from those samples was a real coverage gap. The next harness read the old
output path despite writing a new observer directory. Correcting both the window and readback
path produced the passing run above. These are not hidden as successful tests or diagnosed as
ChatGPT stalls. They reinforce that absence of a marker in an undersized observer window does
not imply stalled continuation. The observed task-list latency is a workload fact for later
round-trip comparison, not a cause assignment based on this small probe.

No executable changes followed the previously passing 234-test full run, 57 affected tests,
focused checks, official SDK check and inactive rehearsal. This turn adds installed acceptance
and documentation only; `git diff --check` was rerun, not a redundant full suite.

**Next acceptance:** refresh ChatGPT discovery after this service replacement (the user's earlier
refresh preceded installation), inspect the new instance, and run a short real Code Mode cell
with the independent observer covering the entire workload. Verify whether the host exposes
response metadata and collect actual visible progress/Stop/successor/resume separately. Local
authenticated installed MCP success does not qualify ChatGPT UI continuity or its private runner.

## One-line Termux first installation — 2026-09-28

Source base `0f6b78e18ec6abfad830bfd8e65917c7c128149a`, candidate **0.1.16**.
The user selected first-time installation ahead of the remaining host journey gate.
README now leads to INSTALL.md and a Bash command selecting repository URL and the separate
`install/termux-bootstrap` source branch. bootstrap.sh prepares Termux packages, a persistent
checkout, private dependencies, the shared service daemon and the existing interactive installer.
There is no new MCP/config schema, remote Tunnel provisioning or automatic project delegation.

Two fresh-install prerequisites were missing from the previous operating-environment evidence:
stock termux-services has no `service-daemon status`, and PyPI has no Android wheel for the pinned
rpds-py version. Preflight now observes one exact runsvdir executable/service-directory identity.
The explicit bootstrap starts it only when absent; ambiguous/foreign graphs fail. Dependencies
reuse only the matching native Termux distribution, then validate all exact versions and imports
without global site-packages. Existing dependencies remain intact until staging succeeds.
An existing owned tdev service skips system package preparation. The resident installer keeps
its original ownership, outstanding-effect, credential and update-recovery checks.

Evidence: `.artifacts/bootstrap-20260928/`. Focused bootstrap checks: **13 tests, OK, 5.477s**,
exit 0. Affected `test_installer_setup test_resident test_cli test_admin`: **58 tests, OK, 82.125s**,
exit 0. Coverage includes a real temporary Git clone and terminal stdin, unchanged clean retry,
dirty/foreign/symlink checkout preservation, package/clone/installer failure, refused maintenance
actions, wrong SVDIR, existing-service package preservation, exact native dependency selection,
staging failure/retry and a real isolated runsvdir. The first broad run was interrupted with exit
130 after the final service-path guard and fixture environment correction; it is not counted as PASS.
The final complete `scripts/check.sh` run passes: **320 tests, OK, 962.282s**, exit 0
(`check-final.log` / `check-final.exit`).

The real Termux `python-rpds-py 2026.6.3` aarch64 package was downloaded and extracted only into
the evidence directory, not installed into the operating environment. Package SHA-256:
`a0345ca41cdcb357a311c345da227439f733e46bcf8d738d224e8b4585ab88b4`.
A fresh private dependency directory seeded from that package plus actual pinned pip acquisition
passes isolated imports and version checks on Python 3.14/Android arm64; a second preparation
reuses the verified set. The original documented Bash command was tested with a failing downloader:
exit 22 propagates and partial downloaded shell text is never executed. Shell syntax and diff
whitespace checks pass. Current source preflight also recognizes the existing shared runsvdir.
The user subsequently requested a shorter command: documentation now uses the bootstrap
default repository and an AND-list around download/execution (286 to 171 characters).
This documentation-only simplification did not change runtime source or rerun the suite.

No package-manager install/update, service start/restart, resident replacement, credential change,
observer change or project grant was performed on the operating installation during qualification.
It remains **0.1.14 / up**, both existing connections locally healthy. Full first-install acceptance
on a wiped/new Termux environment, new Tunnel credentials and actual ChatGPT invocation still
requires that environment; fake package/service steps are not claimed as this acceptance.
INSTALL.md records the separate first-device, interruption/retry and connection acceptance procedure.
This delivers installation; deleted configuration/workspaces/application data still need backups
for restoration. Other Android ABIs and future native-package/Python combinations are unqualified.

## Two-project journey with local resume — 2026-09-27

Source base `0f6b78e18ec6abfad830bfd8e65917c7c128149a`, source CLI 0.1.15; resident 0.1.14,
bundle `e356a2c6aea607050e9124ef6be8276c779a2721f033ef8ac092423f27f2dbe3`.
Evidence: `.artifacts/journey-d1283cf13321/` contains the initial caller snapshot, append-only
local call log, continuation script/state, exported files, operation receipts and final audit.
The final config SHA-256 is `dcc86d5de0b556e061160e0a9062bd5fc0e3efe1c7bf91ac984d142798d63cf8`;
it is an end observation, not a measured before/after equality claim. No config, credentials,
controller, Tunnel or observer lifecycle was changed by this run.

The initial session used the discovered `mcp__codex_apps__tdev_*` tools: delegated project
creation, a dedicated workspace, source edits/execution, integration of a separate documentation
task, source validation, exact managed-branch publication and retained-build admission. Caller
markers used instance `2e2e0deeed4fa5b0`. After the user's `resume`, that tool family was absent
from the available catalog and the function store was empty. The existing source CLI continued
through `--connection tdev_janmori`, selecting its local credential without exposing or changing it.
These are distinct client paths; the latter is localhost HTTP, not a Tunnel/ChatGPT host test.

The first read found original build `c7b7dc31698f4e22b0516eb20fc9feb5` succeeded. Current task
inspection exposed its completed build/publication and exact remote commit. The saved caller
snapshot ended before those completions; recovery used server receipts rather than repeating
source validation, publication or build. No user-supplied internal IDs, config edits, new semantic
notes or handoff essay were required. This resumed the existing conversation context; it does not
prove recovery of working intent in a fresh ChatGPT conversation.

Executed workload:

- New API and consumer projects under `local-projects`, in workspace
  `c987259e5cb449ecb660b45e90ba7b87`. Source checks use the existing adopted `sh scripts/check.sh`.
  The API vendors hash-pinned `packaging==25.0`, generates an asset and serves a versioned JSON
  contract with a release header/body and a persistent data sentinel.
- An independent task's contract document integrates without conflict. Both API versions and
  the consumer validate and publish; task inspection confirms each exact published commit before
  managed-ref cleanup. Source publication and the two repositories remain independent effects.
- Both retained packages pass actual entrypoint/artifact checks. Source/build/check scratch and
  task dependency environments are retired before each release. Version two is built and verified
  while version one serves. A separate consumer task checks the live version two response, then
  the retained version one response after rollback. Its source tests also accept two valid
  payloads and reject eight incompatible schema/value/version/release combinations.
- Active/previous artifacts refuse prune in both UP and DOWN states. Stop/start preserves the
  sentinel; its final modification time remains within the first release's dispatch/return
  interval, excluding recreation by this app on a later start. Removal reaches revision 6,
  desired=removed and no running process. Both 86-byte
  protocol files export in two 64-byte pages each and match their returned whole-file SHA-256.
  Explicit pruning follows removal. No additional build is admitted for rollback/restart.
  No network isolation or new failure-injection result is claimed; previous isolated/installed
  failed-switch evidence remains applicable.

Exact identities (full results are retained in the evidence packet):

| Result | First API version | Second API version |
|---|---|---|
| Published source | `e7b1dd42718cf1d3c07de51fbd270a11ddd96f61` | `801d325ac913106b93da20f11469c926899f0ec1` |
| Source validation | `e341b4bda86c41a7891ce5e96f81feef` | `bdf47409725747caad67216d79cfd7d0` |
| Retained build | `c7b7dc31698f4e22b0516eb20fc9feb5` | `c2d983d521f645229cba66df8dac4cba` |
| Content SHA-256 | `e648edd0323bfd1f8a286702ed5f8be4297592299a91f7e5246f4360d0644cb0` | `a5f11ae6684e80859fc536156acf1414990d4ff30883673e1b02d0bb83f0e3a5` |
| Artifact validation | `4880fc11c54f4ca9ad44229c8a04fcca` | `9b151c7bb1ac44149dc8e44be2e8d838` |
| Live release | `f06082bc9e86a1aad9acc7b9b734dc15015d49436b2d8f0606ac5cef4190e91e` | `bd6ecd6e5d757f49b90e7d32fc7d1ab544339ab7514459a5870c655f71e5a7d3` |

Consumer source `90ec26993078c4727b1f4ee1e0016ac6fa03824b` has validation
`edee59a260484876bc7f9e77c90e3f2f`. Deployment `d5fcdaa0096239655f439000d4ae3222`
owns the trial service and preserved data at the installation's
`state/deployments/d5fcdaa0096239655f439000d4ae3222/data`.
Final read-only audit finds **60/60 trial operations succeeded**, no global running/unknown
operations, all five tasks closed, all owned refs deleted, workspace closed, two artifacts pruned,
no execution scratch and no task dependency environments. The two enrolled local repositories,
Git/SQLite history, data, logs and historical release copies remain intentionally retained.
The release copies contain **632,834 file bytes**; the whole deployment directory contains
**638,923 file bytes**. Eleven retired native receipt/log directories retain **8,999 file bytes**.
These are logical file lengths, not filesystem allocation or whole-installation usage. Artifact
metadata measured **316,026 bytes per object** before pruning; release copies have independent
retention. The audit initially treated retained native receipt directories as leftover scratch;
inspection of retirement semantics corrected that assertion without deleting evidence.

Measurements and limits:

- Local continuation recorded **92 calls**, **221,262 UTF-8 stdout bytes** and **246.48 seconds**
  from its first journaled dispatch to last reply, including phase gaps. One preceding build-status
  call is outside that journal. Stdout includes the CLI JSON wrappers/duplicate content; it is not
  model-token or wire-byte accounting. Seven observations preceded the first new useful effect
  (artifact verification was call eight), including redundant audit reads. This is not a minimal
  recovery-call result or proof of the proposed three-call target.
- Each tiny two-page export took **1.26 / 1.66 seconds** locally. This does not characterize
  large exports or establish a need for a streaming implementation. The initial persisted snapshot
  contains nine bounded cells/40 attempts through witness sequence 27; later source-status and
  publish/build replies appear in the conversation and durable server receipts. It is not a
  complete archived connected-client timing/byte series.
- The independent observer remained stopped; its samples were already stale at entry. Caller
  markers establish their receipt only. No user report establishes screen-delivery times, visible
  continuity, a visible stall, Stop behavior or actual ChatGPT reconnection. Full real ChatGPT
  journey acceptance remains open because the connected path did not continue after resume.
- All local continuation phases and the corrected final audit exited 0. Product implementation
  and public schema are unchanged. Focused CLI/progress/contract checks: **30 tests, OK, 36.360s**,
  exit 0. Full `sh scripts/check.sh`: **307 tests, OK, 671.155s**, exit 0, including the
  documentation whitespace check. Logs and exit receipts are retained alongside the journey
  evidence. An SQLite unclosed-connection `ResourceWarning` appeared during fixture collection;
  this is not a warning-free claim. The baseline does not demonstrate a semantic
  recovery defect requiring notes; step 3 remains selected, with bounded frontier use and accurate
  client-path attribution clarified in `examples/chatgpt/JOURNEY.md`.

## Explicit local CLI credential selection — 2026-09-27

Source base `650e1dd3843b3c74fc6e78ce91b23bfbdb6f7b33`, source candidate 0.1.15.
The fix adds --connection name/stable-ID for local MCP calls. Legacy default behavior remains;
only a missing default file offers a terminal picker. Insecure/invalid credentials never cause
fallback. Dedicated credentials require active state, known principal and matching private bytes;
the server checks current auth again. No effect is repeated after any server/transport error.
No wire/config schema or installed auth configuration changed. The source-backed CLI shortcut
uses this code without a resident replacement.

Evidence: `.artifacts/cli-credential-20260927/`.
Focused `test_cli.py`: **25 tests, OK, 13.077s**. Affected `test_connections test_bridge test_http
test_contract`: **27 tests, OK, 31.218s**, exit 0. The first full check stopped during
resident tests across a session transition: the process no longer existed, there was no terminal
summary or exit marker, and its partial `check.log` is not counted as PASS. A new detached local
check runner records `check-final.log`, `check-final.exit` and a completion receipt. Final `sh scripts/check.sh`: **307 tests,
OK, 543.729s**, exit 0, including diff whitespace check. Existing SQLite ResourceWarning
appeared during fixture collection; this is not a warning-free claim. No production rehearsal
was rerun for this client-only change; the existing installed read-only checks below qualify
the actual CLI path, not a server replacement.
Coverage includes same-owner replay across legacy/dedicated credentials, name/stable-ID selection,
missing default non-TTY failure, terminal pick/cancel, unknown/disabled/revoked/mismatched/missing/
symlink/public-mode selected files, legacy failures without alternate selection, server revocation
after local credential inspection, no timeout retry and rejecting the option for local mutations.

Actual source CLI read-only calls with --connection tdev_janmori succeeded against the existing
0.1.14 resident: twelve-tool discovery and workspace list. A real PTY showed diagnostics menu →
missing-default credential picker → q; cancellation returned 0 without MCP dispatch. No token
was printed, copied, regenerated or rotated; resident/Tunnel services were not replaced.

examples/chatgpt/JOURNEY.md prepares the real one-/two-project baseline prompt and separate
server/caller/observer/visible evidence requirements. It is not executed ChatGPT acceptance.
Read-only observer status at resume reports stopped, old PID 19489 and segment
20260927-140614-coarse-f0c3cdd7, 4,509 samples, historical unavailable/storage-errors 0, but last
sample approximately 14,000 seconds old. This is a live coverage gap, not evidence of present
availability. The observer was not restarted; actual host observation needs a running current
collector or an explicit coverage limitation. The first status read was incorrectly parsed as
JSON by the local inspection command; status is human-readable and the original output is
preserved. No product failure or secret issue was inferred from that parsing error.

## Installed packaging lifecycle acceptance — 2026-09-27

Source HEAD `746344d54293e38ae1164d1f7f2417231cb11663`; resident 0.1.14, active bundle
`e356a2c6aea607050e9124ef6be8276c779a2721f033ef8ac092423f27f2dbe3`.
Evidence and the local-only harness are in `.artifacts/installed-package-20260927/`:
`calls.jsonl`, `state.json`, `result.json`, run/lifecycle/archive/finish logs and exported files.
Run `pkg-465db7dbf0fb`, enrolled trial repo `p-db2cad4ec9177b4edb395216`, deployment
`767660ec696b2124e244f5e500952f8e`. All effects used existing owner delegation to a new local
project and a generated tdev-app service; no production controller/Tunnel/observer replacement,
credential rotation, policy modification, external Git publication or arbitrary deletion.

The CLI's fixed connector.secret lookup failed before HTTP because that file is missing in the
current installation. Inspection found an active dedicated owner credential for tdev_janmori.
The harness explicitly selected it, verified its configured hash/principal/state, read it privately
and used Bridge.forward's modern authenticated localhost HTTP path. No token was printed, copied
to clipboard, passed in argv or retained in evidence. Why the legacy file is absent was not
established; healthy Tunnel probes do not establish that the local CLI credential exists. Add
explicit connection selection rather than silently choosing another credential or rotating one.

Executed acceptance:

- Create isolated trial project under existing local-projects delegation; unchanged adopted
  `sh scripts/check.sh` validates source and exported package checks. Use reviewed Python layout,
  real public hash-pinned packaging 25.0 wheel and generated asset.
- Prepare/verify two service versions; close tasks, retire source/build/artifact-validation
  scratch and clean managed refs before release. Check live release header/body, dependency and
  asset. Update while verifying the next version with the previous service still available.
- Fresh HTTP connections observe the retained first version after rollback. Active/previous
  versions refuse prune while running and stopped. No new build request is issued by rollback;
  this run does not claim network denial or an instrumented absence of all network activity.
- A candidate passed verification on its separate port but intentionally exited at the trial
  deployment port. Release failed as expected, restored the earlier healthy service and retained
  the failed operation. No controller/other service crash was injected.
- Stop/start/remove; trial app-data sentinel survives. Export app source in 128-byte pages,
  assemble and check returned SHA-256; preview/prune only the trial artifact handles after removal.
- Non-service ZIP build and artifact verification use no service command, health port or target;
  export/hash verification and explicit pruning pass, with retained history.
- Reset all five trial task dependency environments through the supported API. An additional
  service package was released successfully after its own environment and execution scratch
  were retired, then removed and pruned. This closes the stronger runtime-independence check;
  the first service runs alone did not prove dependency-directory absence.

Final result: 70 trial operations, 69 succeeded and one intentional failed activation, no global
running/unknown operations at final readback. Trial deployment desired=removed, revision 8,
no running process. Trial data, enrolled initial repository, historical deployment copies/logs
and operation evidence remain by contract; they were not destructively swept. Artifact admission
advanced installed state from schema 3 to 5, so incompatible old bundles cannot be used for rollback.
The controller and both Tunnel connections remain locally healthy at 0.1.14.

A local harness state file briefly lost completed lifecycle fields when two independent phases
saved stale snapshots. Per-call append-only evidence and server receipts remained intact; these
were merged without reissuing effects, and final cleanup/readback ran sequentially. The durable
server, not that harness state file, is the result authority.

run.py, lifecycle.py, archive.py and finish.py each exited 0. These are installed acceptance
checks, not a new full deterministic-suite run; product code was unchanged. Documentation diff
checks pass. Actual ChatGPT host execution, visible continuity, cross-workspace acceptance,
controller crash qualification on the live installation, native-extension/Android packaging and
host-wide offline execution are not claimed. Earlier isolated fault/SDK evidence remains separate.

## Refreshed ChatGPT packaging/lifecycle requalification — 2026-09-30

The retained ChatGPT closeout task `152c039f710c466a83a72933b81b63f8` reports this run through
the actual refreshed thirteen-tool surface. On takeover, its terminal source/artifact validation,
original failed-switch receipt, removed deployment and pruned archive were read back from the
installed resident; those effects were not repeated. This verifies durable backend state, not
an independent capture of its ChatGPT declaration or visible UI timeline. The reported runtime was **0.1.22** / bundle
`ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`. It intentionally reuses the
2026-09-27 data-sentinel and broader fault evidence where the invariant was already established; it does
not relabel those older measurements as fresh. The purpose here was to prove the changed model-facing
surface, explicit deployment revisions and original-operation recovery against the installed runtime.
Bounded receipt details are in `examples/chatgpt/PACKAGING_ACCEPTANCE_20260930.md`.

The disposable project was existing local enrollment `p-db2cad4ec9177b4edb395216`. Baseline artifact
usage was zero and its historical deployment was already removed. A new managed service task
`df48138d4e6240fb8f58804952302402` integrated the previously reviewed fixture delta from the same
`9a335d2604fc2191c63f8d158a53da228cf155c7` base without replaying historical effects.
Source validation `476f9b583e64410ab1eeea8cb2848b41`, artifact `c7280fe6a9df4a5ba8af44a72a2d6103`
and artifact validation `ae2e4d7dc59b483988f8c8bd9e125e4d` succeeded. The retained artifact digest was
`de01f132bd1a5ac6f8d86336d02fa9b9cb029a3398aeae88280228f547ce1a84`; release created deployment
`f70af0ef214fc553722ce3fdf8b3ea6b` at revision 1 / release
`a73747e463c982300156ebb2d5dd4e1e8f1ca97d257699f959df03d33766bf45`, with HTTP health 200.
After source/build/artifact-validation scratch retirement and task environment reset, the same release
remained healthy and retained `dist/asset.json` exported as 32 bytes with SHA-256
`0ca9e98414b209833559f1c01bd92e29cc05a4ec2a69e1d2651244e33e3d8c78`.

An updated source produced validated artifact `46f30864143a4f599cb11c15a63dd03d` and updated the same
deployment with `expectedRevision:1` to revision 2 / release
`f45071e4ae65f968fd50376a30bcd7d96833ca888ec53b7226ea46986b937140`, still HTTP 200. Rollback with
`expectedRevision:2` restored the first retained release at revision 3 without a new build. A separately
validated artifact `2f831b3a3b80423dabe0405b810a9ceb` was designed to pass artifact validation on its separate port
but fail on the deployment port. Release operation `730a89f706e94c25ab6b070076de0782` initially returned
`DEPLOYMENT_RECOVERY_REQUIRED` with unknown effect. No replacement release was admitted. Status on that
same operation reconciled to `failed`, `effect:committed`, `DEPLOYMENT_INTERRUPTED` and `rolledBack:true`;
inspect independently showed revision 3 still on the first release, running and HTTP 200.

CAS lifecycle then stopped revision 3 to revision 4, started revision 4 to revision 5 with HTTP 200, and
removed revision 5 to revision 6. All new source/build/artifact-validation scratch was retired; the task
environment was reset, task closed and managed ref cleaned. All three service artifacts had empty pin
sets, were pruned with their exact preview tokens, and retained artifact usage returned to zero.
The earlier 2026-09-27 data-sentinel result remains the data-preservation evidence; this run did not
create a second sentinel.

A second managed task `5193628ef9b54e48b0b2804106090385` integrated the retained archive fixture on the
same base. Source validation `7796c59179e640aebd236184ac50ef39`, archive artifact
`b4c6e87b2eb1496181f4236fcd30eb50` and artifact validation `133336c54d2d4a1f857c58515c762b73`
all succeeded without a service command or health port. Manifest `dist/hello.zip` was 145 bytes with
SHA-256 `9eb80fac27052ec4a6bcb0fc6ed7542e200bbcd1be8de520cc4c4be59233eb85`; three 64-byte-bounded export
calls advanced 0→64→128→145 and reported that same digest. Its execution scratch/environment/ref and
retained artifact were then retired/reset/cleaned/pruned; final artifact usage again reported zero.

This closes installed queue steps 0–2 for the current surface. It is actual ChatGPT tool execution, but
it is not the separate whole one-/two-project development/deploy/reconnect journey and is not a
quantitative visible-continuity measurement.

## Installed handoff review and human-name recovery — 2026-09-30

### Fresh authority and starting frontier

The original `prj/tdev` checkout was old source with unrelated dirty changes; it was not changed.
Root navigation, README, affected architecture/contracts, IMPLEMENTATION_PLAN and operator update
rules were rebound in `prj/tdev-surface-redesign`, fast-forwarded to canonical
`055b97d534e06504e3a7db1eaeee0287d852bdf4`. Installed runtime readback was 0.1.22 / bundle
`ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`, with both connections healthy.
The historical managed-create publication `2531fb0f9bbd4aa584865f62898e1010` remained unknown/unknown.
The retained earlier ChatGPT closeout was reviewed and terminal receipts were read back, rather than
recreating its service/archive work. Its open documentation task is preserved, not silently closed.

### Fixture review and corrections

The handed-off source task `fee2f0d9bd904f6e8b14fe3a80a73e7e` and successful retained artifact
`f6307a0fe1a0479c8e4e498c29642cf2` were reused. The earlier literal-newline mistakes were already
corrected; their failed exec/source-validation/build receipts remain terminal history. Including
`check.py`, `test_app.py` and `scripts/check.sh` in the recipe is appropriate: the currently delegated
source/artifact policy requires that entrypoint, with static source checks and separate live artifact
checks. It is not a policy waiver or a build-success substitute for validation.

The original lock substring check could overlook malformed final bytes, and live dependency locality
was implicit. A genuinely strengthened second candidate checks exact lock bytes and rejects literal
`\n`, incorrect hashes and duplicate requirements; checks recipe/input/service metadata; proves
`packaging==25.0` imports from the artifact's Python directory; and verifies real HTTP status,
`X-Tdev-Release`, body identity/version and generated asset bytes. Source publication and artifact
validation remain independent receipts. The new candidate was validated/built normally; the successful
first artifact was not discarded. One local edit harness initially supplied a SHA-256 instead of the
Git blob OID for `before`; terminal `EDIT_CONFLICT` / effect none was retained, then corrected input
was admitted under a new identity. This and the earlier newline errors are fixture-authoring mistakes,
not product failures or ambiguous mutation retries.

### Installed lifecycle results

These calls used the authenticated localhost MCP bridge from Codex, not injected ChatGPT tools.
Requests were persisted before one dispatch; admitted running/unknown work was observed by its
original operation only. Private requests/responses and timestamps remain in
`.artifacts/installed-journey-20260930`; the compact public record is
[`installed-a1-20260930.json`](examples/chatgpt/installed-a1-20260930.json).

| Stage | Fresh result |
|---|---|
| Reuse original artifact | Artifact validation `ff41967b1ffe465aa7eebb17a2ac6d86`, exit 0, actual health/header/dependency/asset checks |
| Initial release | Deployment `1a7384347f050a137239369207c82093`, `expectedRevision:0` → revision 1; separate inspect and direct HTTP verify version one |
| Strengthened second source | Validation `1262b65ffa39416d9bbf58363b7f5976`, candidate `b37c6933b482a7ece331af1075c0330f8a537fcc`; managed publication readback exact; main unchanged |
| Second artifact | `5af26f5b3e8446a390ebc25cff16fe26`, digest `54872539bbfb7c83d4d7ed973cf582dd134a7e8e3b50ff585451af84139e80dd`; artifact validation `1c7adc5f1a864d0c96f3bc110fa2ec1d` exit 0 |
| Previous service during validation | Distinct validation port; direct HTTP version one before/after validation. Continuous zero downtime is not inferred |
| Update and rollback | Expected revisions 1→2→3, separate live identity/health readback; rollback reused retained first release without rebuilding |
| Owned supervisor crash | Exact process command/deployment ownership checked before one SIGKILL; fresh supervisor and child restored same healthy release |
| Bad activation | Separately validated artifact `ef52e8de66434bfbb7ade277241c5c34`; release `53de25feb715414ab42e9840af00c100` failed/committed, `DEPLOYMENT_NOT_READY`, `rolledBack:true`; original revision 3 healthy independently |
| Scratch independence | All stopped original/second/bad source/build/validation scratch retired, both task environments reset; version one still HTTP 200 |
| Stop/start/remove | CAS revisions 3→4→5→6; fresh `data/keep` sentinel preserved byte-for-byte after each stage; no running process after remove |
| Pin/export/prune | Active artifact preview pinned; second asset exported in two 16-byte pages, 32 total, stable SHA-256 `0ca9e98414b209833559f1c01bd92e29cc05a4ec2a69e1d2651244e33e3d8c78`; all three artifacts pruned only after empty-pin exact-token previews |
| Final owned state | Both source tasks closed and managed refs cleaned; retained usage 0. Project registration, data, release history, receipts and unrelated tasks preserved |

### Measured defect, insight and decision ownership

Observation: `find({project:"pkg-chatgpt-20260930-a1"})` returned none despite an enrolled project
and retained task; the exact private `.git` path returned the correct frontier. Direct cause: project
projection fell back to remote path instead of its policy-relative human name. Immediate fix:
derive that name from the already enrolled checkout/current root; retain the old exact remote alias.
General principle: a well-typed locator must refer to the same user-facing namespace at enrollment,
listing and continuation. A schema probe cannot prove runtime identity resolution. Related surfaces:
project list, terminal display and new-session task discovery. Architecture implication: derive names
in the existing project owner, keep IDs/CAS for concurrency, and never add a mutable current-task
pointer or fuzzy selection to conceal real ambiguity. Evidence strength: installed reproduction plus
restart/replay regression; post-activation installed lookup remains a separate readback below.

Removed choices: none in this patch; the earlier network/executor knobs remain absent. Added choices:
none; project/objective lookup already expresses the intent. Retained choices: exact project key/name,
label/state, explicit task start/predecessor, execution mode, revision/CAS and effect identity.
Internalized choice: local project display-name derivation belongs to the controller's enrolled
project/policy binding. No state or accepted receipt is rewritten, and duplicate names stay ambiguous.

### Qualification and visibility limits

Focused project/continuation tests: **7 passed**; affected project/continuation/surface/HTTP tests:
**33 passed**. `scripts/check.sh`: **332 tests passed in 900.906 s**, plus diff whitespace check.
Inactive bundle rehearsal passed with bundle
`cfe8abe4fa0896e625ef024983ad6a2ad9bf330120cbd070987f513cad584dff`: authenticated HTTP/restart,
retained artifact validation/export/prune, exact source publication and no production service changes.
Actual Codex app-server loader matched all 13 input schemas and effect-free probe calls; this is not
model-inference or ChatGPT rendering acceptance. Tool input schemas and the user's fixed annotations
are unchanged. The owned disposable journey ran on installed 0.1.22; lookup implementation is 0.1.23.

Backend receipts, local caller receive timestamps, MCP/Tunnel delivery and ChatGPT visible rendering
are distinct. The existing `visible_stall` caller report `f9162b133388b3afde97a53ec3e8f462` is not
converted into a backend failure. The independent observer reported stopped at takeover; this run
therefore has no continuous independent observer or new ChatGPT witness/UI timeline. Fresh ChatGPT
one-/two-project semantic continuation and measured visible progress remain open. A new API/admin
key is not required for this local qualification or ordinary installed continuation.

### Intermediate canonical publication and 0.1.23 resident readback

Qualified implementation/evidence was committed and pushed to canonical as
`aa3f60af318bd942a42cb0407319a61fb8b15597`. The owned resident update activated the qualified
`cfe8abe4fa0896e625ef024983ad6a2ad9bf330120cbd070987f513cad584dff` bundle and controller 0.1.23.
Both configured Tunnel connections subsequently reported healthy/running. Fresh bridge clients
verified 13 exact request-envelope tools and unchanged fixed annotations. Direct project-name
lookup returned both closed objectives as ambiguous; adding `label:"a1-source"` uniquely returned
the published/cleaned predecessor with no outstanding effects. The exact legacy remote locator
returned the same frontier. Configuration/profile hashes, enrollment count and the exact unknown
publication row were preserved; no maintenance/install journal remained.

A final cross-surface review then found new create/connect receipts still constructing `name` from
remote path directly, despite corrected current list/find projections. The 0.1.24 follow-up applies
the same project-owned projection at new receipt creation. Existing receipt bytes remain unchanged.
The restart regression now explicitly seeds a pre-fix path-valued receipt and proves exact replay;
existing create/connect tests also assert meaningful human names. Direct cause: two name projection
sites. General insight: current observation and immutable accepted receipt are different kinds of
truth; align new responses but never “repair” historical receipts by rewriting their bytes. No new
field, default, state format or selection policy is introduced.

### Terminal entrypoint finding

The installed `tdev` shortcut still imported the original old/dirty `prj/tdev/src` checkout.
A read-only `tdev ... --connection tdev_janmori project list` actually sent the old flat input and
received `SCHEMA`, effect none, from resident 0.1.23. No mutation was admitted. The shortcut's
old CLI also printed the MCP error without a failing shell status; the qualified CLI already has
proper envelope/error handling. This is a deployment-entrypoint mismatch, not failure of the new
runtime schema. The old source tree must stay untouched. After final qualification, relink only
the recognized owned shortcut to the qualified checkout using the existing `tdev link` owner;
keep its old bytes in private evidence and verify the same terminal read succeeds.
General principle: source, resident, discovery and local command binding are independent version
frontiers. Canonical publication or healthy server alone does not prove a human entrypoint is current.

### Final 0.1.24 source qualification

The receipt-alignment change passed focused **8 tests in 30.392 s**, affected **33 tests in
129.468 s**, and a new complete `scripts/check.sh` run: **332 tests in 1009.823 s**, plus the
whitespace check. No source changes followed that run. Its inactive bundle rehearsal passed as
`34e0b9234eacfd8948c73b0a6c257b75f13503c50a587f9c7fa987d116609e56`, including HTTP/restart,
retained validation/export/prune and exact source publication, with no production service changes.
The tool contract is byte-identical to the earlier 0.1.22/0.1.23 thirteen-tool contract; the recorded
actual Codex loader check is reused for that unchanged input surface, not claimed as a new model run.
Private focused/affected/full and inactive receipts are under `name-receipt-*` in the takeover
evidence directory. The existing actual host continuation guide now starts with a bounded
read-only human-name check; the complete two-project workload remains separate.

### Final canonical/resident/terminal acceptance

Fresh canonical readback matched `dc743395726925b14e34720f6eea005e69a0b719` after the qualified
0.1.24 implementation was pushed. Before activation, the staged file digest matched the inactive
rehearsal exactly, and the maintenance frontier contained only the independently reviewed historical
managed-create publication. Its repository identity was read back as `humtr/tdev`, GitHub ID
1322208918, and its exact managed ref was absent; absence was not treated as failure or success.
The authorized update exempted only `2531fb0f9bbd4aa584865f62898e1010` while preserving it unknown.

The resident activated bundle
`34e0b9234eacfd8948c73b0a6c257b75f13503c50a587f9c7fa987d116609e56` / controller **0.1.24**.
Both configured connections were separately observed healthy/running after startup; each credential
also successfully authenticated a local project-list MCP read. Before/after checks matched every
captured configuration, connection credential/header/profile file, stable connection identity and
runtime identity, and the entire historical unknown operation row. No other running/unknown effect,
maintenance flag or install journal remained. The fresh owned app-data sentinel was still intact.
Live tools/list was byte-equal to the 0.1.23 catalog, including the user's fixed annotations.

Fresh bridge clients again resolved the human project + source label to the closed published
predecessor with no outstanding operation, while the project-only query honestly remained ambiguous.
The recognized owned Termux shortcut was backed up privately and relinked using the existing CLI
owner to `prj/tdev-surface-redesign`; the same project-list command that previously returned SCHEMA
then succeeded with a human project name. No original dirty source, credential, grant, unrelated project source,
retained unknown effect or prior ChatGPT documentation task was overwritten/cleaned.

These results are reflected in the compact public packet. This remains local installed control-plane
readback; it does not claim a new actual ChatGPT call, successful Connector Refresh, host scheduling
or visible UI progress. The actual fresh-session request was supplied to the user; its subsequent
reported result is recorded separately below. The complete one-/two-project ChatGPT workload remains
open. Ordinary continuation uses the existing installation; no new OpenAI admin key is needed.

### Actual fresh ChatGPT material recovery report — 2026-09-30

The user supplied the result of the requested new-conversation check after
`Worked for 2m 30s`. This is host-reported execution evidence, separately corroborated by local
installed state; Local Codex did not execute those three calls or capture raw ChatGPT events.
Fresh rebind at receipt still showed canonical `11f8da4fa61e9ca836573219a82a2839efd4748e`, live
0.1.24 / bundle `34e0b9234eacfd8948c73b0a6c257b75f13503c50a587f9c7fa987d116609e56`, both connections
healthy/running. The bounded call/result record is in the public packet's `freshSessionHostReport`.

| Reported call | Result |
|---|---|
| `tdev_find({request:{project:"pkg-chatgpt-20260930-a1",state:"all"}})` | One project, two task labels: source and failed-switch; `resolution:"ambiguous"` |
| `tdev_find({request:{project:"pkg-chatgpt-20260930-a1",label:"a1-source",state:"all"}})` | Unique closed predecessor; `outstanding:[]`; checkpoint `b0417818e8619c9a63fee36d5b0a84f31e14ed2e`, published checkpoint `b37c6933b482a7ece331af1075c0330f8a537fcc` |
| `tdev_task` inspect using the returned taskId | Source validation succeeded/terminal/exit 0; candidate and publication commit both `b37c6933b482a7ece331af1075c0330f8a537fcc`; publication succeeded; task closed, active null, no processes, ref cleanup done and ref deleted |

Measurement: **3 reported read calls**, **2 tool kinds**, **0 user-supplied internal IDs**, **0
reported mutation calls**. The two exact find inputs were supplied; complete inspect argument JSON
was not, so no limit/cursor or fourth operation-status call is invented. Domain inspection already
returned the original publication receipt. The 150-second reported run duration is coarse; it does
not establish per-call/backend latency or continuous visible progress. The user received a completed
host result, but no independent UI/witness/observer timeline or new injected declaration was captured.

Local Codex then made two separate read calls to confirm the unique source frontier and terminal
validation/publication pairing. These additional local calls are not counted as host calls. They
matched the reported state and left the existing unknown frontier unchanged. No completed effect was
replayed; no new task/build/publication/deployment was admitted and no runtime update was needed.
Only dated documentation/evidence changed; JSON parsing/receipt consistency and `git diff --check`
were checked. Implementation tests were not rerun: the unchanged 0.1.24 qualification remains the
previous focused 8 / affected 33 / full 332, not a newly executed suite.

This passes bounded ChatGPT **material rediscovery**: names + labels recover
a completed predecessor without user-managed IDs, and real ambiguity remains explicit. It does not
pass the complete one-/two-project workload, reconnect with running/unknown work, preservation of
unsubmitted planning intent or quantitative visible-continuity acceptance. No loss-response effect
was deliberately induced in this check. Those dimensions retain their prior evidence/open status.

Observation: the host required only human project/objective locators; IDs were interpreted from
returned state. Direct cause of success: consistent project namespace plus retained labels/frontier.
General principle: stable effect identity and human discovery are complementary; removing IDs is not
needed to remove the user's ID burden. Architecture implication: qualify retrieval of closed
predecessors alongside live tasks, and distinguish successful material rediscovery from recovering
working intent. Evidence strength: user-reported actual host calls + matching installed state;
remaining uncertainty: no raw host capture, running/unknown effect or continuous UI timeline here.


### User-reported 18:30 KST visible stall review — 2026-09-30

The user clarified that ChatGPT kept showing the same visible activity around **18:30 KST**
and they started a new turn to investigate. Successful subsequent reads do not resolve that stall.
A new turn alone does not prove a fresh conversation; the earlier requested fresh-conversation
check retains its successful material lookup evidence, with the session boundary unverified.

Fresh rebind: canonical `8fd364c6744cb8a71277db5059fbb945caadf598`, live **0.1.24** /
`34e0b9234eacfd8948c73b0a6c257b75f13503c50a587f9c7fa987d116609e56`, both connections healthy.
The incident itself belongs to **0.1.22**, instance `02307ca408adab97`, bundle `ec6d43eb…`.
These generations must not be conflated. Read-only diagnostic export retained the live snapshot,
rotated event files and incidents, with hashes and coverage in the private
`.artifacts/installed-journey-20260930/stall-1830-review`. Export is non-atomic; absent rotated
segments and watch capture gaps are disclosed. The public packet contains the bounded analysis.

| KST / boundary | Measured fact |
|---|---|
| 18:29:59–18:30:29 | Request 60 observed the original validation as running; bounded wait returned normally |
| 18:30:36–18:30:41 | Request 61 status returned succeeded/committed/terminal; dispatch 5.065 seconds |
| 18:30:41.841 | HTTP 200; 2,113 bytes written, socket flushed and HTTP finished; complete events 282–300 retained |
| 18:45:02 | Existing principal-reported incident `f9162b133388b3afde97a53ec3e8f462`, reason reported_visible_stall |
| 18:53:41 onward | Later cell_enter/tool_return/cell_exit witnesses exist; none retained in 18:25–18:52 |

Local read-only SQLite joined the retained original validation
`9284e2e8eafb4f37b50dacdee1dd04b9` to the diagnostic operation tag using the matching key generation,
without exporting the correlation key. Its original request is
`installed-acceptance-doc-full-validation-20260930`; receipt remains succeeded/committed, exit 0.
The later canonical-closeout validation has a different original operation/task. Neither was
re-executed in this review. The only current running/unknown effect remains historical publication
`2531fb0f9bbd4aa584865f62898e1010`, unknown/unknown, unchanged.

Finding: backend validation completion and the final server response are confirmed. Tunnel
receipt, JS await continuation, outer-cell delivery and next-cell/assistant/UI scheduling remain
unseparated. In particular, missing witnesses cannot prove a nested-call ceiling or identify a
Code Mode fault. Watch did not persist events 301–370; the stopped independent observer supplied
no live coverage. No exact stalled cell script/host error was provided. The separate 150-second
readback report is not a measured duration for this incident.

Observation: durable backend work succeeded while reported visible progress stalled.
Direct cause: **unresolved** beyond the confirmed server response boundary. Immediate action:
preserve evidence, recognize terminal predecessors, and prepare the bounded read-only comparison
in CONTROLLER.md before expanding the workload. General principle: recovery of material state and
continuous host execution are distinct acceptance gates. Related surfaces: operation monitoring,
physical-cell rollover and caller witnesses. Architecture implication: no provider retry, resident
restart, annotation change or schema rewrite can be justified solely by this evidence. Evidence
strength: exact server events + current immutable receipt + user-visible report; host layer unproven.

Validation performed: export/JSON parsing, event sequence, operation-tag/key-generation join,
terminal receipt, unchanged unknown frontier and diff whitespace. No implementation tests rerun;
no runtime/provider/credential/observer configuration changed. Documentation qualification does not
mark the visible-stall issue fixed. The fetched official
[ChatGPT connection/testing guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt)
describes local Inspector, Tunnel status and live host checks; it does not establish this incident's
physical-cell scheduling outcome.


Follow-up authorization: the user cannot inspect Code Mode and explicitly said all available
permissions are granted. Agent collection replaces the request for user-provided internal cell
code; absence is a capability/evidence boundary, not a request to approve more access. The existing
principal has diagnostic authority. No additional API key or grant was requested.

Read-only Tunnel review recovered **140 INFO forwarded records** in 18:25–18:52 KST, including
successive requests after the terminal server response. Two opaque command-correlation prefixes
exist, without proven conversation/cell semantics. The matching-version public dispatcher source
shows the INFO message after forwardResponses, including some unsuccessful exits; it alone does
not prove control-plane response acceptance. Current runit-owned connections separately pass
health/readiness, successful control-plane polling and main-channel probe. Plugin inventory points
at an older stopped alias, not the active resident: its suggested restart was not used. The local
Tunnel Codex app-server status/events path does not supply remote ChatGPT physical-cell history
(events response HTTP 200, empty body); it is not substituted for that history.

Under this authorization an independent observer samples into a new private directory:
**5-second interval, maximum 3,600 seconds or 64 MiB**, whichever ends first. One supported local
diagnostic activation enables **300 seconds** of trace, returning to watch automatically.
No resident/Tunnel restart or credential/grant/hint change. One authenticated localhost find
verification returned a unique predecessor; its request-41 receipt joins independent samples
containing dispatch, body write, flush and HTTP completion. This qualifies current server capture,
not ChatGPT execution or repaired visible delivery. No development effect replayed. Capture limits
and transport readbacks are recorded in the public packet's agentOwnedFollowup. Documentation/JSON
checks only; no new implementation or full-suite result claimed. Capture cannot supply retroactive
coverage or indefinitely guarantee observation. Subsequent snapshot confirms the trace lease
expired back to watch; historical unknown publication remains unknown/unknown.

## Whole-roadmap review — 2026-09-27

Reviewed at source/canonical head `aa250a66bda9e152f06bea80f17ede4a6c7251e0`.
Compared README, AGENTS, plan, relevant architecture and tool contracts against artifact,
validation and deployment dispatch, the Python package example, isolated rehearsal source and
prior recorded acceptance. This is a scoped plan/evidence audit, not a fresh whole-source defect
review or rerun of historical live acceptance.

The execution owner now has one ordered queue: installed packaging and lifecycle acceptance,
baseline whole ChatGPT journey, measured friction fixes, then conditional semantic notes and
additional package/resource adapters. It removes obsolete installation/diagnostic/connection
implementation prerequisites and separates server freshness from visible continuity. Existing
packaging and note specifications remain; no new authority document or wire schema was added.

Read-only `tdev status` reports controller up/version 0.1.14 and locally healthy running
connections `default` (bearer) and `tdev_janmori` (no-auth). No real workspace/host delivery
acceptance follows from that observation. This review changed no runtime, credentials, services,
observer or user work. Previously recorded 300-test qualification belongs to the executable CLI
change, not to a new test run. This documentation-only review checks diff whitespace, Markdown
local links/anchors in the edited plan/status documents and coherence with the scoped contracts;
focused/affected/full executable suites and live rehearsals were not rerun. No version bump.

## Numbered local CLI menus — 2026-09-27

Fresh local/canonical/remote head: `317b407b7691e26adda8a55662017f8f7c8043bc`.
Source 0.1.14 adds category navigation and stable-ID connection selection over the existing
CLI dispatch. No MCP wire, authentication or resident lifecycle behavior is changed.
Unrelated artifacts/node_modules are preserved. Evidence: `.artifacts/cli-menus-20260927/`.

- Focused: `PYTHONPATH=src:.tdev-deps python -m unittest discover -s tests -p test_cli.py -v`,
  **18 tests, OK, 11.280s** (`focused-final.log`).
- Affected: `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_connections test_installer_setup test_observer_continuous test_contract test_bridge -v`,
  **41 tests, OK, 29.853s**, exit 0 (`affected.log`, `affected.exit`).
- Full: `sh scripts/check.sh`, **300 tests, OK, 754.671s**, exit 0
  (`check.log`, `check.exit`), including the diff whitespace check. Existing SQLite
  ResourceWarnings appeared in fixture collection; this is not a warning-free claim.

Tests exercise terminal navigation/back/quit, invalid choices, EOF/interrupt without effects,
empty connections, stable-ID selection and installation root preservation, destructive-action
confirmation, single diagnostic/observer dispatch, non-terminal help with no calls/writes,
and contract-valid observation arguments. The first focused run caught a project-menu prompt
incorrectly asking for owner/repo; the wire contract instead requires a registered repository ID.
The corrected prompt and contract check pass; the initial failure remains in `focused.log`.

Real Termux PTY checks used the installed `tdev` shortcut: root menu → exit, connection menu →
authentication action → existing default connection picker → back → quit. No mutation was
selected. Non-terminal `tdev help` also passed. The shortcut loads this checkout, so menus are
available immediately without service replacement. Read-only `/healthz` now reports an existing
resident **0.1.13 / up**, differing from the prior qualification note's 0.1.11. This session did
not perform that update, any mode/token change, clipboard write, or observer start/stop.
No additional pinned-client, SDK or deployment rehearsal was run for this navigation-only
change; existing connection tests cover compatibility. Real ChatGPT multi-workspace acceptance
remains separate and outstanding.

## Local CLI and multiple Tunnel connections — 2026-09-27

Fresh source/canonical/remote head: `302c91bf57d313e071bfc2a281514ee73838e6ee`.
README/AGENTS, authentication/resident architecture, config/tool contracts, execution order and
installer/resident/core source were rebound. The subsequent user requirement adds a local CLI
rather than requiring users to assemble install.sh options. Source 0.1.13 adds connection-owned
lifecycle and additional credentials mapping to the existing owner; the original compatibility
secret remains unchanged. No new MCP management endpoint or per-workspace RBAC is introduced.

`./tdev link` installed an owned command at `$PREFIX/bin/tdev` and `tdev help`/`tdev status`
readback succeeded. The command points at this checkout, not a replacement resident bundle.
Read-only production status still reports 0.1.11 / watch and the existing default Bearer Tunnel.
No production update, connection migration, mode switch, token rotation, clipboard write or
observer restart was performed. Existing artifacts, node_modules, profiles and observations survive.

Focused CLI/connection checks passed **24 tests in 37.949s** on the final executable source. Earlier affected CLI, connections,
setup, admin, resident, HTTP and contract checks passed **63 tests in 99.385s**; subsequent focused
coverage adds the friendly no-auth spelling, malformed profile/credential rejection, standalone
expanded tool schemas, and status refusing to claim an unowned listener as healthy. Full
repository validation passed **291 tests in 765.003s**, with `OK` in check-final.log. Both
staged and unstaged `git diff --check` passed after completion. The original process handle
was unavailable after session resume, so a separately retrieved process exit code is not claimed. Evidence is in
`.artifacts/multi-connection-20260927/`.

Coverage includes multiple credentials sharing one owner/workspace/replay, real HTTP revocation,
compatibility token preservation, dedicated disable/revoke/rotate/remove, mode header scope and
secret preservation, no restart of unrelated services, same shared runtime-key source preservation,
rename identity, zero-connection install, update/uninstall, crash after revocation or rotation,
failed stop, config CAS conflict, remote health degradation, old-bundle rollback rejection and
security-snapshot rejection. CLI tests cover all-tool forwarding, exact request identity/no retry,
nonzero tool errors, non-TTY help, guided installation, shortcut conflicts and explicit token
clipboard/fallback delivery. Existing real PTY/clipboard timeout/secret-input tests remain covered.

The first affected run found that old inactive bundle fixtures lack a config schema; compatibility
validation was limited to present schemas while new connection state still requires a capable
bundle. This failure is preserved in affected-initial.log. The initial inactive rehearsal reached
native recovery/artifact checks but failed its synthetic launcher settings, which omitted Tunnel
ID. The fixture now supplies the required legacy identity; no production validation was weakened.
The successful inactive rehearsal is in rehearsal-final.log, bundle
`ea36092b8754162777468e3d6b6cf624d1800acad8746702c5f22426de0ffd3c`. After final CLI changes,
both inactive and real-runit rehearsals passed again against the same final bundle
`95b3bb5e7a0748c4e29712e809f5575239e7b709eb87f937f4d07c3cd2cb96dd`
(rehearsal-qualified.log and services-qualified-final.log).

The initial full run was deliberately interrupted (exit 130) after the CLI review found two
additional improvements: binding status to installation process identity and expanding schema
references. It is retained as check.log, not counted as PASS. The new status fixture initially
lacked an installation identity and inherited the live supervisor path; its corrected fixture
now has explicit identity and a disposable SVDIR. The final focused run above passes. Full
validation of the final source is in check-final.log. It includes the existing unclosed SQLite
ResourceWarning from fixture collection; this is not claimed as a warning-free run.

Pinned native tunnel-client 0.0.14 forwarding checks passed both profiles: no host credential
succeeds in compatible mode and fails in Bearer-required mode; valid Bearer succeeds in both and
invalid Bearer fails in both. Startup discovery and all twelve-tool discovery/call remain valid;
local auth/Host/Origin and secret scoping checks pass. Official MCP SDK 2.0.0 also passed.
These are local mock-control-plane tests, not real ChatGPT or cross-organization acceptance.

Real isolated runit rehearsal passes multiple simultaneous client processes, connection mode
change/disable/rotate/enable/remove, unrelated controller/client PID preservation, common update,
intentional DOWN, root-monitor recovery and uninstall. Its Tunnel executable is a process fixture,
separate from the actual pinned-client forwarding check. Production services are not involved.
Real independent OpenAI account/workspace connections and ChatGPT connector UI acceptance remain
outstanding; local credentials do not attest a Tunnel path or user-visible progress.

## Interactive installation and Tunnel local authentication — 2026-09-27

Fresh local/canonical/remote `tdev` head: `7f62191ca40a5f24fc379a4a950737b364753d41`.
README/AGENTS, installer/auth/resident architecture, config and MCP contracts, implementation
order, operations, installer/admin/resident/server source and their tests were rebound from source.
No managed-task-only publication rule is present for this authorized local checkout work.
Existing untracked operator artifacts and node_modules are preserved.

The actual pin remains tunnel-client **0.0.14**, Go module source commit
`0f870e50a973fa820d4c409000059e181e8d242b`. Reviewed its configuration guide, runtimeconfig
file-reference loading, static/forwarding round-tripper order, startup probe and Unix socket
support. [Pinned configuration](https://github.com/openai/tunnel-client/blob/v0.0.14/docs/configuration.md)
documents local MCP/header scopes; implementation applies connector headers last, overriding
static headers case-insensitively. Whole-header `file:` values require a private derived header
file, while connector.secret remains the existing raw token format for other clients.
The [current OpenAI Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
requires organization/workspace association and Tunnels Read/Use; the
[connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) describes private
developer-mode Tunnel connections. This is documented admission policy, not a live cross-account
penetration test or proof that every ChatGPT UI offers the same authentication controls.

Source **0.1.12** implements missing-input-only TTY setup, hidden runtime-key entry, default
Tunnel-local auth and explicit Bearer compatibility. Complete CLI inputs do not prompt.
Preexisting config/profile adoption retains the old Bearer default; resident updates retain
the exact profile and credentials and reject mode selection. Profiles with custom MCP headers
are rejected for adoption rather than silently rewritten. New personal Tunnel mode shares one
local principal and adds no grants. Direct localhost remains authenticated. Unix sockets are
supported upstream but would require tdev server/readiness/bridge changes, so they and per-user
OAuth are deferred. No MCP/config wire shape or state-schema migration was required; the new
optional resident setting is installer-owned. The patch version changes for delivered installer code.

Two adjacent defects were corrected: input validation now matches the pinned client's exact
Tunnel ID format, and first initialization can finish an interrupted secret/config pair without
rotating its secret. Missing config for an existing state DB is rejected. Pending setup metadata
contains no credential bytes; interruption/retry preserves auth mode and file identity. Clipboard
uses stdin and a bounded private process group; unavailable/failed/timed-out API is nonfatal.
The installed Termux clipboard wrapper's stdin path was read directly; the real device clipboard
was not overwritten by tests.

Focused TTY/setup checks first passed 13 tests in 3.291s; the expanded setup and lifecycle run
passed 15 in 49.520s. After final input/clipboard changes, affected setup/admin/resident/HTTP
checks passed **40 tests in 85.206s**. Coverage includes real PTYs, hidden key input, invalid ID
retry, EOF, echo restoration on interrupt, non-TTY behavior, main-entry install/failure/retry/update,
credential permissions/mismatch, clipboard success/failure/absence/timeout, and auth-file preservation
through first-install failure, update, rollback, uninstall and reinstall.

`scripts/check_tunnel_auth.py` passed using the actual pinned native binary against a disposable
real tdev server and local mock control plane. Both generated profiles complete authenticated
startup `server/discover` (HTTP 200), tools/list (12 tools) and tools/call. No-host-Bearer requests
succeed only in Tunnel mode; missing host Bearer in compatibility mode and wrong incoming Bearer
in either mode return 401. Case-insensitive incoming Authorization precedence is exercised.
Direct localhost missing/wrong credentials fail; Host/Origin and owner principal mapping remain
correct. The internal secret is absent from upstream requests/responses and ordinary client logs;
the separate runtime key is absent from local MCP requests. Early harness failures were fixture
errors (invalid sample ID, metadata GET consuming queued commands, and an incomplete startup-probe
assertion); corrected checks assert successful modern discovery rather than equating a rejected
initial probe with the complete discovery outcome. No server protocol downgrade was introduced.

Official MCP SDK 2.0.0 checks passed. Inactive bundled native recovery/artifact/HTTP rehearsal
passed, candidate `57623fc946f6d3ed423988b59b417a7d1555d0302f5bc45c572e4162db0c3f1a`.
Real isolated runit rehearsal passed service and root-monitor crash recovery, update, intentional
DOWN and uninstall, preserving all internal-auth files. Its Tunnel process is a fixture;
the separate forwarding check above uses the actual binary. No production services were touched.
The first full `scripts/check.sh` run was interrupted before a completion result. Its log is
preserved as `check.log` and is not counted as PASS. The resumed full `sh scripts/check.sh`
passed **267 tests in 710.903s**, exit code 0, including the diff whitespace check. Its log is
`check-resumed.log`. Both logs include the preexisting unclosed SQLite ResourceWarning in test
fixture collection; this is not represented as a warning-free run. The qualified source is
0.1.12; the existing resident remains **0.1.11 / watch**, with its profile, credentials and
independent observer unchanged. Source publication does not constitute resident deployment.
Evidence: `.artifacts/installer-auth-20260927/`.

Real ChatGPT no-custom-credential discovery/call acceptance on a newly configured Tunnel remains
outstanding. Local mock-control-plane success does not prove OpenAI account admission, current
ChatGPT UI availability, same-turn liveness or per-user identity. Existing resident authentication
must not be implicitly migrated to obtain that acceptance.

## Native working-budget propagation — 2026-09-26

Starting source/remote head: `d10a2b1cec56390547a531c673ad044b6e09cc83`. The installed
0.1.10 config selects `artifactLimits.workingBytes=536870912`, but ordinary native launch
omitted the field. Consequently the child used the 128 MiB fallback for `RLIMIT_FSIZE` and
sampled working storage. Source 0.1.11 passes only the selected workingBytes into new native
command/process/source-validation payloads and retained intents. It does not change config,
remote execution, source-capture limits, old accepted payloads or replay ownership.

The regression was demonstrated before the fix: three tests failed (five subtest/failure
reports), including all three execution modes, frozen budget and aggregate storage enforcement.
After the fix, four focused tests passed in 17.020s. They verify the real child's rlimit and
creation of a 173,101,495-byte regular sparse file via ftruncate, default-limit EFBIG, retained
budget across config change/reconnect/replay, and two individually smaller files exceeding the
aggregate budget. These fixture files are disposable; no user rollout file was accessed.
Affected native/environment/recovery/contract checks passed **46 tests in 93.797s**.

Inactive staged-bundle rehearsal passed (exit 0), including native crash/reconnect without
relaunch, exact publication, retained artifact build/validation/export/prune, HTTP authentication
and twelve-tool discovery across restart. Candidate bundle:
`06023908919bafac20b372beea579c4c5fa7af146121d301727d20b0e9f3cf24`.
Full `sh scripts/check.sh` passed **252 tests in 608.680s**, exit 0, including the diff
whitespace check. Its log contains the previously observed unclosed SQLite ResourceWarning
from fixture collection; no test failed. Installed acceptance follows below.
The separate official SDK check was not rerun: wire input/output shapes are unchanged, and the affected
contract tests plus staged HTTP checks cover the changed description and native payload.
Evidence is in `.artifacts/native-workingbytes-20260927/`.

Source commit `b820136f251295af1159805039cd803636043757` was pushed to `origin/tdev` before
cutover. An unrelated existing operation `d88b210abfe44e32824af1b1356175c8` remained genuinely
running, with recent output; installation waited. It later finished failed, exit code 1, observed
through normal authenticated operation status. This is not a failure of the above fixture suite.
No operation was cancelled/relaunched and no state DB rows were edited to bypass installation.

The controlled installer and subsequent `--check` passed. Resident **0.1.11 / watch** runs the
exact qualified candidate above; installed file hashes match source. Controller PID 20233,
native-CGO tunnel PID 20251, successful control-plane polling. Config hash is unchanged, including
workingBytes=536870912. Seven prior incidents/ack states and the correlation key are preserved;
storage error counters are zero. Authenticated discovery still exposes twelve tools.
New diagnostic instance `d90790a695741dcf` replaces `4a6f9860d32b9ba5`.
Absent rotated logs remain explicit export coverage gaps.

An isolated fixture using the actual installed bundle and copied workingBytes setting exercised
ordinary native exec: it wrote 173,101,495 bytes of authored data, copied through a symlink into a
regular file, compared SHA-256 content and removed only those fixture files. The child reported
both RLIMIT_FSIZE values as 536870912 and completed successfully. This is installed-code/native-child
acceptance, not a live MCP task or a copy of the user's rollout. The source-capture boundary is
unchanged. Results are in `installed-copy.json` and `installed-acceptance.json`.

The independent observer PID 19489 continued without restart, sampled the new runtime instance
and recorded one generation change with no observed unavailable samples, storage errors or
event gaps. Its pinned 0.1.10 sampler remains compatible; no observer source changed in this fix.
Sampling cannot exclude an inter-sample outage or establish ChatGPT visible delivery. Details are
in `observer-after.json`; installer/check output and before/after diagnostic exports are retained
alongside it. Only documentation changed after qualification, so whitespace checks were rerun
without repeating the full executable suite.

## Bounded ChatGPT caller adapter — 2026-09-26

Starting local/remote `tdev` head: `a558164df7d3186cab3b11f93bc04898bf21fde8`.
The caller-side reference function and controller instructions live in `examples/chatgpt`.
No server code, MCP wire contract, installed runtime, observer, credentials or incident state
was changed. No C20/C22 or live Stop experiment was run. The product runtime version remains
0.1.9 because this change ships caller source and documentation, not a new runtime component.

The reference policy counts all nested attempts before dispatch and reserves sparse closing
witnesses within the same budget. A fresh JS realm resumes the remaining plan with a fresh
counter. A lost operational reply stops for original-identity reconciliation; classification/
output failures require review. Time limits apply only between awaits. The helper cannot force
ChatGPT to receive an outer result, schedule another cell, cancel execution or update its UI.

Executed focused check: `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_chatgpt_cell -v`
passed one Python wrapper and all ten Node.js controller tests (Node v24.18.0).
Executed affected check: `PYTHONPATH=src:.tdev-deps:tests python -m unittest test_chatgpt_cell
test_contract test_diagnostic_witness -v` passed 12 Python tests, including those ten JS cases,
in 12.798 seconds. These use disposable fixtures, not the resident controller/observer.

Full `sh scripts/check.sh` passed all 235 Python tests (including the ten Node.js cases) in
871.671 seconds, with exit code 0 and the diff whitespace check passing. Its log and generated
ChatGPT handoff are in `.artifacts/chatgpt-cell-controller-20260926/` (untracked local evidence).
Standalone official SDK, installed Codex, inactive deployment rehearsal and real ChatGPT
acceptance were not run for this caller-only change. Affected tests include the existing
HTTP/bridge/witness/independent-observer fixture. Actual ChatGPT outer-result receipt, fresh-cell
scheduling and visible progress must be assessed during normal authorized work, not inferred
from the local 16/16/8 fake-tool test or from backend completion.

## Resident caller guidance and observer frontiers — 2026-09-26

Starting source/remote head: `cbabcfb5eb2b212468556ba8d466a5f6fa914cd7`. The user explicitly
requested applying the change to the resident and observer. Source 0.1.10 advertises adjustable
ChatGPT caller guidance through the existing operation-tool description, without imposing a
server limit or adding wire fields. The independent observer derives bounded per-generation
counters and latest run witnesses, labels retained baseline history, and preserves raw snapshots.
The continuous command is now source-owned at `scripts/tdev-observe`; it remains a separate
operator process with the existing retention settings. No private ChatGPT telemetry is claimed.

Focused checks passed: observer frontier/bounded observer/HTTP (15 tests, 43.089s) and continuous
observer fixtures (7 tests, 13.677s). The first combined affected run was interrupted with no
completion result; its leftover disposable observer was identified by its command and temporary
root, then stopped normally. Its files and the production observer were preserved. The resumed
combined run passed **34 tests in 50.111s**, including the ten JS caller tests. Official MCP SDK
and inactive staged-bundle restart/native recovery/artifact checks passed (exit 0), candidate
bundle `2379801775c3d8f2e3619e1c3295198cf4edaf05d42afb58e8d938a1dda9950a`.

Full `sh scripts/check.sh` passed **248 tests in 606.298s**, exit code 0, including the
Node.js caller checks and diff whitespace check. Installed acceptance follows below. Evidence is in
`.artifacts/runtime-observer-rollover-20260926/`. The full log includes an unclosed SQLite
ResourceWarning during fixture garbage collection; the preceding 235-test baseline log also
contains this warning. It is not hidden as a clean warning-free run. No failed test has been
observed in the completed run.

Installer preflight found retained exec `2378f2a3f1cb47d1b0ca2f9a4e50d390` still marked running.
A normal authenticated operation-status read reconciled it to succeeded/committed, exit code 0.
No DB update, command relaunch or effect cancellation was used. The C20/C22 source segment
`20260926-160813-coarse-228cd9c7` was pinned and its previously reported SHA-256 reverified before
cutover preparation. Prior shortcut bytes and current observer settings were backed up.

## Resident caller guidance and observer installed acceptance — 2026-09-26

Source commit `753c895` was pushed to `origin/tdev` before the authorized cutover. The controlled
installer and separate `--check` passed with resident **0.1.10 / watch**, bundle
`2379801775c3d8f2e3619e1c3295198cf4edaf05d42afb58e8d938a1dda9950a`.
Controller PID 12847; native-CGO tunnel PID 12863 with successful control-plane polling.
Installed files match the qualified source exactly. Config SHA-256 is unchanged, all seven
prior incidents and acknowledgment states survive, and the correlation key is preserved.
New process witness instance: `4a6f9860d32b9ba5` (previous `658aa49fc2d185c2`). Existing old-instance
witness arguments must not be reused after this restart. Authenticated HTTP discovery returns
all twelve tools and the new operation-tool caller guidance. No new marker experiment or
incident report/ack was performed. Optional rotated logs absent before and after export remain
explicit coverage gaps, not a claim of complete tracing. Diagnostic storage errors were zero.

The existing coarse observer ran through the resident replacement and sampled the new instance
before its own controlled update. The cutover segment contains 108 old-instance samples and six
new-instance samples, with no unavailable sample observed (sampling cannot exclude a shorter
inter-sample outage). Its last segment was gracefully closed and its SHA-256 checked;
current/prior cutover segments and the historical boundary segment were pinned. The private
command now matches `scripts/tdev-observe`, revision 2, SHA-256
`1481c5f2dfec385d8490b3baf92d5639ca7bd6b5e0edc6203c8a804121dc1aaf`.
New independent worker PID 15003 uses the exact installed sampler bundle. It retains 10-second
sampling, hourly/64 MiB rollover, 24-hour/512 MiB retention with KEEP exemptions; fine mode was
inactive and was not started. The old-last/new-first sample interval was **2.660422707 seconds**.
First sample contained the expected frontier/instance with zero unavailable/storage errors;
a later nine-sample readback also had zero unavailable, storage errors and event gaps.
Observer process restart establishes a new baseline, so its generationChanges counter begins
at zero; the cross-worker transition is documented here and in the cutover evidence packet.

Evidence: `.artifacts/runtime-observer-rollover-20260926/` contains the full/affected/SDK/rehearsal
logs, before/after diagnostic exports, installer/check output, installed-acceptance.json,
observer-cutover.json, prior shortcut bytes and preserved-boundary-evidence.json. Existing user
observations, credentials and unrelated files were preserved. The pre-update script backup can
be restored independently of the resident; production rollback still uses the installer.

Real ChatGPT discovery must be refreshed to receive the updated tool description. This only
publishes caller guidance; it cannot force the assistant to use the helper, issue another cell
or update the visible UI. Existing full controller instructions and helper remain the executable
reference. Real ChatGPT scheduling/visible continuity remains outstanding and is to be assessed
during normal authorized work, not another density or Stop experiment.

## Short piped installation entry — 2026-09-28

The user requested the conventional short `curl … | bash` form. `i` is a single parsed
shell block which downloads the full bootstrap, propagates its download failure and opens
`/dev/tty` for the setup wizard before executing it. The `setup` branch exposes the short URL;
the selected repository/source branch and existing bootstrap behaviour remain unchanged.
README and INSTALL now show the 70-character command plus missing-curl recovery.
No new tests or suite runs were performed for this entry point; the earlier 320-test result
applies to the bootstrap implementation before this wrapper. The operating resident is unchanged.

## Baseline journey resumption preflight — 2026-09-28

The user selected implementation-plan step 3 after first-install documentation. Current tool
discovery exposes no tdev connector tools in this session. Local CLI observation uses the explicit
`tdev_janmori` connection and is not a ChatGPT/Tunnel acceptance run. Controller **0.1.14 / up**
and both registered connections report healthy/running. Current bundle remains
`e356a2c6aea607050e9124ef6be8276c779a2721f033ef8ac092423f27f2dbe3`; config SHA-256 remains
`dcc86d5de0b556e061160e0a9062bd5fc0e3efe1c7bf91ac984d142798d63cf8`, matching the earlier audit.
Read-only SQLite observation finds no running/unknown operations, all five prior trial tasks
closed with managed refs deleted, and all 60 trial operations succeeded. Closed trial effects
were not relaunched. Evidence: `.artifacts/journey-resume-20260928/snapshot.json` and status files.

Diagnostic inspection reports watch, instance `2e2e0deeed4fa5b0`, and zero storage errors.
The independent observer is stopped; its last sample was about 26 hours old at observation.
Historical samples do not cover a new host trial. No observer, controller, credentials, grants or
service lifecycle was changed. No tests were run: this turn only prepared acceptance and recorded
current observations. Actual host development/reconnect and screen progress remain unverified.

Next dependent action: open a ChatGPT conversation exposing the tdev tools and follow
`examples/chatgpt/JOURNEY.md` from a new owned trial identity. Prior closed tasks remain historical
evidence. That guide contains the complete working prompt; existing local success need not be
repeated merely because the host tools are absent. Independent capture requires a separately
selected observer start if desired; lack of capture must be recorded, not inferred away.

## Observer context binding — 2026-09-28

Fresh rebind used README/current development navigation, installation/native/diagnostic semantics
in ARCHITECTURE, the diagnostic contract and current installer/resident/CLI/collector code.
The source baseline is recorded in `.artifacts/observer-context-20260928/read-only-validation.json`;
qualification includes the working changes, not a claim of a committed release. Existing dirty
bootstrap/install work is preserved. No resident/provider/credential changes or live collector control commands were issued.

The defect reproduced: the HEAD collector invoked with a temporary HOME and the actual selected
installation printed “기록된 연속 observer가 없습니다.” It created its empty status directory in
that disposable HOME. The revised CLI, from ordinary and temporary HOME with explicit `--root`
and with `TDEV_ROOT`, instead read the same operator evidence root and existing coarse PID
10748 / process start 172536607 / segment `20260928-213106-coarse-b1f96cb7`. Its recording root
was `/data/data/com.termux/files/home/tdev-observations`; the selected installation was
`/data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8`.
This establishes an invocation-context false negative, not a failed collector.

Root cause: the CLI only passed `TDEV_OBSERVE_ROOT`; the collector defaulted its independent
recording root to caller `Path.home()`. The existing normative owner for operator HOME is
`resident.json.home`, captured by installation and reused by service launchers/updates. The CLI
now explicitly passes its default evidence path from that owner, preserving `TDEV_OBSERVE_DIR`
overrides without evidence moves or native HOME changes. No MCP wire type or server diagnostic
owner changed. Source collector revision 3 adds recorded root identity; the live collector stays
revision 2. Its process identity is verified, but installation binding is honestly
`unknown_legacy` because neither its old record nor process environment contains an explicit
root. A separate bounded tail read joined a current sample's server PID 24176 and instance
`2e2e0deeed4fa5b0` to that live server's `--state`/`--config` under the selected installation.
This verifies the observed sample's runtime association without inventing missing legacy worker
metadata. A later read kept the same observer PID/start/segment and samples advanced 236 → 263;
unavailable/storageErrors/eventGaps/missingEvents/regressions remained zero.

Status now reads bounded regular mode files without creating directories/locks, sending signals,
pruning evidence or calling the server. It shows both modes and distinct absence, retained/stale,
invalid/inaccessible and installation-mismatch outcomes, plus root/process/script/sample/coverage
identity. This is independent local observation, not a new `tdev_diagnostics` surface.

Initial focused/affected checks passed 53 tests. Expanded affected checks passed 61 tests
(observer continuous/frontier/bounded sampler, CLI, resident). Final focused checks passed
21 tests (continuous observer and CLI menus). The resumed full `sh scripts/check.sh` passed
**326 tests in 745.786 seconds**, exit **0**, including `git diff --check`. Logs and the exit-code
receipt are `check-resumed.log` and `check-resumed-result.json` in the evidence directory. The
first full run was interrupted before its summary (186th test in progress); `check.log` is
retained as incomplete, not PASS. Tests cover ordinary/isolated HOME, explicit/env/marker root
selection, custom directory/alias and missing owner, live/stale PID/status, stopped and orphaned
evidence, coarse/fine coexistence, read-only status including missing directories, corrupt/link/
FIFO/inaccessible records, cross-installation control refusal, and retained bytes/operator HOME
across a staged installation update using the fake runit backend. Real installed update was not run.

The user reports actual ChatGPT reconnect/visible acceptance: fresh-session name discovery of
project/workspace/task; bounded frontier recovery recognizing completed effects without replay;
new `resume-proof.txt` forward effect/readback; user-confirmed prior-session handoff visibility
and new-session final delivery; independent observer coverage and a matching caller witness.
These are user-supplied host/visible results, not independently recreated by this local CLI test.
They supersede the earlier pending assessment for that reported reconnect trial, without claiming
all broader one-/two-project baseline gates. The earlier “observer stopped” preparation entry
must not be reused as this trial's coverage verdict without binding its recording root/time.
Keep server, caller, independent observer and user-visible timelines distinct.

Deployment/verification: use the qualified source-backed CLI with the original installation and
custom directory (if any), compare normal versus isolated HOME JSON, then confirm unchanged
PID/start/segment and increasing samples. This status-only adoption requires no resident update
or collector restart. The installed `/data/data/com.termux/files/usr/bin/tdev` shortcut already
points to this checkout; invoking that actual command from temporary HOME also found PID 10748
and the same root, with samples at 291. The shortcut itself was not rewritten. Existing
private-bin collector was still running at revision 2 at that read; see the final observation below.
Only a separately authorized collector upgrade needs evidence KEEP/script preservation, graceful
mode-by-mode cutover with saved settings, new sample/identity verification and measured old-last
to new-first sample gap, as specified in OPERATIONS. No cutover was performed in this work.

Final read-only confirmation found a later state change: PID 10748 no longer exists and the
original coarse record reports `stopped_evidence_exists`, revision 2, 316 samples. Its last
sample is **2026-09-28 13:23:53.636 UTC** and graceful stop receipt is **13:24:01.187 UTC**
(22:24:01 local +09:00). The original segment `20260928-213106-coarse-b1f96cb7` remains intact;
its `observation.json` reports `stopReason=stopped`, and a streamed SHA-256 check matches the
retained sample bytes. Unavailable/storageErrors/eventGaps/missingEvents/regressions are all zero
for those retained samples. They do not establish coverage after the last sample.

No operational observer stop/start was issued by this work. This stop predates the resumed
full suite (started 13:32:37 UTC); the initiating actor/signal is not established by the stored
receipt, so do not attribute it to the CLI change or infer continued capture. The source repair
and earlier live read-only acceptance remain valid; current capture is stopped. No automatic
restart, collector upgrade or runtime repair was attempted. If capture is resumed, explicitly
select the original root/directory and saved coarse settings (10 seconds, 3600-second/64 MiB
segments), preserve this closed segment, verify the new process/sample identity and report the
coverage gap from 13:23:53.636 UTC. That is a separate operator action, not a prerequisite for
using the corrected read-only CLI.


## Real ChatGPT successor-cell visible divergence — 2026-09-29

During normal authorized `humtr/tdev` work, the user reported that the visible ChatGPT surface
stopped after the host/tool-group label "Ran focused diagnostic policy test and checked operation
status". A fresh durable task inspection after that report showed later work had nevertheless
continued on the same source task: request `exec-wait-successor-first-probe-20260929`, operation
`0a5acea60d2c4dbc9147d92527c1bf96`, was already `succeeded` / `committed` with exit code 0,
and the task checkpoint had advanced to `04deda988d6417d5ff3b194465e4d03ff49e53c1`.
No standalone assistant progress commentary was inserted between that probe's admission and its
first two status cells. This therefore disproves a stronger hypothesis that a standalone progress
message is required for the visible continuation loss. It does not identify which ChatGPT host/UI
stage failed; tdev backend completion is not proof of visible delivery.

Attempts to hide successor scheduling by performing multiple 30-second status waits inside one
physical Code Mode cell were also not a safe workaround in this run: larger multi-wait cells hit
the outer Code Mode cell timeout, while a single `status(waitMs=30000)` physical cell repeatedly
returned current backend progress. The caller helper default was therefore restored to one
bounded status call per physical cell; same-operation identity, output cursor advancement and
no-replay semantics remain unchanged. Ordinary ChatGPT command/source-validation admission may
still send explicit `waitMs=30000` once the refreshed connector schema exposes that source
contract. The currently connected ChatGPT-side `tdev_exec` schema did not yet accept `waitMs`
during this evidence run, so source implementation and live connector acceptance remain separate
acceptance facts.
# Surface redesign review — 2026-09-30

**Status: source 0.1.22 implements the selected thirteen-tool design; final local qualification
passes 331 tests, actual Codex/SDK and inactive bundle checks. Selected find/start/release and
final command/process host probes pass their reported checks. The production resident is unchanged.** This section records evidence/candidate analysis, not a replacement
for ARCHITECTURE or the canonical contract. The first user-supplied fresh ChatGPT report confirms
useful nested typing but finds a task-start branch collapsed to `Exclude<any, any>`. The user
requires host evidence before broader implementation; the revised B2 typing gate passed in the user-supplied fresh-host report. No passing schema test below
is represented as ChatGPT acceptance or measured model accuracy.

## A. Fresh authority and current state

- Entry checkout: `/data/data/com.termux/files/home/prj/tdev`, local branch `tdev`,
  `0f6b78e18ec6abfad830bfd8e65917c7c128149a`, source 0.1.16, with substantial pre-existing
  installer/observer/source/document/test changes. All were preserved.
- Fresh remote `refs/heads/tdev`: `b418c1ddb97af052f80430f3d55802cf3060cfe2`, source 0.1.21.
  `origin/HEAD` points at historical `development` (`afd2853...`); it is not this product's
  development authority. The resident's enrolled tdev repository independently reports
  `refs/heads/tdev` at `b418c1d`. Rechecked unchanged after key setup.
- New isolated worktree: `../tdev-surface-redesign`, branch `redesign/surface-20260930`, based
  on that exact tdev commit. AGENTS, README, applicable ARCHITECTURE semantics, canonical input
  definitions and IMPLEMENTATION_PLAN were rebound there after detecting the stale checkout.
- Resident: 0.1.21, bundle
  `635c8080c9e21a459099bc4e10f0e14d36515ad606d89094a87f7799583f8441`, controller up, diagnostics
  watch. `default` (bearer) and `tdev_janmori` (Tunnel auth) locally healthy/running. This is
  runtime observation, not a claim that this Codex conversation has their tools injected.
- At 03:40:08 UTC: 43 open / 72 closed tasks, 2,088 succeeded / 322 failed operations,
  one unknown publication `2531fb0f9bbd4aa584865f62898e1010` on task
  `0fc0709559c940589a0a54808dfa849c`. Earlier read-only observation showed one running
  validation and 44 open tasks; another actor's work completed between reads. Neither was
  restarted, cancelled, reconciled or closed by this review. Counts are timestamped facts.
- Source and resident contract SHA-256 both
  `35ea0a5ed2d7d7d85957117e85e72d2fb7f0e0640156cf2e4908ea54adf9bebf`.
  Authenticated resident `tools/list` equals the expanded source advertisement and the local
  legacy bridge representation. Raw captures and timestamped state are in
  [probe evidence](examples/surface-probe/evidence/authority.json).
- The same contract was fetched without authentication from public GitHub at the exact commit;
  bytes match. The probe exposes only derivatives of that public schema. It has no resident,
  project, state, command execution or credential-reading path.

Owners remain README (status), ARCHITECTURE (meaning), `contracts/tools.schema.json` (wire),
IMPLEMENTATION_PLAN (sequence). No old chat/handoff/version or historical tmcp design was used
as current authority. The user explicitly reconfirmed the fixed host annotation profile,
including `readOnlyHint=true`, to avoid repetitive permission popups. Preserve it. Changing
these hints is outside this redesign unless the popup behavior is first solved and qualified.

## B. Workload and state model before tool names

The natural responsibilities are discovery of an authorized target, selection/creation of
isolated work, observation of immutable source, source changes, execution intent, observation
of an admitted effect, mandatory candidate verification, exact source publication, retained
artifact production/verification, deployment switching, current health observation, and owned
cleanup. A transport connection and an assistant conversation are not work owners. Workspace
membership is useful composition and never an authority grant or mandatory user ritual.

The durable transitions must remain distinct:

`source changed → tested → candidate validated → source published`

`candidate validated → artifact built → artifact validated → deployment switched → health observed`

These are dependencies, not an automatic workflow: publication is not required for every
local artifact deployment; source-only deployment remains a meaningful distinct strategy.
No automatic validate/publish/deploy chain is proposed. Tests run by `run` cannot substitute
for adopted mandatory validation, and healthy-now is a time-bounded observation, not a durable
property of an old successful release receipt.

Stable identities belong at task/source CAS, effect admission, validation candidate, artifact
content, deployment revision and cleanup ownership. A new domain-specific job hierarchy adds
no demonstrated value. Keep a common durable operation receipt for accepted asynchronous
effects; give source/artifact/release receipts explicit subject types inside it.

## C. Current surface audit

The [generated field inventory](examples/surface-probe/generated/field-inventory.json) contains
every current branch, its full field schemas, required list, nested schemas and conditionals.
The following table summarizes responsibilities and candidate disposition. Root counts are
**advertised property counts**; action counts expand enum arms and subject variants.

| Tool | Variants / root fields | Effects and composition | Principal problem / missing decision | Proposed disposition |
|---|---:|---|---|---|
| workspace | 7 / 13 | list/inspect plus composition mutations; root canonical union, flat discovery | Membership/default rules hide behind broad lifecycle description; no name lookup; default space is useful controller work | Split observations; keep explicit composition mutations and automatic default space |
| task | 9 / 21 | list/inspect, start/open/compose/integrate/close/ref cleanup/environment reset; nested conflict resolutions | Start versus resume versus canonical-ref open; label becomes sanitized ref fragment; cleanup domains mixed | Split discovery/inspection/cleanup; retain source lifecycle and explicit source strategy |
| read | 1 / 4 | Read-only immutable snapshot; typed query-array union | Overlaps the word “inspect” but source content has distinct batching/checkpoint semantics | Keep; do not merge source bytes into generic resource inspection |
| edit | 1 / 4 | Atomic mutation; typed edits-array union, before hashes and checkpoint CAS | Input already expresses real decisions well; result needs compact continuation | Keep and improve result projection |
| exec | 1 / 12 | command/process modes, source capture versus fixed source, staged stdin; bounded wait | Flat fields permit irrelevant capture/wait options in process mode; long host instructions embedded in description | Rename run; discriminate command/process requests; retain meaningful environment/timeout/capture choices |
| operation | 4 / 11 | status, sequenced stdin, cancel, retire; locator exclusion lost in advertisement | Observation, process control and storage retirement mixed; “status” can advance recovery effects | Split observe/control/cleanup/recover; preserve common operation identity |
| validate | 2 / 10 | Source candidate or artifact validation, asynchronous | `requestId` alone advertised valid; implicit source subject; service test port is technical allocation | Keep a strict source/artifact subject union; move test-port selection into runtime after race-safe design |
| publish | 1 / 3 | Exact validated source CAS/provider effect | One validation ID is meaningful, not an optional “latest”; source-only distinction needs typed receipt | Keep; return exact publication proof and observation locator |
| project | 4 / 5 | list/inspect/connect/create; controller credentials | Opaque repo handles; policy name mixes provider/location with authority; creation hardcodes private | Split observations, retain connect/create and named permitted location; privacy remains safe declared policy |
| deploy | 9 / 14 | targets/list/inspect; source/artifact release; start/stop/rollback/remove | Missing explicit create-vs-update intent when revision omitted; service health port is meaningful, test port is not | Split observation; explicit create/update request branches; retain target/source/artifact/rollback decisions |
| artifact | 8 / 11 | recipe/read/export/usage/prune-preview plus build/prune; source-independent bytes | Build, export and destructive storage management share one large description; build success versus validation | Split build/export/inspect/cleanup; retain artifact identity and policy pins |
| diagnostics | 6 / 13 | inspection, capture, report, ack, witnesses; special bounded replay | 1,698 description characters and host witness IDs in normal coding catalog; stop means capture stop | Separate optional operator capability; preserve alert delivery and existing diagnostic state |

Tool count alone disguises 53 actual dispatch variants. Every one is included in generated
valid examples. Root object vocabulary has 21 fields on task, while a specific action typically
requires only a few. Read/edit's nested alternatives are useful controls, not proof that every
nested conditional or host preserves required/exclusion constraints.

Current results are strict at the JSON level but still broad semantically: `Operation.result`
points at a large union, task results expose storage names (`owner`, `source_ref`, `closed:0|1`),
and Frontier duplicates operation schemas. Expanded output-schema sizes range from 1,551 to
60,784 bytes per tool (task 60,784; artifact 51,030; workspace 38,867). Whether these output
schemas enter the actual model context is **unmeasured**. Raw tools/list byte savings alone
must not be sold as model-token savings.

## D. Decision ownership and default audit

U = user intent/authority; A = agent strategy; C = deterministic controller policy/state;
R = runtime technical facts. “Agent carries” does not imply “user types”. This inventory covers
the full root vocabulary; nested source/query/edit/recipe decisions are covered below.

| Current field(s) or decision | Current caller burden | Proposed owner / treatment |
|---|---|---|
| action, subject, mode | A chooses partly overlapping action families | A; explicit branch/tool boundaries, source/artifact and command/process discriminators |
| repo, name, label, projects, workspaceId | U/A meaningful names mixed with handles | U chooses project/objective; A chooses work; C resolves exact authorized handles and persists original Unicode label |
| policy, target, defaultRepo | A must understand opaque configuration names | U/A selects named permitted location/target when meaningful; C sole/default resolution only when unambiguous and disclosed |
| ref, baseRef, fromTaskId, localChanges, sources | A selects source history and import | A retains explicit base/continue-published/import-independent/composition intent; no hidden adoption of local edits |
| taskId, sourceTaskId, artifactId, validationId, deploymentId | A transports stable handles | C resolves locators; A selects actual candidate/work; stable IDs remain in receipts/CAS context |
| requestId, lookupRequestId, operationId | A must preserve original effect identity | Client/agent persists request before submission; C binds/deduplicates; discovery recovers original receipt. Never generate a new ID on lost reply |
| expected, expectedHead, expectedRevision, checkpoint, sourceCheckpoint | A transports concurrency evidence | C returns opaque exact evidence; A selects snapshot/candidate; admission still checks it. Do not replace expected with “whatever is current” |
| expectedPreview | A transports deletion preview | C creates and rechecks ownership/pin token; U/A chooses exact cleanup scope |
| command, cwd, env, stdin, text, eof | A configures real program behavior | A retains; provider secrets/executor variables forbidden as public execution decisions |
| environment | A chooses task caches or fresh dependencies | A retains speed/reproducibility tradeoff; current task default must be declared, not described as hermetic verification |
| timeout | A bounds work duration | A retains finite timeout and explicit persistent intent; R enforces observed limits |
| waitMs | A also carries transport profile descriptions | A chooses bounded observation duration; host adapter supplies tested default; transport media/progress-token choice belongs to adapter, not task intent |
| capturePaths | A decides what stopped command output becomes source | A retains for command branch only; never import process outputs implicitly |
| edits, resolutions | A chooses source mutations/conflict resolution | A retains atomic batch, exact before evidence and bounded content; C validates current source |
| queries, path, view | A chooses information and recipe/export path | A retains bounded source and artifact-relative access; C refuses arbitrary host-path reinterpretation |
| budget, limit, offset, after, before, pendingAfter, since | A manages result windows | C returns cursors/hints; A selects additional pages/detail. Equality cursors are not revision order |
| includeClosed | A chooses discovery scope | A retains; cleanup and continuation need closed predecessors as well as active tasks |
| health.port | A selects both live endpoint and validation scratch port | Live endpoint U/A; artifact-validation free port R with race-safe reservation. These are two different decisions |
| health.path | A repeats service check contract | U/A source health contract; C derives artifact path from adopted validated launch policy, rejects mismatch |
| message | A supplies validation candidate commit message | A retains as candidate metadata; not proof of tests or authority |
| category, seconds, incidentId, instance, runId, cellId, sequence, phase, callOrdinal, afterRequest | A carries diagnostic instrumentation | Operator/host adapter outside ordinary coding catalog. Stdin sequence remains C-returned/A-carried, not removed with diagnostic sequence |
| network/backend/executor/provider credential/tunnel selection | Network already removed in 0.1.19 | C/R retained internally; no new “execution intent” abstraction containing the same unnecessary knobs |
| PID, spool paths, free ports, runtime identity | Mostly internal already | R; expose proof/status only when needed, not caller-selected identifiers |

Nested decisions: `queries[]` file/list/search/diff/history and their range/format/base/filter
fields remain A information choices. `edits[]` put/delete/patch-style content and before hashes
remain A desired changes plus C checks. Integration resolution variants retain conflict intent
and exact source checkpoint. Packaging recipe platform, inputs, exports and service entrypoint
are source/product intent, while acquisition/auth/spool mechanics remain C/R. Neither a recipe
nor a caller can waive adopted mandatory verification. The full nested vocabulary is retained
in the field inventory; no proposed removal is justified merely by nesting or string type.

Defaults checked in implementation: deployment selects only a sole authorized target, otherwise
requires a target; task start uses permitted default/sole project/base and errors on ambiguity.
These are useful existing behaviors, not bugs to claim as new improvements. Default workspace
creation is composition convenience without expanded grants. `localChanges=false` avoids
unrequested adoption; managed independent start remains intentional. `includeClosed=false`
is appropriate for active discovery but insufficient as the only recovery view. Recipe default
`tdev-package.json` and bounded page sizes are reasonable conventions with meaningful overrides.
Private project creation is a declared supported capability; adding public creation merely to
increase choice is not justified. Artifact validation's adopted fallback command is a policy
decision, not caller-configurable PASS. Deployment release's omitted revision, unlike a sole
target default, can hide whether the caller meant create or replace: split that intent.

Four proposed change categories (none installed yet):

1. **Remove unnecessary choices:** irrelevant process capture/wait fields, duplicate discovery
   union vocabulary, operational host witness knobs in normal coding discovery. Network was
   already removed; do not count it again as work done here.
2. **Add necessary choices:** explicit resume versus independent work, human task/objective
   label lookup, explicit deployment create/update, typed source-versus-artifact subject,
   explicit recovery that may restore/switch resources, exact owned cleanup resource selection.
3. **Retain choices:** project/base/source adoption, integration resolutions, file/query/edit
   content, focused commands versus mandatory validation, environment/timeout, publication,
   artifact path, meaningful deployment target/port, rollback and bounded observation.
4. **Internalize choices:** credentials/connection/backend identity (already largely internal),
   validation-only ephemeral port, request/cursor plumbing in a durable client adapter,
   lookup from names to IDs. Do not internalize user target, source or cleanup intent.

## E. Missing surface, contradictions and priority

| Priority | Evidence / problem | Safe change candidate |
|---|---|---|
| P0 | `status` and deployment `inspect` can call `reconcile → deployments.advance`; interrupted deployment restoration stops/starts resources. Environment reset/prune reconciliation also performs cleanup. A universal “observe is pure” claim would be false. | Separate observation of proof/finalization from effectful recovery. Return typed `recoveryRequired` and require explicit original-operation recovery for restoration/deletion. Requalify existing interrupted-switch guarantees before changing behavior. |
| P0 | Real unknown publication survives; absent remote head cannot prove old sender failure. | Keep original operation, provider certainty and maintenance fence; no latest/new-ID repair or use of maintenance exemption in this work. |
| P1 | 0.1.21 flat discovery demonstrably accepts branch-invalid requests. | Canonical branch reuse under nested request, or correctly split tools after actual host probe. |
| P1 | 43 open tasks at snapshot; list has no project/objective search, label only used to construct sanitized ref; generated project names/IDs differ from user concepts. | Principal-scoped exact human locator discovery plus bounded frontier; no latest-active default. Old labels from retained creation input when available, otherwise explicitly unnamed. |
| P1 | Release without expectedRevision resolves current state at admission; creates and updates share a branch. | `create` requires absence; `update` requires observed revision. Prevent unintended replacement even without concurrent writer. |
| P1 | Accepted operation versus successful command, candidate, package and live health require different judgments. | Typed result subject/stage and compact receipt/current-observation separation; no undifferentiated `success`. |
| P2 | Manual discovery definitions duplicate enums/ranges/regex/required vocabulary; tests explicitly demonstrate intentional looseness. | One canonical wire definition; generated adapters with equivalence/rejection tests, no hand-maintained second semantic owner. |
| P2 | Mixed inspection, controls, cleanup, and huge descriptions/outputs. | Separate domain mutations from reusable inspection/observation; retain source-read batching. Minimize compact result projections before deleting useful fields. |
| P2 | Validation requires an ephemeral health port while deployment port is actual product endpoint. | Runtime allocation with reservation and explicit zero-port capability if supported; do not select-then-close a socket and claim race freedom. |
| P3 | Diagnostics dominates normal descriptions; host annotations intentionally differ from actual effects to prevent repetitive permission popups. | Optional operator diagnostic catalog; express actual effect categories in tool boundaries/results. Preserve the user's fixed annotation profile. |

Negative space includes pending admission before a task row, multiple exact-name matches,
completed work whose reply was lost, unresolved provider state after reconnect, source versus
artifact validation, command capture versus persistent process, and resource cleanup after task
close. Some already have backend support (pending workspace operations, terminal predecessors,
closed-task inspection, process controls, artifact pins); the redesign should project them
coherently, not invent a second state store. A transcript or universal session owner is not
justified. A Unicode task label plus derived current frontier is justified by concrete gaps.

Simplification debt: permanent syntax aliases are unnecessary for pre-release tools; historical
receipts are not aliases and must survive. Dormant SSH code/config is not a selectable public
backend; removing it is unrelated to this probe. Duplicated discovery definitions and host-specific
scheduling prose are design debt. Fixed host hints are an intentional user-required compatibility
constraint, not cleanup debt. Old operation kind/input hashes must not be rewritten when public
names change.

## F. Insight log

### 1. Fresh binding changed the entire comparison baseline

Observation: entry checkout 0.1.16, remote/resident 0.1.21; remote default branch historical.
Direct cause: checkout, canonical ref and installed bundle have independent lifetimes.
Immediate fix: isolated worktree from live authorized ref; capture source/resident contract hashes.
General principle: a familiar directory or repository default is not sufficient work authority.
Related surfaces affected: project lookup, current-source defaults, release receipts, reconnect.
Possible architecture implication: discovery must return exact source authority separately from
runtime version and conversation connection.
Evidence strength: direct Git, authenticated HTTP, read-only SQLite and byte comparison.
Remaining uncertainty: later concurrent changes; snapshot is not a global lock.

### 2. Flat vocabulary exchanges schema precision for host visibility

Observation: 547/777 synthetic invalid calls pass A discovery; none pass strict runtime.
Direct cause: union fields and required intersection erase action-field dependencies.
Immediate fix: B directly embeds canonical input under a required typed root property.
General principle: schema validity and model-visible fidelity are different acceptance gates.
Related surfaces affected: all eight composed input families, not only operation.
Possible architecture implication: keep wire ownership single; isolate host adaptation and
test both acceptance equivalence and actual rendered branch structure.
Evidence strength: exhaustive dispatch-variant corpus, deterministic negative mutations.
Remaining uncertainty: fresh ChatGPT B rendering and actual model error rate.

### 3. Fewer tools does not mean smaller choice space

Observation: 12 tools hide 53 variants; six-tool D has the largest input catalog and deepest
envelopes in the mechanical comparison.
Direct cause: grouping relocates branching and duplicates domain/intent context.
Immediate fix: compare semantic responsibility and per-workload selection, not tool count.
General principle: compress repeated technical decisions, not unrelated product responsibilities.
Related surfaces affected: artifact, task, operation, broader release workflow proposals.
Possible architecture implication: hybrid narrow mutation tools plus typed observation; no
single source/run/release workflow engine by default.
Evidence strength: generated catalogs and exact byte counts.
Remaining uncertainty: model selection performance and better hand-designed D shapes.

### 4. Source labels are currently naming hints, not durable work meaning

Observation: label is sanitized into branch name; Task has no label/objective field or search.
Direct cause: branch creation history owns the user-facing hint; task rows expose storage fields.
Immediate fix candidate: preserve original bounded label, discover by authorized project and
label, return all matches and a current frontier only when uniquely resolved.
General principle: stable machine identity and recoverable human intent are complementary.
Related surfaces affected: project/workspace/service names, completed predecessors, multiple accounts.
Possible architecture implication: bounded locator resolution, no global current-task or transcript store.
Evidence strength: direct schema/store/core inspection and dozens of active tasks.
Remaining uncertainty: realistic objective ambiguity and whether historical creation inputs suffice.

### 5. “Observation” currently includes effectful recovery

Observation: deployment inspection/status may restore prior desired release after interruption;
cleanup reconciliation may perform deletion. Existing tests intentionally assert this behavior.
Direct cause: one reconcile method covers observing proof, committing receipts and advancing effects.
Immediate fix candidate: classify reconciliation paths before moving all reads into a read-only tool.
General principle: public effect boundaries must be derived from executable call paths, not verbs.
Related surfaces affected: deployment, artifact prune, environment reset, maintenance and reconnect.
Possible architecture implication: explicit original-operation recovery, typed recovery-needed frontier.
Evidence strength: direct call graph plus existing interrupted-activation/unknown recovery tests.
Remaining uncertainty: changing automatic restoration must not strand an unavailable previous service;
explicit recovery needs a current-policy/journal strategy and crash qualification.

### 6. The largest context cost may be repeated results, not input wrappers

Observation: task output schema alone is 60,784 bytes; its input is 2,683.
Direct cause: expanded broad result unions and duplicate Operation/Frontier structures.
Immediate fix candidate: measure host-injected inputs/outputs separately, design compact typed receipts.
General principle: measure the representation actually consumed; wire bytes are not model tokens.
Related surfaces affected: every effect tool reusing Operation/MutationResult and diagnostics descriptions.
Possible architecture implication: subject-discriminated receipts plus separate optional detail inspection.
Evidence strength: direct tools/list measurement; model-context contribution not yet observed.
Remaining uncertainty: which outputSchema details the current ChatGPT adapter injects.

### 7. One “health port” represents two different owners

Observation: service artifact tests and deployed endpoints both require a caller-supplied port.
Direct cause: a technical scratch allocation reused the live-service health shape.
Immediate fix candidate: allocate test port internally while retaining live endpoint intent.
General principle: same wire shape does not establish same decision ownership.
Related surfaces affected: validation/build scratch, runtime paths, execution environment settings.
Possible architecture implication: distinguish validation environment facts from release configuration.
Evidence strength: artifact validation and deployment implementation.
Remaining uncertainty: race-free port reservation for arbitrary entrypoints on Termux.

### 8. A nested branch can still disappear through negative constraints

Observation: in the user's fresh ChatGPT B trial, task's start arm appears as
`Exclude<any, any>`, while other task arms and validate/read/edit alternatives remain typed.
The same minimal start call succeeds with `probeOnly:true,effect:none`; invalid validation
is rejected before a probe receipt. See [host report](examples/surface-probe/evidence/host-B-report.md).
Direct cause: the affected canonical arm combines `not` and `allOf`/`if`/`then`; which keyword
or interaction causes the host translation is not yet isolated. The failure is declaration
fidelity, not loss of the canonical branch or runtime validation.
Immediate fix candidate: B2 compiles the bounded presence/finite-value constraints to disjoint
positive alternatives without relaxing valid inputs, then reuses them under the typed root.
General principle: preserving nesting alone is insufficient; the host's schema-to-type subset
must preserve both visibility and constraints. Callable is not the same as comprehensible.
Related surfaces affected: operation locator exclusion, workspace configure's at-least-one
field, diagnostic witness phase conditions, action-per-tool candidates that retain root `not`.
Possible architecture implication: define new source intent as a positive base/local-checkout/
published-task union in the canonical wire itself, rather than maintaining flat mutually
exclusive knobs plus a permanent generic compiler. Use the experiment to identify the supported
subset, not to introduce a universal schema transpiler into the product.
Evidence strength: user-supplied actual declarations/results; local reproduction of accepted
input digests, 192 conditional combinations and unchanged primitive field constraints.
Remaining uncertainty at discovery: B2 fresh-host rendering and root/action/workflow controls.
Follow-up: the B2/control report resolved those tested shapes; uninstructed model choice and
future host versions remain unmeasured.

## G. Executable candidates and measurement

[scripts/probe_surface.py](scripts/probe_surface.py) generates five effect-free catalogs and
all branch examples from the **frozen baseline** canonical contract. It never opens a Controller,
executes a submitted command or reads private runtime state. All mock mutation calls return
`probeOnly:true,effect:none`; they prove shape handling only.

| Candidate | Tools | Input bytes total | Mean / max input bytes | Synthetic invalid accepted by discovery |
|---|---:|---:|---:|---:|
| Root strict control | 12 | 28,369 | 2,364 / 5,223 | 0 / 777 |
| A: current grouped + flat vocabulary | 12 | 18,151 | 1,513 / 2,683 | 547 / 777 |
| B: typed root + canonical nested request | 12 | 29,509 | 2,459 / 5,318 | 0 / 777 |
| C: dispatch variant per tool | 53 | 29,177 | 551 / 1,868 | 0 / 777 |
| D: broader workflow groups + typed request | 6 | 37,545 | 6,258 / 9,375 | 0 / 777 |
| B2: nested positive conditional alternatives | 12 | 32,365 | 2,697 / 5,865 | 0 / 777 |

All accept 53/53 valid canonical examples; none accepts an invalid call at the canonical
validator. Invalid calls are deterministic required omissions, foreign action fields, range
violations and invented fields. This is **not model invalid-call rate**. A/B use current full
descriptions; C/D use short experimental labels, so description totals are not a fair measure
of finished documentation cost. Generated candidate outputs are uniform probe receipts;
original real output schemas are captured separately. Token counts and model selection,
invented-field/omission frequencies, extra round trips and fresh-host continuation success
remain unmeasured. No synthetic code generator is presented as an intelligent model benchmark.

Actual examples (full JSON Schemas are in `examples/surface-probe/generated/*.tools.json`):

```typescript
// A: properties share vocabulary; required action alone does not describe its branch.
tdev_task({action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"})
tdev_task({action: "inspect", taskId: "task"})
// B: exact canonical branch-specific required/forbidden fields survive under request.
tdev_task({request: {action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"}})
tdev_task({request: {action: "inspect", taskId: "task"}})
// C: tool name selects branch. This control intentionally retains constant action fields.
tdev_task_start({action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"})
tdev_task_inspect({action: "inspect", taskId: "task"})
// D: coarse workflow selects domain intent; canonical arguments remain unchanged.
tdev_source({request: {intent: "task.start", arguments:
  {action: "start", requestId: "start-1", repo: "fixture", label: "UI fix"}}})
tdev_observe({request: {intent: "task.inspect", arguments: {action: "inspect", taskId: "task"}}})
```

B schema is exactly `{type:"object",properties:{request:canonicalInput},required:["request"],
additionalProperties:false}`. It adds 95 bytes per tool in this encoding; the much larger
increase versus A restores semantics A omits. This is not gratuitous wrapper overhead.
C still contains root conditional constraints for some variants (status locator exclusion,
start import rules); splitting actions alone does not prove perfect host fidelity.
D is a reproducible mechanical candidate, not proof that all workflow-oriented designs are bad.

B2 additionally matches canonical acceptance over 192 combinations of start source selectors,
status locators, workspace configuration presence and diagnostic phase/witness fields, including
null/wrong-type/invalid-value cases. Its start schema has two positive arms: with `fromTaskId`
required, `baseRef` absent and optional `localChanges:false`; or `fromTaskId` absent with base/local
choices retained. No `not`, conditional `if` or `allOf` remains in its input catalog. Unknown
constraint syntax and excessive expansion fail closed. It adds 2,856 input bytes versus B.
This bounded compiler is an isolated prototype; final canonical product choices should be
expressed positively where the source strategies have real meaning.

## H. Decision matrix and async alternatives

| Dimension | A | B | C | D |
|---|---|---|---|---|
| Workflow calls / identity burden | Existing | Same | Same absent semantic changes | Same absent semantic changes |
| Tool selection | 12 overlapping lifecycle groups | Same grouping problems | 53 explicit names, larger selection set | Six broad groups, substantial intent branching |
| Parameter/required clarity | Proven action-field holes | Exact branch relationship if host retains union | Strong branch selection; residual constraints need probe | Typed but deeper and sometimes duplicated intent |
| Schema fidelity / host compatibility | Fresh control typed, branch loss intentional | Fresh B loses start; B2 retains tested positive alternatives | Original conditional start control becomes a generic map; positive single-action tools not disproved | Fresh source control loses start arguments; broader redesigns not disproved |
| Recovery / mutation safety | Existing invariant and recovery caveats | Envelope alone changes neither | Splitting alone changes neither | Grouping alone changes neither |
| Context cost | Smallest inputs, longest prose compensations | +11,358 input bytes vs A; exact reuse | Small individual schemas, many names/annotations | Largest aggregate and largest individual inputs |
| Implementation / migration | Smallest change, permanent precision debt | Small normalization seam; preserve old receipt identity | More routing/client migrations | New domains/routing, largest naming migration |
| Extensibility | Every field broadens unrelated actions | New branch remains local; grouping can still become incoherent | Tool list grows with actions | Broad union can become a second universal protocol |
| User interventions / IDs | Existing | No improvement from wrapper alone | No improvement from splitting alone | No improvement from grouping alone |

Pre-implementation direction was canonical reuse plus responsibility changes and human
continuation lookup. The fresh B2 evidence subsequently qualified positive alternatives;
section L records the selected architecture and why broader recovery/control splits were rejected.

Async alternatives: domain-specific job handles fragment reconnect and logs without reducing
effect count; continuation tokens can carry locators but cannot replace durable request identity;
a common operation receipt preserves existing acceptance/unknown evidence. Separate wait/log
observation from effect identity as today. Finite command and persistent process share receipt
storage but have different input branches, capture/busy/deadline semantics. Cancel means requested
stop, not proof of termination; retire requires proof and preserves receipt; task close does
neither. Bounded wait reduces short-command calls from admission+observation to one only when
the host returns the result; default noninteractive wait and staged-stdin immediate return must
be tested independently. No transport stream or wait token owns the effect lifetime.

## I. Broader boundary candidate considered (not selected)

Seventeen ordinary tools plus an optional diagnostics capability were a **testable candidate**,
not a target count. Single-responsibility tools use typed roots; heterogeneous requests use a
required nested discriminated request. Do not keep empty action selectors for single actions.

| Name | Responsibility / input | Result / continuation | Async and recovery |
|---|---|---|---|
| tdev_find | Read-only project/workspace/task/service human locator, status scope and bounded pagination | unique frontier or typed candidates/ambiguity; pending admissions included | No effectful reconciliation; never start/reuse by hidden heuristic |
| tdev_inspect | Read-only typed project/workspace/task/artifact/recipe/storage/deployment subject | Current compact material state, provenance, detail cursor, recovery-needed flags | No restore/delete; terminal receipt finalization only when proof already exists |
| tdev_observe | Original operation or original request locator, output cursor, bounded wait | Receipt certainty/status/subject, fresh output cursor, terminal flag and observation timestamp | Common finite/process/build/validation observation; no new effect |
| tdev_project | Connect/create at a named authorized location | Project identity/display name and operation receipt | Provider unknown stays original; no create retry by name |
| tdev_workspace | Explicit composition/name/default changes with revision CAS | Composition revision and receipt | Membership never grants authority; default workspace remains C convenience |
| tdev_task | Explicit independent start, exact-ref open, continue-published, compose/integrate, close; bounded Unicode label | Task/source context and exact CAS, receipt | Close retains processes/bytes; start never doubles as resume |
| tdev_read | Batched immutable source queries | Returned checkpoint, bounded query pages | Snapshot reads; no command execution |
| tdev_edit | Atomic edits plus source CAS/request identity | Receipt, committed checkpoint, current-context locator | Replay same input before stale; never auto-adopt current source |
| tdev_run | Command/process request union with command/env/deadline and mode-specific capture/wait | Operation receipt and source context; terminal result if bounded wait completes | Fixed process source, finite command capture; no hidden replacement/relaunch |
| tdev_control | Sequenced input or stop request for an admitted execution | Control receipt and target observation locator | Delivery uncertainty remains explicit; cancel is not stopped |
| tdev_validate | Explicit source/artifact request subject under adopted mandatory policy | Validation operation; exact candidate/artifact binding | Focused command is separate; no caller-declared PASS, no policy waiver |
| tdev_publish | Exact source-validation receipt and target CAS | Publication receipt with candidate/ref proof | Never consumes artifact validation; original uncertain publication only observed |
| tdev_build | Validated source plus recipe selection | Build receipt then retained artifact binding | Independent scratch/source lifetime; no automatic verify/deploy |
| tdev_deploy | Explicit create/update source/artifact release, start/stop/rollback/remove; revision and target | Switch receipt, desired release and current-health observation locator | Separate switch success/current health; unknown recovery remains journal-bound |
| tdev_cleanup | Preview/commit exact owned operation/env/ref/artifact resource scopes | Ownership/pin evidence, CAS/preview token, receipt | No arbitrary paths or “clean all”; unknown resources pinned; durable receipt retained |
| tdev_export | Bounded retained artifact-relative file bytes | Verified digest/range cursor | No command, mutation or caller host-path write |
| tdev_recover | Explicit selected original operation with effectful recovery strategy permitted by journal/policy | Original effect identity and recovery receipt/proof | May restore prior desired deployment/finish owned cleanup; never repeat unknown provider create/publish |

In this unselected candidate, optional `tdev_diagnostics` would remain operator-scoped, outside the ordinary coding catalog; runtime
errors/alerts can identify its availability without inventing host dynamic discovery support.
That candidate would require explicit separate capability registration, rather than promise
that arbitrary hosts add tools on demand. Existing incidents/witness receipts remain untouched.

Example future intent shapes (design examples, not today's accepted calls):

```typescript
tdev_find({request:{kind:"task", project:"humtr/tdev", label:"UI fix", state:"open"}})
tdev_run({request:{kind:"process", context:{taskId:"task", expected:"…"},
  requestId:"persist-before-send", command:"python app.py", environment:"task"}})
tdev_deploy({request:{action:"update", service:"preview", expectedRevision:2,
  candidate:{kind:"artifact", validationId:"artifact-validation"}, requestId:"release-1"}})
```

Keep names only in read-resolution where ambiguity is handled. A mutation must bind the exact
resolved identity/CAS, or resolve and persist that exact binding within admission before any
effect. Replay consults original binding before current names; renaming or a newly duplicated
name cannot retarget an accepted effect. Generated client request identity must be persisted
before dispatch; server-only auto IDs are insufficient when the admission reply is lost.

Compact effect response candidate: `receipt:{operationId,requestId,subject,status,effect}`,
`context:{taskId,checkpoint,...}` where relevant, and `observation:{cursor,observedAt,nextOffset,
terminal,recoveryRequired}`. Immutable admission binding and fresh current observations must be
separate; replay must not cache a “current checkpoint” forever. Error categories should distinguish
invalid request, stale CAS, ambiguous locator, unavailable/revoked target, permission denial and
unknown/recovery-needed effect, with typed original identity/candidate choices rather than only
prose. Omit irrelevant keys by subject; do not return a giant DB row or an executable next-mutation
plan. The server suggests an **observation class**, not the agent's next strategic action.

Minimum durable additions: original bounded task label/objective summary and its principal/project
binding; existing source/receipt/artifact/deployment state remains authoritative. A derived frontier
joins these facts with current provenance. No global mutable current task, per-chat ownership,
transcript storage, automatic cleanup, provider retry or synthetic successful recovery receipt.
Multi-connection current installation maps to the same principal: transport/account is not a
new task permission. Any future principal separation must filter locator results and receipts
before exposing candidates, not accept a caller-selected owner or credential ID.

## J. Workflow comparison and host acceptance

The [probe guide](examples/surface-probe/README.md#fixed-workflow-traces) fixes all six required
workloads: small edit 9 semantic calls; debugging 9; reconnect 4; artifact/release/rollback 11;
lost reply 2 including original lost call; two active tasks 3 plus human selection. These are
analytical traces with one observation per asynchronous phase and explicitly prebound contexts,
not model measurements. A/B/C/D have identical semantic call counts and machine identity burden.
Changing a wrapper does not earn a fictional efficiency score.

The traces were also routed through the actual candidate encoders and schema-checked (all
effect-free): [workload routing artifact](examples/surface-probe/evidence/workload-routing.json).
Tool-kind counts differ even when semantic calls do not:

| Scenario | Calls, every candidate | A / B / B2 tool kinds | C tool kinds | D tool kinds |
|---|---:|---:|---:|---:|
| Small edit | 9 | 8 | 8 | 4 |
| Debugging | 9 | 4 | 6 | 3 |
| Reconnect | 4 | 3 | 4 | 1 |
| Artifact/release/rollback | 11 | 4 | 8 | 2 |
| Lost provider reply | 2 | 2 | 2 | 2 |
| Multiple tasks | 3 | 2 | 3 | 1 |

Small edits carry task/checkpoint/current effect-or-validation/pending request references;
debugging additionally carries output and stdin cursors. Artifact workflows carry exact source
validation, build/artifact (the same operation identity), artifact validation, deployment/revision
and observation cursor. Request identities are per effect, not one workflow-wide ID. These
machine reference requirements do not change across A/B/C/D/B2. They need not be user-pasted:
the agent can already rediscover some from existing lists; the missing improvement is bounded
human-intent resolution and compact state projection, not deletion of stable IDs.

The proposed `find`+frontier could reduce unambiguous fresh reconnect to discovery+operation
observation (two calls), eliminate user-pasted IDs and expose completed predecessors, while still
returning meaningful choice for two matching tasks. It must check ambiguity across the authorized
candidate set, not only the first page, and return `incomplete` rather than choosing from a
truncated page. In small edits, context receipts reduce re-lookup/copying, not the number of real
test/publish effects. Artifact workflows continue to carry source-validation, build, artifact-
validation and deployment identities internally; changing their visibility cannot erase them.
Unknown effects cannot safely be made a one-call success path.

The prompt table in the guide is a hand-labeled evaluation set (resume, test/deploy, running
status, publish-only, no-new-work, independent experiment, validate-only, artifact subject,
ambiguous objectives). Actual model first-call selection, invalid/omitted/invented parameters,
extra round trips, accidental effects and continuation success must be collected separately.

Actual host layers checked so far:

| Layer | Current evidence |
|---|---|
| Source canonical/discovery | Generated variants and strict validators exercised locally |
| Installed resident | Read-only 0.1.21 health and raw tools/list; product unchanged |
| Local bridge | Captured tools/list equals raw installed/source schema |
| Independent probe process | Effect-free stdio tested; initial B, now B2 plus five named structural controls (`compare`, 17 tools) |
| Independent Tunnel | Created `tunnel_6abc8a11a61c8191afc952512ff005a6`, alias `tdev-surface-probe-20260930`; locally running, /healthz and /readyz 200 |
| Tunnel control-plane delivery | Status reports poll health unknown (no live admin UI snapshot); actual B calls are user-reported and independent local dispatcher logs show forwarded requests |
| ChatGPT Connector Refresh / fresh catalog | User supplied fresh B and B2/control reports; the B2 four key alternatives remain typed. This Codex session itself has no probe tool injection |
| ChatGPT injected typing / generated call | B: validate/read/edit positive; task start `Exclude<any, any>` fails fidelity; two instructed valid calls and one expected schema rejection, not an uninstructed model benchmark |
| User-visible continuation | Not established by server writes, markers, probe echo or local health |

Admin setup was explicitly authorized. A private file-backed probe admin profile was registered
without activating it as the default; the key value was never printed. New Tunnel uses the same
workspace as the existing default connection. Runtime setup initially lacked CONTROL_PLANE_API_KEY;
it now references the existing runtime key file without copying/rotating it. One automatic approval
review rejected schema export; public byte-identity evidence allowed the retry, and the user then
explicitly authorized independent-profile schema transmission/testing. No remaining permission
rejection is being worked around. Existing resident/Tunnels were not repointed.

## K. Safety, state preservation and remaining implementation gate

At the end of the pre-implementation review, product source/runtime/contract were unchanged.
The following records that review boundary; implemented changes are recorded below. The review changed the selected plan,
adds the isolated experiment and invariant tests, and records this review. No canonical publication,
resident cutover, actual user-state migration, cleanup, credential rotation or unknown-effect
resolution was performed. The independent probe Tunnel/profile are the only new external runtime
resources. Historical operations and live task/artifact/deployment state remain owned by existing
controllers. The original dirty checkout is untouched; the new worktree uses a local dependency
symlink solely to run the existing pinned Python dependencies.

Migration design for a later selected surface: normalize new syntax before admission into the
same internal effect identity; preserve old stored inputs/hashes/receipts and inspectability;
no permanent experimental aliases. Prove auth-before-replay and replay-before-stale with old
receipts, changed labels, concurrent sessions and lost responses. Add only compatible label
metadata or an explicit schema revision with backup/rollback gates; do not reopen or rewrite
old tasks to populate names. Deployment restore semantics require separate targeted qualification.
Host hints are not authorization. Keep the user's existing fixed hints unchanged; actual
CAS/policy checks and observation/effect boundaries remain independent of those hints.

Local validation completed initially: probe-focused **4 tests PASS**; affected contract,
bridge, HTTP, progress, recovery and deployment **49 tests PASS** (143.126 s). This includes
existing lost-publication-response and interrupted-deployment restoration tests; it qualifies
the unchanged baseline, not a newly implemented recovery split. Initial full `scripts/check.sh`
**318 tests PASS** (549.765 s), including `git diff --check`. After B2, **7 focused tests PASS**
(8.696 s), including positive equivalence and fail-closed expansion. A focused test initially
failed because relative PYTHONPATH stopped resolving in its temporary child cwd; the test now
passes absolute dependency paths. No product behavior was changed to hide that failure.
Installed Codex MCP loader/bridge preserves exact input schemas for root/A/B/C/D/B2; each
performed two effect-free calls in a fresh ephemeral app-server thread. This is actual client
loading, not model-injected TypeScript or ChatGPT proof. B2 full `scripts/check.sh`: **321 tests PASS** (686.111 s).
Resident mutation
acceptance and ChatGPT fresh-session acceptance are **not run** for a redesigned product.

The B2 fresh-host report and five controls are retained in
[host evidence](examples/surface-probe/evidence/host-B2-report.md). The typing gate permits implementation;
model selection and complete product journey acceptance remain open. Implement
one selected slice at a time: canonical schema ownership/adapter, human locator/frontier,
explicit release intent and mode-specific execution inputs. The larger separation above was
considered and rejected; it is not an unfinished implementation requirement. Re-run focused/affected/full
tests after each meaningful product change; qualify resident and new-session behavior separately.
Do not infer a final architecture win from this local corpus alone.


## L. Selected architecture and implementation — source 0.1.22

Selection: B2's typed request boundary plus a separate human-name continuation responsibility,
explicit release revision intent and shorter descriptions. Thirteen tools are selected, not a
fixed product limit. Canonical positive alternatives directly own public request validation;
there is no production import of the experimental conditional compiler. HTTP unwraps only after
validating the exact envelope, then preserves semantic arguments and existing effect fingerprints.

The broader §I split is not selected. A uniform inspect/recover split would move accepted-operation
reconciliation and journaled restoration into new caller decisions without measured benefit.
Restoration belongs to the original admitted deployment transaction; observation must disclose
that reconciliation can finish it, never masquerade as an entirely pure read. `find` supplies the
missing genuinely effect-free retained-state discovery. Separate build/export/cleanup names might
reduce selection ambiguity, but fixed workload traces showed no effect-call savings; the extra
catalog and migration cost lack an uninstructed model-selection result. The existing domain
boundaries are retained for their task/ref, artifact-pin and deployment-journal ownership, not
because twelve names are mandatory. Reconsider those splits only against measured selection errors.

| Public tool | Responsibility and input under request | Output / continuation | Effect and async semantics |
|---|---|---|---|
| find | Project key/display name, label substring, all/open/closed, bounded pagination | typed resolution; checkpoint, closed/published state, recent and outstanding original receipts | Local retained-state reads only; no arbitrary latest selection |
| workspace | composition actions; exact revision for changes | workspace revision/membership, retained change receipt | Membership never grants authority; inspection can reconcile admitted work |
| project | list/inspect/connect/create within delegated policy | enrolled project or original provider receipt | Unknown create remains unknown until original-effect observation |
| task | start/open/compose/inspect/list/integrate/close/owned cleanup/reset | source checkpoint, receipt or bounded domain frontier | start is new work; fromTaskId is a published predecessor, not resume; close is not stop/delete |
| read | batch of file/list/search/diff/history queries | exact checkpoint and bounded results | No source mutation |
| edit | atomic edits plus expected checkpoint and request identity | retained receipt and new checkpoint | Replay before stale check; no automatic adoption |
| exec | finite command or persistent process, source/env/capture/deadline | retained operation; terminal exit/result if bounded wait completes | Native Termux; process does not capture or inherit a default deadline |
| operation | status by operation or original request; stdin/cancel/retire | original receipt, certainty, output cursor and terminal result | status reconciles original journal; never replacement admission; cancel differs from retired |
| validate | source or retained artifact subject | validation receipt and exact candidate/artifact binding | Source, artifact and live-health proof remain distinct |
| publish | exact source validation and remote-head CAS | exact source publication receipt | No deployment; lost response is observed under its original identity |
| artifact | recipe/build/list/inspect/usage/export/prunePreview/prune | retained identity, validation status, bytes/cursor or preview token | Build is not artifact validation; pruning honors pins and preview identity |
| deploy | source/artifact release, list/inspect/targets and lifecycle controls | revision/release receipt; current identity/health through inspection | Required revision 0 initial / positive exact update; rollback uses retained bytes |
| diagnostics | existing operator-granted diagnostics/witnesses | bounded diagnostics and witness receipts | Existing capability and fixed host hints preserved; witnesses are not UI proof |

Decision ownership changes, separated from inherited behavior:

- **Removed:** omission of release revision as an implicit current-service update strategy;
  loose flat action/field combinations; duplicated discovery branch definitions. Network/backend
  caller choice had already been removed in 0.1.19 and is not claimed as this change.
- **Added:** human project/label continuation lookup; explicit all/open/closed search intent;
  complete/ambiguous/incomplete/unavailable resolution; explicit initial-vs-exact-update revision
  on every release. No optional default can silently select the current update revision.
- **Retained:** agent file/test strategy, finite/process mode, task/fresh environment, capture,
  source adoption vs published predecessor, source/artifact subject, recipe/target choices when
  meaningful, CAS, stable request identity, sequenced stdin and owned cleanup previews.
- **Internalized:** discovery derivation and envelope interpretation are controller boundary work;
  label/receipt lookup is a bounded local projection. Provider credentials, transport identity,
  native executor/PID and source branch namespace resolution remain existing controller/runtime
  responsibilities. No connection, credential, network or backend selector was added.

Direct observations: root composition loses typing; some negative conditionals also collapse
inside nested unions; B2 positive alternatives and the final source input probe retain required
fields. Derived insight: host-compatible shape is an independent requirement from validator
expressiveness, and physical nesting alone is not the solution. Another direct observation is
that deployment release previously inferred a current revision. Derived insight: CAS safety
against races does not express user authorization to replace a named service; expected revision
must express initial/update intent as well as guard concurrency.

Final input host evidence is retained in
[the user-supplied report](examples/surface-probe/evidence/host-product-report.md). It covers three
valid instructed calls and one expected pre-dispatch rejection, with all three receipt digests
recomputed locally. It does not measure uninstructed model choice or production development effects.
The earlier root/A/B/C/D/B2 artifacts remain pinned to baseline b418c1d; changing product source
cannot silently rewrite those historical controls.

The final source validation, package rehearsal and quantitative comparison are recorded in section M. Any missing live acceptance remains explicit, never inferred from
local success. No user files, credentials, connections, grants, retained artifacts, deployment state,
unknown effects or receipts have been migrated or deleted. No canonical publication or production
resident cutover has been performed.


### Additional discoveries during implementation review

Observation: a newly created project may have an admitted provider operation before it has an
enrollment or a task. Direct cause: resource discovery and effect admission have different
lifetimes. Implemented fix: include original pending project admissions in
human-name lookup, authorize them through the retained project-policy binding, and never call
the provider during lookup. General principle: recovery discovery must start from durable
admission intent, not only from successfully created resources. Related surfaces: source open,
build preparation and deployment switch. Architecture implication: a compact receipt frontier
can span those cut points without creating a transcript/workflow engine. Evidence strength:
existing provider-loss/restart fixtures plus the new targeted lookup fixture; live provider loss
is deliberately not induced. Remaining uncertainty: real long-session model planning remains
separate from schema and local recovery proofs.

Observation: project enrollment can be replaced while historical task rows remain. Direct cause:
human names are locators, not authority or stable effect bindings. Immediate fix: unavailable
matches must not be projected as absent work. General principle: filtering an unusable binding
must not authorize replacement work by omission. Related surfaces: revoked scopes and migrated
connections. Architecture implication: typed resolution must distinguish unavailable, ambiguous,
incomplete and none. Evidence strength: disposable identity-replacement and revocation tests.
Remaining uncertainty: user-facing explanation of complex multi-project ambiguity is still an
agent responsibility, not an automatic controller selection.

## M. Final redesign report — ordered acceptance record

### 1. Fresh authority / current state

The authority chain is AGENTS → README → applicable ARCHITECTURE sections → canonical contract
→ IMPLEMENTATION_PLAN. The remote development ref was rebound to `refs/heads/tdev` at
`b418c1ddb97af052f80430f3d55802cf3060cfe2` and rechecked after handoff. The isolated branch
`redesign/surface-20260930` implements source 0.1.22 on that base. Changes are local and reviewable;
the original dirty 0.1.16 checkout is preserved. Current production bundle, connection health,
task counts and outstanding effects are timestamped in
[resident readback](examples/surface-probe/evidence/resident-final-readback.json).
The resident still advertises twelve 0.1.21 tools and the baseline contract. The historical
unknown publication retains its original operation/task identity. Neither its outcome nor
permission to replace the resident is inferred from this redesign.

### 2. Current tool-surface diagnosis

Sections C–K retain the pre-implementation observations and candidate proposals; selected
dispositions are in L and this final report, rather than a second unfinished implementation queue.
The field-by-field baseline inventory and all twelve tool audits are in sections C–F and
`generated/field-inventory.json`. Highest-impact defects were model-visible required-field loss,
manual canonical/discovery duplication, internal-handle-only continuation, implicit service
replacement intent and process options that could not affect execution. Domain inspect/status
paths also have materially different reconciliation semantics. Long prose obscured those
boundaries and carried host cell policy that belongs in the caller adapter.

Historical boundaries were tested rather than presumed natural. Source bytes and atomic edits
remain distinct from mutable resource inspection; common receipts remain useful across async
effects; task/ref ownership, retained-artifact pins and deployment journals justify their current
domain boundaries. A separate pure retained-state lookup addresses a responsibility absent from
those effect-reconciling inspect paths. Splitting every action has no demonstrated call advantage.

### 3. Measured ChatGPT host behavior

Three fresh user-supplied host reports are retained, with their provenance explicitly stated:
[B](examples/surface-probe/evidence/host-B-report.md),
[B2](examples/surface-probe/evidence/host-B2-report.md), and
[selected inputs](examples/surface-probe/evidence/host-product-report.md).
They are actual reported declaration excerpts and instructed calls, not a complete raw injected
catalog captured by this Codex session.

Root composition was a generic map in the control. Flat vocabulary retained properties but lost
branch requirements. Nesting alone preserved read/edit/validation while task-start conditionals
still collapsed to `Exclude<any, any>`. Positive alternatives preserved both start strategies,
status locators, workspace configuration and diagnostic phase requirements. The selected find
fields and both mandatory deployment revision branches were visible; omission of expectedRevision
was rejected before dispatch. Valid instructed calls returned only `probeOnly:true,effect:none`.
The [final command/process report](examples/surface-probe/evidence/host-exec-report.md) confirms
both alternatives, required process mode and schema rejection of waitMs:0/capturePaths:[] in the
process arm. Its valid receipt digest matches the final probe. This proves the changed shape
reached this conversation; it does not prove universal Refresh reliability or actual process effects.

### 4. Key discoveries — direct findings

- The host can lose a valid nested conditional branch as well as a composed root.
- Baseline discovery accepts 547/777 deterministic invalid perturbations that canonical validation
  rejects; discovery validity and runtime validity had different meanings.
- Release inferred an update revision from the current service when the caller omitted one.
- Process-mode waiting was ineffective and capture was unsupported, yet both were selectable.
- Retained creation intents already contain human labels; a new memory database is unnecessary.
- A provider creation can be unknown before any project/task exists. Resource-only lookup misses it.
- Replaced project bindings can leave historical task rows; absence and unavailable work differ.
- Mechanical regrouping changes schema/tool costs without removing any underlying effect call.

### 5. Derived insights — broader architecture consequences

Host typing is a product requirement independent of JSON Schema validity. Express real strategies
as positive alternatives under a typed envelope, and validate exactly that advertised shape.
Do not repair lost constraints with a longer description or a second manually owned vocabulary.
The experimental compiler established equivalence; product code directly owns explicit branches.

Concurrency safety does not express product intent. Required revision zero means create only;
a positive inspected revision means update exactly that service state. An automatically selected
current revision could avoid a race while still authorizing the wrong replacement.

Recovery discovery should join durable admission intent and receipts, including admissions that
have not created resources. Human names locate work; stable identities still bind authority and
effects. Complete/ambiguous/incomplete/unavailable must be distinct before admitting replacement
work. A bounded derived frontier solves this without a current-session pointer or transcript store.

Observation can finish an original transaction's journaled restoration. Renaming it a pure read
would hide ownership; adding another recovery choice without evidence would move deterministic
journal work into agent planning. `find` is genuinely local and effect-free, while status explicitly
reconciles only the original admitted effect. Both preserve unknown outcome and prohibit new replay.

The full Observation/Cause/Fix/Principle/Affected-surfaces/Implication/Evidence/Uncertainty log is in
section F and L's additional discoveries. Remaining unknowns are retained beside each inference.

### 6. Decision ownership changes

| Category | Concrete disposition | Owner |
|---|---|---|
| Removed unnecessary choices | Flat public argument syntax; action-irrelevant field combinations; process wait/capture inputs; omitted revision as an implicit update strategy | Contract rejects invalid combinations; no silent choice |
| Added needed choices | Human project/label and all/open/closed lookup; explicit create-only versus exact revision update on every release | User supplies objective/project when ambiguous; agent chooses meaningful scope/intent |
| Retained choices | Independent new source versus published predecessor/local-change adoption; file/test scope; command/process; task/fresh environment; timeout/capture for commands; source/artifact subject; recipe/target; rollback; exact owned cleanup | User owns product/destructive intent, agent owns authorized strategy |
| Internalized choices | Discovery reuse/envelope decoding and retained label/receipt projection; existing credential/connection/executor/PID allocation remain internal | Controller derives deterministic bindings; runtime supplies technical facts |

Network/backend selection had already been removed in 0.1.19; this change does not claim that
historical removal. Stable request identities and source/deployment CAS remain explicit machine
safety primitives. Fixed host annotations remain exactly true/false/false/false as directed by
the user. They neither authorize effects nor claim that status reconciliation is pure.

The missing-decision audit deliberately did not add caller-selectable mandatory validation depth,
provider visibility bypass, arbitrary cleanup paths, connection credentials or health-test resource
allocation. Focused test strategy already belongs to exec; mandatory validation is delegated policy.
A meaningful future deployment/test-port change requires runtime collision evidence and ownership,
not an unrelated configuration knob added during this redesign.

### 7. Alternatives considered

| Candidate | Tools | Aggregate / mean input bytes | Benefit | Rejection or selection reason |
|---|---:|---:|---|---|
| A grouped flat vocabulary | 12 | 18,151 / 1,513 | Smallest input | Required/foreign-action combinations lost in discovery |
| B nested canonical wrapper | 12 | 29,509 / 2,459 | Single owner, strict branches | Host still loses conditional start arm |
| B2 positive nested alternatives | 12 | 32,365 / 2,697 | Tested branch fidelity and equivalence | Selected foundation; wrapper alone cannot solve recovery discovery |
| C action-per-tool control | 53 | 29,177 / 551 | Small individual action schemas | More selected names; no call reduction; original conditionals still fail host control |
| D workflow groups | 6 | 37,545 / 6,258 | Fewer tool kinds in a trace | More intent branching/depth; no call reduction; source control loses a branch |
| Broader 17-tool boundary split | 17 + diagnostics | Design candidate, not measured catalog | Explicit observation/control/build/export names | Added migration/recovery choices without measured model-selection benefit |

These byte counts use the same pinned baseline inputs. C/D descriptions were experimental labels,
so their shorter text is not a fair finished-product context comparison. Positive action-per-tool
or a better workflow redesign has not been disproved. The chosen design wins the tested fidelity,
continuation and intent requirements with a small normalization seam and no stored-state migration;
it does not claim universally optimal model tool selection.

### 8. Chosen architecture

All thirteen inputs are closed typed objects with required `request`. Single responsibilities
remain typed objects; heterogeneous responsibilities contain explicit disjoint positive unions.
The HTTP boundary validates this exact shape after authentication, unwraps once, and passes the
unchanged semantic request into existing authorization/replay/admission. The contract owns wire
fields once. The finite conditional compiler is probe-only and absent from product imports.

| Tool | Responsibility; actual effect boundary | Input under request | Output / continuation and async recovery |
|---|---|---|---|
| tdev_find | Pure retained local discovery | project, label, state, pagination, since | Typed resolution; current checkpoint, recent/outstanding original receipts, completeness and observation cursor; no provider/executor calls |
| tdev_workspace | Composition reads/changes | action-specific revision/name/member inputs | Workspace revision and membership; original mutation receipt; inspect may reconcile existing work |
| tdev_project | Authorized enrollment/provider creation and observation | list/inspect/connect/create branches | Enrolled identity or original provider receipt; unknown create stays attached before enrollment |
| tdev_task | Source lifecycle and domain inspection | Explicit start alternatives; open/compose/integrate/close/cleanup/reset/inspect/list | Source checkpoint or original receipt; close does not stop processes; inspect supplies live/detailed continuation |
| tdev_read | Immutable batched source reads | taskId plus typed query array | Exact source checkpoint, bounded content/diff/history pages; no mutation |
| tdev_edit | Atomic source mutation | requestId, taskId, expected, typed edits | Original receipt and committed checkpoint; replay before stale comparison |
| tdev_exec | Finite command or persistent foreground process | Command supports wait/capture; process requires mode and excludes both | Common durable operation; command terminal exit/captured checkpoint after bounded wait, otherwise original handle; process source fixed and no default deadline |
| tdev_operation | Observe/control original admitted effect | Exclusive status locator; sequenced stdin/cancel/retire branches | Original status/effect/result, bounded output cursor; status may finish journaled restoration, never a replacement dispatch |
| tdev_validate | Exact source or artifact verification | Positive source/artifact alternatives | Validation operation binds exact candidate/artifact; terminal success remains distinct from publication/deployment |
| tdev_publish | Exact validated source publication | validationId, original requestId, expectedHead | Publication operation/proof; unknown provider result is observed, not repeated |
| tdev_artifact | Retained builds, inventory, export and owned pruning | Action-specific source-validation/recipe/artifact/preview inputs | Build operation then retained manifest; validation state, export cursor/digest, pin-aware prune preview; scratch retirement preserves bytes |
| tdev_deploy | Release switch and service lifecycle | Source/artifact release with required revision; inspected lifecycle revision | Original release/revision receipt; inspect observes current identity/health; rollback uses retained bytes, recovery remains journal-owned |
| tdev_diagnostics | Existing granted diagnostics and witness capability | Positive phase/action alternatives | Bounded incidents/counters/witness receipts; no inference of UI delivery; fixed host hints preserved |

Common result semantics remain `ok/result` or `ok:false/error` with effect certainty. Original
operation identity, admission source and current observation are not collapsed into one success
flag. Existing typed errors distinguish schema, stale state, unavailable/revoked authority and
unknown effects; find adds typed resolution/candidates rather than prose-only ambiguity.
No executable next-mutation plan, automatic retry, workflow engine or default “latest task” is added.

Examples:

```typescript
tdev_find({request:{project:"tdev",label:"surface",state:"all"}})
tdev_exec({request:{requestId:"persist-before-send",taskId:"resolved",expected:"exact",
  command:"python -m unittest",waitMs:30000}})
tdev_exec({request:{requestId:"new-process-intent",taskId:"resolved",expected:"exact",
  command:"python app.py",mode:"process"}})
tdev_deploy({request:{action:"release",subject:"artifact",requestId:"release-intent",
  validationId:"exact-artifact-validation",name:"preview",expectedRevision:0,
  health:{port:18080,path:"/"}}})
```

The examples illustrate shape, not fixture-valid IDs or authorized production commands.

### 9. Before / after workflow

The fixed six workload traces were schema-encoded for every architecture. Counts below are
analytical comparisons under their stated fixtures, not measured ChatGPT planning results.

| Scenario | Baseline calls | Selected design calls | Carried state / user intervention |
|---|---:|---:|---|
| Small edit/test/validate/publish | 9 | 9 | Exact task/checkpoint/receipts retained; branch requirements now visible |
| Persistent debugging | 9 | 9 | Original process identity, output/stdin cursor; no ineffective process wait/capture choice |
| Fresh reconnect, one complete matching frontier | 4 | 2 | find + original effect observation; user supplies name/objective, not UUIDs |
| Initial artifact/release/verify/rollback | 11 | 11 | Source-validation/build/artifact-validation/service revision remain distinct; update needs inspect if revision unknown |
| Lost provider reply, original handle known | 2 | 2 | Observe original operation; no new effect identity |
| Multiple active tasks | 3 | 2 plus meaningful human choice | One find returns candidates; selected original operation then observed |

Name-only lost-reply recovery adds find before original-operation observation; it does not earn a
fictional one-call saving. Older history, incomplete pages and live remote/deployment health can
require more inspection. Stable identities still exist and are transported by the agent; they
are recovered from current authorized facts rather than demanded from the user. Completed
predecessors and closed work remain visible so missing context does not imply a new start.

### 10. Confusion removed

Schema rejects cross-action fields, missing branch requirements, both/neither status locators,
predecessor/local-adoption conflict, process capture/wait and implicit revision updates. Names and
receipts separate resume discovery from new task creation. Explicit output certainty separates
admission from execution success, build from artifact verification, publication from deployment,
and switched release from current health. No new network/container/provider-auth concept is exposed.
Host scheduling budgets moved from operation discovery to the caller adapter; server state,
transport flush, Tunnel delivery, cell execution and user-visible progress remain separate evidence.

### 11. Missing capability added

Human-name continuation now includes completed and closed predecessors, running/unknown receipts,
source checkpoint and publication state. Unknown project creation is discoverable before enrollment;
a replaced historical binding is unavailable rather than absent. Bounded paging cannot choose a
partial/latest match. Release intent distinguishes create-only from exact inspected update. Finite
and persistent execution now expose only mode-relevant choices without losing their stable handles.
These additions require no transcript, new credentials, global session owner or DB migration.

### 12. Safety / consistency

Lost response never authorizes a new request identity. Public envelopes do not enter stored
fingerprints. Authentication/current authority precede receipt replay; existing receipts replay
before stale CAS. Exact validated candidate publication, non-force remote CAS, unknown outcome,
maintenance frontier, unrelated dirty state, owned cleanup and artifact pins remain intact.
No hidden provider mutation/retry was introduced. Required release revision is checked before
preparation and again in admission. Schema rejection occurs before effect admission/SSE selection.
Deployment recovery can complete only its original journal; source discovery performs no recovery.

### 13. Validation

Final statuses and exact log/bundle identities are recorded in the qualification table below.
Focused, affected, full, actual client loading/calls, staged bundle, resident acceptance and
fresh ChatGPT schema acceptance are separate rows. The earlier 331-test run failed one stale
catalog-count fixture and is retained as a failure, not relabeled PASS. A later SDK run failed
an outdated object-property assertion after exec became a union; its fixed rerun is separate.
No production resident acceptance or full ChatGPT development journey is implied by local results.

### 14. Migration / state preservation

The stored task/operation/artifact/deployment formats are unchanged. Labels derive from original
intents. New public syntax normalizes to existing semantic inputs without permanent flat aliases.
Historical receipts remain observable even where old syntax is no longer admitted (for example
omitted release revision). User files, credentials, grants, connections, pending/unknown effects,
retained artifacts and deployment journals were not migrated or deleted. Local test fixtures own
all created source/build/service/prune effects. The isolated probe runtime/profile remains available
for host acceptance; existing production connections were not repointed. Dependency symlinks are
local test aids and excluded from publication. Canonical publication and resident cutover were not
performed and require their current authority/maintenance checks and explicit permission.

### 15. Remaining uncertainty

Uninstructed model tool selection, omission/invented-field frequency and long-session visible
continuation were not measured by a model benchmark. Host reports cover excerpts/instructed calls,
not every field/output in a complete injected catalog. The last execution branch passed its separate reported host gate. Production migration/cutover and real full ChatGPT artifact/deploy/reconnect journey
remain separate acceptance work. Android Termux same-UID authority is unchanged; no stronger
sandbox guarantee is claimed.

Strict input size increases: baseline 18,151 → 31,371 bytes; descriptions fall 9,824 → 3,299.
Full raw declarations, including outputs, rise 276,470 → 287,730 bytes (about 4.1%). These are
compact JSON bytes, not tokens. This design improves constraint fidelity and reconnect lookup
while accepting a measured context cost. Output compression or additional tool splits need real
host selection/result evidence before a further change. The final product corpus has 59 positive
cases and rejects all 854 deterministic invalid perturbations; that is schema correctness,
not a measured model error rate.

### Final qualification table

| Boundary | Result | Exact evidence / practical limit |
|---|---|---|
| Host-qualified schema invariants | PASS | `test_surface`, `test_surface_probe`, contract tests in final full run; positive alternatives, drift checks, no-op probe, fixed hints |
| Human continuation / pending-admission focused | 8 PASS, 17.955 s | `admission-frontier-focused.log`; Unicode label, restart, ambiguity/paging, closed work, revoked/replaced authority, unknown source/provider admission before resource creation, catalog adapter |
| Execution / wire affected | 19 PASS, 67.399 s | `execution-affected.log`; process immediate admission, wait/capture rejection before admission, bounded command/source waits, source wire validation |
| Final full `scripts/check.sh` | 331 PASS, 796.247 s | `product-final-full-check.log`; includes recovery/lost response, source/publication/deploy/artifact, HTTP, diagnostics, CLI and JS adapter coverage, plus diff whitespace check |
| Final official MCP SDK | PASS, 13 tools | `product-final-sdk-fixed.log`; pinned @modelcontextprotocol/client 2.0.0, protocol 2026-07-28, actual notifications/progress, terminal exit, replay |
| Final installed Codex loader | PASS, exact 13 input schemas | `product-final-loader.log`, `product.codex-tools.json`; two no-effect instructed calls, no model inference |
| Final actual Codex development journey | PASS | `product-final-codex-journey.log`; real local read/edit/native exec, fresh thread/find, stdin/replay, validation, exact disposable publication, composition and cleanup; productionTouched=false |
| Final inactive staged bundle | PASS | `product-final-bundle-rehearsal.log`, bundle `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`; authenticated loopback/restarts/SIGKILL recovery, retained bytes after scratch retirement, artifact validation/export/owned prune; productionServicesTouched=false |
| Fresh ChatGPT B / B2 comparison | B partial failure; B2 tested branches PASS | User declaration excerpts/control reports; no complete raw injected catalog or unbiased selection benchmark |
| Fresh ChatGPT selected find/start/release | PASS for reported declarations/instructed calls | `host-product-report.md`; three effect-free valid receipts, expectedRevision omission rejected before receipt |
| Fresh ChatGPT selected command/process | PASS for reported declaration/instructed controls | `host-exec-report.md`, `host-exec-summary.json`; digest matched, waitMs:0 and capturePaths:[] rejected before dispatch; no process ran |
| Production resident acceptance of 0.1.22 | PASS | Canonical `593d57a65d76c90f49cdf999d603e1c53a986477`; active bundle `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`; resident 0.1.22; exact unknown publication preserved; both configured connections healthy/running; refreshed ChatGPT injected 13-tool `request` surface and direct read-only calls passed |
| Real complete ChatGPT development/deploy/reconnect journey | NOT RUN | Probe validation receipts do not create tasks, run commands, deploy or attest visible continuity |

The latest resident readback had 44 open/72 closed tasks and 2,123 succeeded/338 failed/one running/
one unknown operation. These externally advancing counts are observations, not a migration result.
The unknown publication is still `2531fb0f9bbd4aa584865f62898e1010`; the running exec
`71b23ff3bc3948059fb2cc88f690425f` belongs to existing work and was not controlled by this redesign.

The final source contract digest is
`b25025e68029cf56837e2ca5e037ddd7c539641062cced351e189db8d1edb08a`.
`product-metrics.json` and `product-source-tools.json` reproduce its schema corpus and complete
advertisement; `product.codex-tools.json` records the actual final loader representation.
No production credential value appears in those artifacts. Historical failed checks remain
separate logs, so a corrected rerun does not erase the investigation trail.

## N. Authorized canonical publication and resident activation — 2026-09-30

The user explicitly authorized both canonical publication and resident replacement after the
completed local/host input qualification. This is new deployment authority; the preceding
sections retain their historical pre-activation observations. Current remote `refs/heads/tdev`
was rechecked at b418c1d; GitHub readback confirmed humtr/tdev identity 1322208918 and push access.

The current resident has only historical unknown managed-create publication
`2531fb0f9bbd4aa584865f62898e1010` outstanding. Its stored owner/task/ref/create intent and exact
candidate were reviewed, repository identity independently matched to GitHub, and its exact
remote ref read back absent. Absence does not prove original failure; the receipt remains unknown.
OPERATIONS' maintenance option allows this precise historical publication to be preserved and
excluded from the update frontier. No original provider mutation is retried or resolved.
`maintenance_ready` passes with only that exact exemption. Any new running/unknown effect still
blocks the installer. Credential/config/profile fingerprints are retained privately for post-update
comparison; public evidence contains only aggregate preservation results and receipt identity.

Selected qualified bundle: `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33`.
Its source/config compatibility and actual inactive-bundle journey were already qualified.
Publication is a non-force update from the observed canonical base; activation uses the existing
owned installation and recoverable installer, preserving both connections/auth modes and watch.
Completion, exact canonical commit, live schema readback and state-preservation results are
recorded below after each step succeeds. No successful deployment is claimed in advance.

Canonical publication completed at `593d57a65d76c90f49cdf999d603e1c53a986477`. The Codex session that prepared this
change ended immediately after the successful push because its workspace credit was exhausted; its retained command history
contains no resident installer invocation after that push. Resident activation was therefore resumed independently rather
than assuming a partially completed replacement.

The exact qualified source and bundle were rechecked before mutation. The pre-update frontier contained only historical
unknown publication `2531fb0f9bbd4aa584865f62898e1010`; no maintenance or install-transaction journal was pending.
The owned installer ran with that one explicit maintenance exemption, then `install.sh --check` succeeded. Readback showed:

- active bundle `ec6d43eb2e842b99203202e0deadb82c1a2abe2862546186dd753a71c8bb7c33` and resident version **0.1.22**;
- controller up, with `tdev_janmori` (Tunnel authorization) and `default` (Bearer) both enabled, healthy and running;
- historical publication `2531fb0f9bbd4aa584865f62898e1010` still exactly `unknown`/`unknown`, with no replay or resolution;
- no pending maintenance journal, install transaction or recovery state after the successful switch.

Before host Refresh, authenticated localhost discovery through `tdev_janmori` advertised exactly thirteen tools:
`tdev_find`, `tdev_workspace`, `tdev_task`, `tdev_read`, `tdev_edit`, `tdev_exec`, `tdev_operation`, `tdev_validate`,
`tdev_publish`, `tdev_project`, `tdev_deploy`, `tdev_artifact`, `tdev_diagnostics`. The selected composed tools had a closed
root object requiring `request`; live catalog inspection showed 9 task alternatives, 2 exec alternatives, 4 operation
alternatives, 2 validation alternatives and 6 deployment alternatives.

After the user performed the required ChatGPT connector Refresh, the actual injected catalog matched that thirteen-tool
resident surface. `tdev_project({request:{action:"list"}})` succeeded, and
`tdev_find({request:{project:"tdev",label:"surface",state:"all",limit:5}})` resolved the retained `typed-native-surface`
work uniquely without replaying an effect. Host-side negative controls rejected a deployment release missing
`expectedRevision`, process mode with `waitMs:0`, and process mode with `capturePaths:[]` before dispatch. This is installed
and refreshed ChatGPT surface acceptance, not the still-separate complete development/deploy/reconnect journey.
The bounded evidence summary is `examples/surface-probe/evidence/host-installed-acceptance-20260930.md`.
# Host/exact-operation boundary repair — 2026-10-01

Fresh root navigation/README, relevant ARCHITECTURE and contracts, and IMPLEMENTATION_PLAN
were rebound before editing. Remote `refs/heads/tdev` and the clean qualified source base were
`94a7e2e2de1c72bd2b5aca331528021454bf124d`; changes are isolated on
`fix/host-operation-boundary-20261001` in `tdev-surface-redesign`. The original dirty
`prj/tdev` checkout and its unrelated changes were not edited. Source is **0.1.25**;
resident remains **0.1.24**, active bundle
`34e0b9234eacfd8948c73b0a6c257b75f13503c50a587f9c7fa987d116609e56`.
Read-only resident SQLite inspection confirmed historical publication
`2531fb0f9bbd4aa584865f62898e1010` still `unknown/unknown` and schema version 5.
No resident/config/provider/Tunnel/observer/diagnostic control action or publication was performed.

## Confirmed defects and selected repairs

- **Source identity:** unchanged command capture made a new checkpoint. A pre-fix regression
  failed because a read-like failed exec changed the source validated for publication. Capture
  now keeps the starting checkpoint for an identical tree. Real changed capture and A→B→A
  retain Git-history CAS semantics; execution history remains in durable operation receipts.
- **Terminal overwrite:** fault injection submitted one command, reconciled its terminal
  result, then raised an unknown dispatch-reply fault. Pre-fix `fail()` changed succeeded to
  unknown despite retained success. Terminal guards now cover `fail()` and `save_intent()`
  as well as `finish()`; original identity/result/intent survive late errors and replay.
- **Completion/admission friction:** a sealed backend result with an unreconciled busy row
  rejected useful next work. Admission now observes only that task's busy predecessor once,
  outside the SQLite transaction, then rereads the task and rechecks busy/CAS in the transaction.
  Source-changing capture rejects old expected state; unknown stays fenced. Publication also
  refreshes its validation row before the exact candidate join. This is not a background
  terminalizer or a new dispatch/retry.
- **Budget ownership:** repository/project policy can express `validationTimeoutSeconds`.
  Explicit request timeout overrides it, with legacy fallback 300 seconds. Admission/status
  reports the frozen deadline and origin; project inspection reports the current default.
  Existing receipt bytes are not rewritten and old origins are not inferred. Budget changes
  alone do not invalidate a successful candidate or change command/process/artifact budgets.
- **Consumer boundary:** pure `classifyTdevReply` distinguishes RPC processing from durable
  outcome and prevents a failed/running/unknown result from advancing the selected plan.
  Monitor terminal packets still expose operationStatus/full receipt. CONTROLLER now states
  the actual one-wait-per-default-cell behavior and separates goal continuation/new admission.

The choice keeps thirteen tools and the exact fixed annotation profile. It adds no workflow
engine, conversation store, attempt-key cache, terminal resume, automatic retry or periodic
reconciler. There is no state schema migration, cleanup or historical receipt repair.

## Executed qualification

Private logs are under `.artifacts/host-control-plane-boundary-review-20261001/`.

| Check | Actual result | Evidence |
|---|---|---|
| Pre-fix no-op, terminal-overwrite and unobserved-completion regressions | 3 expected failures; reproduced before implementation | Recorded test output in this Codex turn |
| Focused final selection | 14 Python tests PASS, 50.064 s; includes 16 Node controller tests | `focused-qualified.log` |
| Additional exact publication/admission reconciliation | 1 test PASS, 3.325 s | `publish-reconciliation.log` |
| Affected core/native/recovery/progress/projects/contracts/surface/caller checks | 78 tests PASS, 309.485 s | `affected.log` |
| Current `sh scripts/check.sh` | **346 tests PASS**, 530.115 s, and `git diff --check` PASS | `full.log` |
| Fixed tool count/hints readback | 13 tools; all annotations equal to source base | Local contract comparison |

The first focused run had a test-authoring mistake: it expected nextIndex=0 on review, but the
adapter consumes the received reply and returns nextIndex=1 while blocking the successor.
That assertion was corrected; no publish or automatic retry had occurred. The later focused,
affected and full results above are the successful runs, not a relabeling of that failed run.
The full suite includes all added cases, HTTP/MCP, packaging/deployment, installer/resident,
lost-response recovery and ABA checks. The extra focused publication case and authorization/
legacy-origin cases supplement the earlier affected selection and are all included in full.

## Acceptance limits

This is source/local qualification, not canonical publication, resident activation, a new
ChatGPT execution trial or visible-history acceptance. Goal strategy remains Host-owned;
exact effect truth/idempotency/CAS remain tdev-owned. UI/history and server HTTP completion
cannot prove each other. The reported 300-second Host threshold, activity-summary replacement
and UI history disappearance still have no established root cause or causal link to these
repairs. Changing validation budget may avoid a proved execution timeout; it does not establish
that the Host/UI stall is repaired.


## 0.1.25 inactive delivery qualification — 2026-10-01

Fresh rebind found canonical `94a7e2e2de1c72bd2b5aca331528021454bf124d`,
resident 0.1.24 and no changed bytes among the 17 source-qualified owned files.
The explicit subsequent user instruction authorizes installation and canonical publication.
The original dirty checkout remains untouched.

`PYTHONPATH=src:.tdev-deps python scripts/rehearse.py` passed using staged bundle
`f1d10cf548ff2cbc1169db2ab239b3c772a0b8264e61ad8b31bffad777877ee7`.
Actual isolated bundle HTTP/restart, native SIGKILL receipt recovery, exact publication,
artifact preparation/validation/export/prune passed with 13 tools; no production services
were touched. `scripts/rehearse_services.py` also passed on an isolated real runit graph,
covering install/update/recovery/desired-down/uninstall and connection registration.
The fake Tunnel process in that second rehearsal does not prove external delivery.
Private logs are `inactive-install.log` and `inactive-services.log` beside the source
qualification evidence. Existing focused/affected/full results remain the source gate.

Fresh resident readback confirmed controller 0.1.24 and both enabled connections polling.
The only outstanding operation is historical managed-create publication
`2531fb0f9bbd4aa584865f62898e1010`, still `unknown/unknown`. The bounded installation
exemption validates its retained identity without retry or outcome resolution.
Before activation, a private read-only snapshot retained all 7 state tables (123 tasks,
2669 operations, 13 projects, 20 artifacts, 6 deployments), config/connection/credential
and diagnostic correlation-key hashes. Production activation and actual Host acceptance
are not claimed by these inactive results.


## 0.1.25 resident activation and live readback — 2026-10-01

The user explicitly authorized canonical publication and resident activation after source
qualification. The fresh remote was `94a7e2e2de1c72bd2b5aca331528021454bf124d`.
Only the 17 qualified owned files were staged; executable/schema/test bytes matched the
source-qualification manifest (delivery notes were the only subsequent changes). Commit
`983f4559ac1f79526cd8bd59558ed496d67773e9` was pushed non-force to `refs/heads/tdev`
and independently read back. The original dirty checkout and unrelated untracked artifacts
were excluded. Focused 15 / affected 78 / full 346 source tests remain the source gate; both
inactive rehearsals passed separately. No full-suite result is relabeled as Host acceptance.

The production root remains
`/data/data/com.termux/files/home/.local/share/tdev/composition-upgrade-53vwtpp8`.
`admin.stage` verified inactive bundle
`f1d10cf548ff2cbc1169db2ab239b3c772a0b8264e61ad8b31bffad777877ee7`,
compatible config/state schema and existing pinned profiles before activation.
`Installation.install` used its existing locks/journal/maintenance fence, supplied no new
config and exempted only historical managed-create publication
`2531fb0f9bbd4aa584865f62898e1010`. It did not resolve or retry that publication.
The old 0.1.24 bundle remains retained for compatible rollback. Journal/fence cleared.

Actual supervised readback: controller PID **20349**, version **0.1.25**, exact active
bundle above; `tdev_janmori` PID **20403** and `default` PID **20449**, native CGO and
successful control-plane poll. Immediate post-switch polling initially reported both
connections not ready; subsequent observation confirmed both healthy without extra restart.
Only installer-owned controller/Tunnel cutover occurred. No observer was started or
restarted, no diagnostic activation/stop/key rotation was called. Health remains `watch`;
config and diagnostic correlation key hashes are unchanged. A new controller process
naturally has a new runtime instance; this is not a new diagnostic-key generation.

Before acceptance mutations, read-only SQLite comparison confirmed exact equality of every
preexisting row in all seven tables (2669 operations, 123 tasks, 13 projects, 20 artifacts,
6 deployments, 7 workspaces, 16 memberships). State version remains **5**. Config, resident
connection collection, both profiles, runtime/authorization key files and diagnostic
correlation key all matched their pre-activation hashes; pinned Tunnel binary unchanged.
After owned acceptance, every preexisting row still matches. Only **one task and nine
operation receipts** were added; no project/artifact/deployment was added or altered.
The unknown publication remains byte-for-byte `unknown/unknown`, the sole outstanding effect.

Actual installed **localhost HTTP MCP** acceptance (2026-07-28; not a ChatGPT call):

- `/healthz` bound 0.1.25/bundle/PID; installed config passed its active schema.
- Raw `tools/list` returned 13 tools, required typed `{request: ...}` roots and unchanged
  fixed annotation profile. Raw declaration fixture is retained privately.
- `tdev_project list` returned `validationTimeoutSeconds` for enrolled projects;
  `tdev_find` resolved the closed published `a1-source` predecessor by human locators,
  without receiving a user-supplied internal ID or replaying any prior effect.
- An explicitly new managed task `boundary025-installed-readback-20261001` started from
  that predecessor. Its `true` command succeeded and retained the exact source checkpoint.
  A separately admitted `exit 7` returned RPC/tool `ok:true`, durable `status:failed`,
  `effect:committed`, exit 7, and the same checkpoint. Later status still reports failed.
- The fixture's original mandatory source checks passed in validation
  `3b858ce2e59d4df6893a38a2159977cb`, candidate
  `2c027556b33071ba873dbe03d26c026ba2213715`. Admission and subsequent status both expose
  timeout **300** / origin **default**; terminal evidence has exit 0. This creates no
  source publication or deployment. Validation candidate and source checkpoint remain
  distinct concepts. Existing budget policy bytes were deliberately preserved.
- The qualified pure caller classifier consumed those actual packets: failed → `review`,
  successful terminal validation → `continue`; no automatic retry occurred.
- Owned command/validation scratch was retired and the task closed/cleaned; human-name
  discovery still returns its closed terminal frontier with no outstanding effect.

Private evidence: `activation-result.json`, `preservation-result.json`,
`resident-readback.json`, `installed-tools-list.json`, `live-mcp-readback.json`,
`live-classifier-readback.json` and `final-installed-state.json`, alongside previous logs.
A local harness-generation typo (`NameError: S`) occurred before any validation dispatch;
correcting the harness did not repeat an admitted effect.

**Next actual Host gate:** user Connector Refresh, then a new conversation. Existing
conversations may retain old injected catalogs. Inspect actual injected execution/budget
fields and use `pkg-chatgpt-20260930-a1` / label
`boundary025-installed-readback-20261001` / `state:all` to recover these receipts.
Observe the succeeded validation and the distinct failed exit-7 predecessor; do not execute
either again. Long-running acceptance must separately choose an adequate execution budget
(existing `tdev`/delegated policies omit the new optional repository default, so fallback
300 persists). Server HTTP return, Tunnel poll and pure local classifier success prove no
ChatGPT scheduling, visible delivery or history persistence outcome. The reported 300-second
Host boundary, `monitored…` stall and UI/history rollback remain unresolved.


## Repository budget and fresh Host follow-up — 2026-10-02

Fresh root navigation rebound canonical `7f3032badeb97ff6af305ad9558a5308a1f7ebbb`,
resident 0.1.25 / bundle `f1d10cf548ff2cbc1169db2ab239b3c772a0b8264e61ad8b31bffad777877ee7`,
controller PID 20349 and two healthy polling connections. The original dirty checkout is
not development authority and remains untouched. No source/runtime code changes or version
bump are required. User authorization “남은 순서 진행” covers the outstanding tdev budget
configuration/readback and Host follow-up.

### Received Host report and independent retained corroboration

The user supplied a fresh ChatGPT Host acceptance report (total turn 12m48s). It reports
13 injected tools, correct outer `ok:true` versus exit-7 failure consumption, one ~420-second
command with explicit timeout 900, same-turn cell returns around admission-relative 287s
and 326s, terminal delivery ~440s and final rediscovery ~504s. Output cursor advances and
V1–V15 commentary are caller-reported; they were not independently reconstructed here.
The report explicitly executed no source validate/publish/deploy.

Current SQLite independently matches task `b1cb57ef413648b98724b3b6aac8930a`, label
`host025-chatgpt-20261002`, checkpoint 7f3032b, closed/busy-null/deleted ref. Its long command
`3d60fa9b436144e59b998c99ca9b8134` remains committed/succeeded/exit0/timedOut:false,
with frozen request timeout900. Its exit-7 predecessor remains committed/failed/exit7.
No original effect was replayed. Read-only live diagnostics inspection reports watch,
39 retained witnesses / 1 run / zero witness eviction, instance `0f100d213d53f05c`,
key generation `7ca33a31371bbfad`; no activate/stop/acknowledge was issued. Disk event
retention contains only 15 witness events across historical logs and does not independently
reconstruct all 39 receipts or full physical-cell timing.

This is positive actual Host evidence against a universal fixed 300-second successor-cell
cutoff under the tested conditions. Visible stall/history rollback is **not reproduced in
this reported run**, not proven permanently fixed. The Host/model-side history report is
not independent Android UI persistence attestation. Earlier incidents retain their unknown
root cause. No repeat of the completed 420-second workload is needed.

### Authorized repository budget configuration

The previous activation deliberately preserved config, leaving tdev's default unset.
The operator follow-up adds only `repositories.tdev.validationTimeoutSeconds=1800`.
Prior source full suite was ~530s; 1800 gives measured headroom for this repository without
turning it into a global/delegated default. Public per-attempt timeout overrides remain.
Under `config.lock`, the exact previous bytes were checked against a private backup; active
config-schema validation and an equality check after removing this single field passed.
The source validation acceptance-policy digest remains equal before/after; credentials,
connections, validation command, tooling policy and all other config values are unchanged.
Atomic mode-0600 replacement is durable and the controller reloads it at the next call.
No controller, Tunnel, observer or diagnostics restart/change was performed. Live
`tdev_project inspect` reads 1800 on the same resident.

Focused four budget tests pass (16.002s): repository precedence/frozen replay/new attempt,
successful candidate validity after default change, delegated policy refresh and config ranges.
The first local test selection mistakenly named two tests under `BoundaryTest` rather than
`NativeBoundaryTest`; those two did not execute and the failed selection is retained as
`focused.log`. Correct selection is `focused-qualified.log`; no product change was made.

An explicitly new owned task `tdev025-budget-readback-20261002` starts at canonical 7f3032b.
Source validation `61e84d6ae0944343b65c1eaba7de6a5b` deliberately omits caller timeout.
Actual resident admission freezes `timeout:1800 / timeoutSource:repository`, candidate
`cad2983f3a859a93d5fe97f3bdcf06ebea36cc6d`. Its adopted command remains
`sh scripts/check.sh`; this is separate installed source-suite evidence, not another
ChatGPT Host run. Observe that exact ID only; no hidden retry, terminal resume or publication.

Private evidence is `.artifacts/budget-host-closeout-20261002/`: received report summary,
retained-state/corroboration snapshots, private config backup/hash/change receipt, focused
logs and actual MCP admission/status packets. Terminal result/owned cleanup follow below.

### Installed source-suite terminal and closeout

The one new source-validation operation above completed `sh scripts/check.sh`:
**346 tests PASS in 834.517s**, followed by successful `git diff --check`. Retained operation
truth is committed/succeeded/terminal/stopped/exit0/timedOut:false/cancelled:false.
The accepted budget remains **1800 / repository**, source checkpoint remains 7f3032b,
candidate remains cad2983f. The polling helper observed completion at admission-return-relative
843.2s; this sampling time is not the suite duration or a ChatGPT visible-delivery measurement.
The real 834.5s suite strengthens the need for a repository-specific budget above 300.

Owned task `e39bf6d5e2f14d63823ac92fe5d2d527` was closed at its unchanged source checkpoint,
validation scratch retired and task cleanup completed. Human-name rediscovery returns unique
closed work and no outstanding effect. No source candidate was published or deployed.
All preexisting DB rows are still identical, including the Host report's original operations
and the historical `unknown/unknown` publication. This slice added one owned task and five
operation receipts. The snapshot also observed six new independent Codex/shared-server exec
receipts from a concurrent actor; they are not attributed to this acceptance and were not
controlled or cleaned up. Attribution is retained in `new-operation-attribution.json`.
Config differs semantically in exactly the authorized tdev budget field;
credentials, connections, diagnostic key and resident settings remain unchanged. Controller
PID20349 and Tunnel PIDs20403/20449 are unchanged and healthy/polling on the same bundle.

Evidence adds `validation-admission.json`, `validation-terminal.json`,
`installed-full-validation.log`, `validation-monitor.log`, `cleanup-result.json` and
`final-preservation.json`. Full validation ran in the actual resident's native executor;
it is not a claim that the supplied ChatGPT Host executed source validation. Documentation
closeout changes no executable/schema/test bytes and requires no new bundle or version.

The remaining general uncertainty is intermittent Host/UI behavior outside this one
successful reported Host run. Resume ordinary useful development with the configured budget
and retained effect identities; open another targeted Host investigation only if new evidence
identifies a gap. A permanently fixed UI/history defect is not asserted.
