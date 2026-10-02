# Development surface experiment

This directory is **evidence and an isolated prototype**, not another architecture or wire
authority. The dated review in [LOCAL_VALIDATION](../../LOCAL_VALIDATION.md#surface-redesign-review--2026-09-30)
contains decisions, limitations and qualification results. Source 0.1.22 implements the selected
thirteen-tool contract; historical candidates remain pinned to the baseline. No probe candidate
here dispatches a command or changes a project.

From the repository root, using the repository's Python dependencies:

```sh
PYTHONPATH=src:.tdev-deps python scripts/probe_surface.py --generate examples/surface-probe/generated
PYTHONPATH=.tdev-deps python scripts/probe_surface.py --stdio B
PYTHONPATH=src:.tdev-deps python -m unittest discover -s tests -p test_surface_probe.py -v
PYTHONPATH=src:.tdev-deps python scripts/measure_surface.py
PYTHONPATH=.tdev-deps python scripts/probe_surface.py --stdio product
```

`root` is the strict composition control; A is the current flat advertisement; B wraps the
canonical input in a required `request`; C exposes each dispatch branch separately; D groups
branches into observe/project/source/run/release plus diagnostics. C preserves the constant
action field and existing conditional constraints; D preserves canonical arguments under a
workflow discriminator. Neither pretends that the mechanical transformation optimizes naming.
Historical candidates are generated from the pinned `evidence/baseline-contract.json`
(snapshot of canonical b418c1d, SHA-256 recorded in authority evidence). This is an experiment
fixture, never a product contract owner; product changes cannot rewrite the historical controls.

The first fresh ChatGPT report found B task start rendered as `Exclude<any, any>` despite valid
calls; validation/read/edit positive controls remained typed. See
[the user-supplied host report](evidence/host-B-report.md). B is not a full-fidelity PASS.
**B2** expands the current finite/presence conditional vocabulary into disjoint positive object
alternatives, merging identical regions. It preserves ranges, patterns and required semantics;
unknown conditional vocabulary or more than 256 elementary combinations fails closed. This
bounded experimental compiler is not proposed as a universal production schema transformer.
`--stdio compare` exposes B2 plus five named root/A/B/C/D task/source controls for a single
fresh-session structural trial. This mixed catalog cannot measure unbiased tool selection.

`generated/*.tools.json` are actual MCP declarations, `*.calls.json` are valid calls for all
53 dispatch variants, `field-inventory.json` contains every branch/field/constraint, and
`metrics.json` reports exact UTF-8 bytes and deterministic schema rejection counts. There is
no tokenizer estimate presented as measured tokens. The 777 negative examples are perturbations
of minimal valid inputs, **not** a model-generated error distribution. Descriptions for C/D
are deliberately short probe labels; compare input bytes separately from descriptions.
Output schemas are excluded from candidate declarations because all candidates return the
same effect-free probe receipt. Full original output schemas remain in the resident capture.

The stdio server is an explicitly isolated legacy MCP edge for the probe. It does not change
the product's HTTP protocol or discovery. It returns `probeOnly:true`, `effect:none`, canonical
validation status and a digest. It never imports `Controller`, reads credentials, calls a
resident, executes an input command, or stores submitted arguments. Thus simulated start,
publish, release and cleanup calls cannot perform those effects. Do not attach real secrets.

## Actual host trial

Use a **new, dedicated** Tunnel/connector. Do not repoint an installed tdev connection. A native
Tunnel stdio command can run the absolute script path with the existing `.tdev-deps` in
`PYTHONPATH`. Trial alias: `tdev-surface-probe-20260930`. Initial creation was blocked by absent
`OPENAI_ADMIN_KEY`. The user subsequently supplied a key via local clipboard storage and
authorized independent schema transmission/testing. A separate inactive admin profile references
its private file; the runtime references the existing runtime key without copying/rotating it.
Tunnel `tunnel_6abc8a11a61c8191afc952512ff005a6` is now running; existing tdev connections are
unchanged. It served B, then `compare`, and now serves the selected `product` inputs. Refresh and start a fresh conversation
after that catalog change. Local readiness and the status tool's unknown poll-health snapshot
remain separate from user-reported successful actual host calls.

Fresh reports for B2 and the selected product are retained in `evidence/host-B2-report.md`
and `evidence/host-product-report.md`. Product find/start/release declarations and instructed
calls passed their reported checks. The final command/process declaration, valid process fixture
and two expected schema rejections also passed; see `evidence/host-exec-report.md`.
The product probe preserves the user's fixed host annotations. `product-source-tools.json`
captures complete source inputs/outputs; `product-probe-tools.json` omits outputs because the
effect-free probe has a different result. `product.codex-tools.json` captures the actual local
Codex loader representation. These artifacts are not a complete ChatGPT injected catalog.

For each candidate (and the root control):

1. Expose that candidate using `--stdio root|A|B|C|D`. Record the actual `tools/list`, its
   SHA-256 and candidate name. Refresh the dedicated connector and open a **fresh** ChatGPT
   conversation. Switching the process does not prove an old catalog refreshed.
2. Capture the host's injected tool declaration verbatim, with host/session/time and catalog
   identity. Preserve root type, required fields, nested query/edit union, action discrimination
   and status locator exclusion. A reconstructed TypeScript declaration is not host evidence.
3. Ask the fixture prompts below without showing their gold call. Save the actual first call,
   extra calls and tool results, including failed calls. Score selection, required omissions,
   invented fields, invalid combinations and unnecessary round trips against the fixture.
4. Repeat in at least three fresh conversations per candidate, rotate candidate order and
   use the same fixtures. Report denominator, host/model identity and failures. A schema-valid
   call with the wrong intent fails selection even though the probe accepts its arguments.
5. Run a separate disposable real-controller journey after selection. Echoing a request
   cannot prove effect safety, concurrency, live deployment or semantic continuation.

Use fixed fixture facts: project `fixture`, task `task`, checkpoint 40 `a` characters,
validation `validation`, operation `operation`, service `preview`, revision 2, and original
lost request `lost-reply`. This supplies machine context; users need not invent those handles.

| Prompt | Correct first intent | Failure to count |
|---|---|---|
| “이 작업 이어서 해.” Task handle absent; project name known. | Discover existing work; inspect selected frontier. | Start a new task; choose most recent arbitrarily. |
| “테스트하고 배포해.” Task/checkpoint known, no source validation yet. | Validate source; inspect its real result before subsequent build/release. | Release without validation; call acceptance treated as success. |
| “실행 중인 것 상태 확인.” Operation handle supplied. | Observe original operation. | Exec/process start or cancel. |
| “이 변경만 커밋해.” Candidate validated; publication is explicitly intended in fixture. | Publish that exact validation. | Rebuild candidate or deploy. Real vague “commit” requires distinguishing local checkpoint from publication. |
| “새로 시작하지 말고 이어서.” Original request known, reply lost. | Observe by original request identity. | Fresh mutation request; infer failure from absent reply. |
| “기존 작업과 별개로 실험해.” Project known. | Explicit independent task start. | Reuse/overwrite existing source task. |
| “배포는 하지 말고 검증까지만.” Task/checkpoint known. | Source validation only, then observe. | Publication/release automatically chained. |
| “artifact 검증해.” Retained non-service artifact handle supplied. | Artifact validation without source-only fields or health port. | Rebuild; invent a port or source checkpoint. |
| “두 작업 중 UI 오류 수정 이어서.” Two same-project tasks. | Choose the matching human objective; inspect current state. | Choose latest row regardless of objective. |

## Fixed workflow traces

These are **analytical lower bounds**, not measured model call counts. A/B/C/D route identical
semantic steps and therefore do not reduce semantic calls merely by renaming tools. Each
`observe` below is one sample; add calls for longer execution, paging or provider failure.

| Scenario | Fixed trace | Calls |
|---|---|---:|
| Small edit, unopened task | project list → task start → read → edit → exec focused → observe → validate → observe → publish | 9 |
| Debug an existing task | inspect → process start → logs/status → edit → cancel → stopped status → process start → terminal status → retire | 9 |
| Reconnect with one candidate on first page | project list → task list → task inspect → original operation status | 4 |
| Artifact/service with source task and target already known | source validate → status → recipe inspect → build → status → artifact validate → status → release → service inspect → rollback → service inspect | 11 |
| Lost provider reply, request identity retained | original mutation (lost) → original-request status | 2 |
| Two tasks, first page, human choice required | task list → selected task inspect → original operation status | 3 + user choice |

Proposed name-based `find` can combine first-page discovery and selected frontier in the
unambiguous reconnect case (1 call + operation observation), but this saving is a hypothesis
until the implementation handles complete ambiguity detection, pending admissions and paging.
No candidate can safely make an unresolved provider outcome certain by adding calls.
