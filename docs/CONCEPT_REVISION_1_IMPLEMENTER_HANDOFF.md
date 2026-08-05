# concept-revision-1 구현 인수 명세

> 상태: 비규범(non-normative) 인수 문서
>
> 기준일: 2026-08-05
>
> 기준 원격 브랜치: `concept-revision-1`
>
> 기준 커밋: `2c3c5c14ddcc43bb6fda944f9ba1ddce1909663f`
>
> 원본 기준 커밋: `concept@79c7196c32ba4e17505068c5084f3f830a2adf53`
>
> 이 문서는 구현 재개를 위한 증거·순서·검증 체크리스트다. 제품, 아키텍처, 프로토콜, 보안, 배포 계약은 `AGENTS.md`가 연결하는 원본 owner 문서가 계속 소유한다. 이 문서와 owner가 충돌하면 owner를 먼저 고치고 이 문서를 갱신하거나 폐기한다.

## 1. 최종 판정

**전체 요청은 완료되지 않았다.**

`concept-revision-1` 원격 브랜치는 생성·게시됐지만, 현재 원격에는 다음 두 foundation 커밋만 있다.

1. `7a13c4fa43ada6b5c4124c573b3994dfa00105d2` — `feat: establish concept revision 1 foundations`
2. `2c3c5c14ddcc43bb6fda944f9ba1ddce1909663f` — `docs: verify concept revision 1 foundations`

완료된 범위는 Design 0005가 소유하는 transaction·schema/generator·MCP representation **foundation**이다. 다음은 구현되지 않았다.

- M1 Worker semantic boundary
- 12 capability의 완전한 executable input/result schema
- deterministic TypeScript MCP projection/catalog/digest
- 실제 Worker ingress, auth, authorization, routing, result shaping
- 12 capability Worker/CaseDO 통합
- 실제 Cloudflare Durable Object M1 qualification
- AgentDO
- Go CLI/Termux Agent
- `file.read` end-to-end walking skeleton
- 공개 MCP endpoint와 current-client qualification
- 설치, 활성 release, rollback, recovery, 비용·배터리 증거

따라서 `concept-revision-1`의 현재 상태를 “전체 구현 완료”, “M1 완료”, “M2 완료”, “공개 MCP 완료”, “Termux Agent 완료”라고 표현하면 안 된다.

## 2. 적용한 권위와 검토 기준

이번 재검토는 원격 `concept-revision-1@2c3c5c14...`에서 새로 만든 clean Task-owned worktree `wt_0622e82a526c47f7`을 기준으로 수행했다. 다음을 적용했다.

- `AGENTS.md`
- `RULE.md`
- `SDD.md`
- `WORKBOARD.md`
- `docs/SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/PROTOCOL.md`
- `docs/MCP.md`
- `docs/OPERATIONS.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/MVP.md`
- `docs/design/README.md`
- Design 0003, 0004, 0005
- `protocol/README.md`
- 현재 소스, schema, generated output, tests, Git history, remote branch

`docs/POST_IMPLEMENTATION_AUDIT.md`는 현재 권위가 금지하므로 읽거나 검색하거나 수정하지 않았다.

권위 역할은 다음처럼 분리한다.

| 역할 | owner |
| --- | --- |
| 제품 범위·요구사항 | `docs/SPEC.md` |
| component와 ownership | `docs/ARCHITECTURE.md` |
| 12 capability, wire/domain semantics | `docs/PROTOCOL.md`, canonical JSON Schema |
| MCP revision·projection | `docs/MCP.md`, Design 0003 |
| CaseDO lifecycle·storage·replay | Design 0004 |
| revision-1 foundation correction | Design 0005 |
| 현재 순서와 gate | `WORKBOARD.md` |
| 이후 Worker 설계 | 새 accepted Design 0006 필요 |
| 이후 AgentDO/Termux Agent 설계 | 새 accepted Design 0007 필요 |

## 3. 정확한 Git·Task 상태

### 3.1 원격

| ref | SHA | 판정 |
| --- | --- | --- |
| `origin/concept` | `79c7196c32ba4e17505068c5084f3f830a2adf53` | 변경되지 않음 |
| `origin/concept-revision-1` | `2c3c5c14ddcc43bb6fda944f9ba1ddce1909663f` | foundation 게시됨 |

`concept-revision-1`은 `concept@79c7196...`의 descendant이며 force update 증거는 없다.

### 3.2 현재 full implementation Task

- Task: `task_2ba_6d0b642538`
- continuity key: `tdev-concept-revision-1-full-implementation`
- 원래 objective: foundation, Worker, AgentDO, Go Agent까지 전체 source work 구현·게시
- 실제 달성: foundation 게시와 이번 독립 재검토
- 미달성: Worker 및 Agent 계층

이 Task의 Job 실패 수는 작업 중 계속 증가할 수 있으므로 수치 자체를 completion 근거로 사용하지 않는다. terminal Job 성공/실패보다 원격 커밋, clean checkout, source tests, runtime probes를 우선한다.

### 3.3 오염된 기본 checkout

기본 `checkout:tdev`는 오래된 `c811afd...`에 있고 관련 없는 수정·비추적 파일과 `SESSION_HANDOFF_ONCE.md`를 포함한다. 이 checkout은 `concept-revision-1` 구현 기준점이 아니다.

금지:

- 기본 checkout을 reset/clean/stash하여 검토 worktree와 맞추기
- 비추적 `SESSION_HANDOFF_ONCE.md`를 복사·commit·삭제하기
- 기본 checkout의 부재를 원격 source 결함으로 판단하기

### 3.4 orphaned worktree와 초안

다수의 과거 worktree가 orphaned 상태다. 특히 Worker successor Task `task_2mg_263eecf72e`의 worktree `wt_6e28dce4a267fa8b`와 local ref `tmcp/tdev-concept-revision-1-worker`는 여전히 base `2c3c5c14...`를 가리킨다. 이 Task는 조사와 초안 작업을 수행했지만 새 commit이나 remote publish를 만들지 못했다.

따라서 다른 구현자는 orphaned worktree의 내용이나 Task Job 성공 수를 구현물로 승격하지 않는다. 필요 아이디어는 원격 owner와 source에서 다시 증명하고 새 Task-owned worktree에서 재작성한다.

## 4. 완료된 foundation

### 4.1 callback-owned CaseDO transaction portability

완료된 source:

- `edge/case-do/sql.ts`
- `edge/case-do/node-sqlite.test-support.ts`
- `edge/case-do/cloudflare-sqlite.ts`
- `edge/case-do/sql-store.test.ts`
- 관련 `schema.ts`, `repository.ts`, `control.ts` call sites

확인된 속성:

- production CaseDO 경로에 `BEGIN IMMEDIATE` 없음
- production CaseDO 경로에 `ROLLBACK` 없음
- `COMMIT` 검색 결과는 test identifier `PRECOMMIT_FAULTS`의 부분 문자열뿐임
- Node adapter가 callback transaction을 열고 rollback과 nested transaction 거부를 시험함
- Cloudflare structural adapter가 `transactionSync`를 소유하고 cursor를 callback/await 경계 전에 소비함
- SQL transaction-control interception bridge 없음

증거 한계:

- 실제 Cloudflare Durable Object runtime에서 실행하지 않음
- hibernation, restart, contention, production migration, PITR은 미검증
- structural adapter test를 live Cloudflare evidence로 사용하지 않음

### 4.2 logical migration identity

Design 0005는 logical DDL/invariant와 platform wrapper를 분리했다. migration identity는 raw `BEGIN/COMMIT` transcript가 아니라 canonical logical migration bytes를 기준으로 한다.

완료된 source는 local schema/migration digest와 reopen checks를 보존한다. live Cloudflare migration은 아직 미검증이다.

### 4.3 MCP revision-specific DTO와 internal durable record 분리

완료된 source/owner:

- MCP native revision을 final `2026-07-28`로 정정
- `edge/case-do/internal-records.ts` 추가
- internal persisted record codec과 public canonical DTO를 별도 경계로 표현
- MCP Task projection이 별도 lifecycle owner를 만들지 않는다는 owner 계약

미검증:

- 실제 SDK가 `2026-07-28`을 지원하는지
- current client가 어떤 revision/capabilities/Tasks extension을 보내는지
- public projection bytes와 client refresh

### 4.4 root consumer/language-target manifest와 selected closure foundation

완료된 source:

- `protocol/schemas/tdev.v1.targets.json`
- `tools/generate/targets.go`
- `tools/generate/main_test.go`
- generator target selection과 reachable `$ref` closure

확인된 속성:

- selected root에 role, targets, consumers, proof 요구를 선언할 구조가 있음
- missing root와 dangling ref는 fail closed
- strict empty object의 Go 생성은 `struct{}`로 검증됨
- open object와 typed additionalProperties map의 차이를 검증함
- generation은 deterministic
- 기존 broad Go view는 compatibility exemption으로 유지되며, 실제 Agent consumer 증거 없이 새 Edge-only Go root를 추가하면 안 됨

### 4.5 semantic validation single ownership

TypeScript와 Go runtime에서 동일 public validation 경로가 semantic validation을 한 번만 수행하도록 교정됐다. exact test `public contract validation runs structural and semantic validation exactly once`가 통과했다.

### 4.6 source validation

정확한 원격 commit `2c3c5c14...`에서 `portable` profile을 다시 실행했다.

- Job: `job_2sh_2ff69efa48`
- command: `npm run verify:sandbox`
- generated drift: clean
- TypeScript: 62/62 pass
- Go: 전체 `go test ./...` pass
- forbidden import: clean
- governance: 48 required files, 5 design records, 19 link sources pass
- before/after HEAD와 status digest 동일
- review worktree clean

이 결과는 foundation source와 local SQLite behavior만 증명한다.

## 5. 미구현 사항과 직접 반증

| 영역 | 직접 관측 | 상태 |
| --- | --- | --- |
| six read/query input roots | canonical schema에서 `ListOperationsInput` 검색 결과 없음. 다른 다섯 root도 owner가 미구현으로 명시 | 미구현 |
| 12 result roots | canonical schema에서 `SubmitOperationResult` 검색 결과 없음; owner가 0개라고 명시 | 미구현 |
| Worker source | `edge/`에는 `case-do/`만 존재 | 미구현 |
| Worker ingress/auth/router | 해당 경로·module 없음 | 미구현 |
| MCP projection generator | generated TS에는 types만 있으며 capability projection output 없음 | 미구현 |
| Design 0006 | design registry에 0001~0005만 존재 | 미구현 |
| AgentDO | `edge/agent-do` 없음 | 미구현 |
| Go Agent/CLI | `cmd/`와 `agent/` 경로가 없음 | 미구현 |
| Design 0007 | 없음 | 미구현 |
| real Cloudflare M1 | account/namespace/deployment probe 없음 | 미검증 |
| public MCP/current client | endpoint/client probe 없음 | 미검증 |
| R2 Artifact bytes | byte store source·runtime 없음 | 미구현/연기 |
| install/upgrade/rollback | active release와 predecessor probe 없음 | 미검증 |
| Android lifecycle/cost/battery | 실제 device probe 없음 | 미검증 |

## 6. 실패요소 분류

### 6.1 product/source 실패

가장 중요한 실패는 “완료되지 않은 objective”다.

- full Task objective는 Worker와 Agent vertical slice까지 포함했지만 원격에는 foundation만 게시됨
- Worker successor Task가 commit/push를 만들지 못함
- Agent successor source는 시작되지 않음
- full Task가 terminal completion이나 checkpoint 없이 장기간 active 상태로 남음

### 6.2 운영·도구 실패

과거 실패 Job에는 다음이 섞여 있다.

- 이미 존재하는 branch/worktree 이름 충돌
- Task lifecycle과 operation availability mismatch
- orphaned worktree ownership mismatch
- 잘못된 파일 경로 또는 아직 없는 `cmd`, `agent` 검색
- batch child 하나 실패로 인한 aggregate `BATCH_FAILED`
- harness 또는 shell invocation 실패
- checkpoint/pause 순서 경합

이 실패들은 자동으로 product source defect를 뜻하지 않는다. 반대로 Job이 `succeeded`라고 해서 Worker, Cloudflare, public MCP, Agent가 완료된 것도 아니다.

### 6.3 contamination 위험

- stale/dirty checkout
- orphaned worktree와 미게시 초안
- 같은 Task에서 병렬 branch/worktree 생성
- live layer 없이 local green을 확대 해석하는 위험
- source Task와 runtime qualification Task를 한 objective에 과도하게 묶은 위험

다음 구현은 scope를 더 좁게 나눠야 한다.

## 7. 다음 구현자의 임시 작업 계약

### 7.1 한 줄 정의

`concept-revision-1@2c3c5c14...`에서 Worker semantic boundary를 source-complete하고 exact remote fast-forward로 게시한 뒤, 별도 Task에서 AgentDO + 최소 Go Termux Agent `file.read` walking skeleton을 구현한다.

### 7.2 현재 확인된 계약

- TypeScript: Worker, CaseDO, AgentDO, MCP projection
- Go: CLI/Termux Agent와 실제로 소비하는 shared wire roots
- JSON Schema 2020-12: external shape/bounds owner
- CaseDO: Case/Task/Attempt/Event/receipt/current-state owner
- AgentDO: Agent connection epoch, queue visibility, dispatch fence owner
- Termux Agent: OS effect와 local precondition owner
- Worker: stateless bounded adapter; durable lifecycle state 없음
- all 12 semantic capabilities 유지
- MCP native revision `2026-07-28`
- Tasks/Resources/elicitation은 bilateral opt-in 전까지 baseline completion 조건이 아님

### 7.3 non-goals

- `concept` merge 또는 update
- generic shell capability
- global request owner, RequestDO, scheduler
- second Task lifecycle owner
- exactly-once 주장
- live Cloudflare/client/device 증거의 추정
- D1/R2 조기 도입
- existing Go output의 근거 없는 대량 삭제
- `SESSION_HANDOFF_ONCE.md` 삭제·commit

### 7.4 source acceptance

1. accepted Design 0006가 Worker source slice를 소유한다.
2. six read/query input roots와 12 result roots가 executable schema에 존재한다.
3. 모든 새/변경 root가 target manifest와 consumer evidence를 가진다.
4. public projection root는 TypeScript-only이고 shared Agent wire root만 Go 대상이다.
5. deterministic capability descriptor와 projection digest가 생성된다.
6. bounded ingress 순서와 privacy가 executable test로 고정된다.
7. all 12 capability가 one table-driven Worker/CaseDO suite에서 final owner까지 연결된다.
8. result construction, receipt storage/replay, egress가 같은 capability result contract를 사용한다.
9. full portable, go vet, diff check, governance, complete diff review가 통과한다.
10. clean commit을 exact lease로 `concept-revision-1`에 fast-forward하고 provider에서 독립 확인한다.

### 7.5 남은 외부 unknown

- Cloudflare account와 isolated namespace
- exact compatibility date와 `nodejs_compat` 결정
- current SDK/client revision·extension support
- actual Android/Termux device
- production secret/key lifecycle
- live cost and rollback

이 unknown은 source work 전체를 막지 않지만 해당 live completion claim을 막는다.

## 8. Stage A — Design 0006: Worker semantic boundary

### 8.1 새 owner 문서

먼저 `docs/design/0006-worker-semantic-boundary.md`를 `draft`로 만들고 다음 owner를 함께 읽고 정합화한다.

- `docs/PROTOCOL.md`
- `docs/MCP.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/MVP.md`
- Design 0004, 0005
- `protocol/README.md`
- `WORKBOARD.md`

Design 0006가 최소한 다음 결정을 소유해야 한다.

- executable root의 exact names와 versioning
- result root의 trust boundary
- capability descriptor canonical fields
- ingress envelope와 authentication interface
- Worker-to-CaseDO service interface
- deterministic routing
- read source와 artifact byte-source stub policy
- Agent-required operation의 typed pending/deferred result
- projection digest byte domain
- Node/source integration fixture와 live Cloudflare qualification 분리
- rollout, predecessor compatibility, rollback block 조건

### 8.2 executable root matrix

Design 0006가 exact names를 freeze하되 최소 의미는 다음과 같다.

| capability | input root | 현재 | result root | target |
| --- | --- | --- | --- | --- |
| `list_operations` | `ListOperationsInput` | missing | `ListOperationsResult` | TypeScript |
| `list_resources` | `ListResourcesInput` | missing | `ListResourcesResult` | TypeScript |
| `submit_operation` | `SubmitOperationInput` | present | `SubmitOperationResult` | TypeScript; shared subset만 Go |
| `get_case` | `GetCaseInput` | missing | `GetCaseResult` | TypeScript |
| `get_task` | `GetTaskInput` | missing | `GetTaskResult` | TypeScript |
| `control_case` | `ControlCaseInput` | present | `ControlCaseResult` | TypeScript |
| `finish_case` | `FinishCaseInput` | present | `FinishCaseResult` | TypeScript |
| `cancel_case` | `CancelCaseInput` | present | `CancelCaseResult` | TypeScript |
| `control_task` | `ControlTaskInput` | present | `ControlTaskResult` | TypeScript |
| `cancel_task` | `CancelTaskInput` | present | `CancelTaskResult` | TypeScript |
| `render_task` | `RenderTaskInput` | missing | `RenderTaskResult` | TypeScript |
| `read_artifact` | `ReadArtifactInput` | missing | `ReadArtifactResult` | TypeScript |

`V1` suffix 사용 여부와 shared sub-root 분해는 Design 0006에서 기존 naming 규칙과 generator compatibility를 검토해 확정한다. prose type을 그대로 복사하지 말고 canonical schema owner에 먼저 반영한다.

### 8.3 schema와 target manifest

변경 대상:

- `protocol/schemas/tdev.v1.schema.json`
- `protocol/schemas/tdev.v1.targets.json`
- `protocol/testdata/fixtures.json`
- `protocol/contract.test.ts`
- 필요 시 TS/Go runtime fixture tests

규칙:

- unknown fields reject
- 모든 list/read output bound를 profile과 hard ceiling으로 표현
- unsafe number, duplicate member, invalid UTF-8, depth/token/container overflow는 기존 ingress contract 유지
- public Tool input/result root는 `typescript` target
- Go target은 Agent wire consumer가 이번 slice에서 실제로 생기는 경우만 추가
- MCP annotation/catalog/projection manifest는 schema root가 아니라 TypeScript derivative
- result root가 generic `JsonValue` wrapper로 의미를 숨기면 실패

### 8.4 generator와 projection output

기존 generator 구조:

- `tools/generate/main.go`
- `tools/generate/targets.go`
- `tools/generate/main_test.go`
- `protocol/generated/typescript/types.ts`
- `protocol/generated/go/types.go`

Design 0006는 다음 generated output을 새로 정의한다. exact path는 accepted design에서 정하되 권고 경로는 다음과 같다.

```text
protocol/generated/typescript/capabilities.ts
```

최소 내용:

```ts
type CapabilityDescriptor = {
  name: CapabilityName;
  version: 1;
  inputRoot: string;
  resultRoot: string;
  mutation: boolean;
  owner: "worker" | "case_do" | "artifact_store";
  routing: "release" | "new_case" | "explicit_case";
  retryClass: string;
  approvalClass: string;
  annotations: {
    readOnlyHint: boolean;
    idempotentHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  };
  inputSchemaDigest: Sha256;
  resultSchemaDigest: Sha256;
  maxResultBytes: number;
};
```

생성물이 소유해야 하는 derivative:

- stable 12-entry order
- capability-to-input/result root mapping
- Tool name/description/annotations
- `inputSchema`, `outputSchema`
- catalog digest
- projection digest inputs

수동으로 같은 mapping을 Worker와 docs에 각각 만들지 않는다.

### 8.5 권고 Worker source layout

현재 `edge/worker`가 없으므로 Design 0006 승인 후 다음과 같은 좁은 layout을 생성한다.

```text
edge/worker/README.md
edge/worker/types.ts
edge/worker/ingress.ts
edge/worker/protocol.ts
edge/worker/auth.ts
edge/worker/authorization.ts
edge/worker/routing.ts
edge/worker/projection.ts
edge/worker/results.ts
edge/worker/service.ts
edge/worker/index.ts
edge/worker/*.test.ts
```

각 파일 책임:

- `ingress.ts`: byte limit, fatal UTF-8, lossless JSON, minimal envelope
- `protocol.ts`: MCP 2026-07-28 per-request revision/capability metadata와 mirror mismatch
- `auth.ts`: bearer/credential verifier interface, non-enumerating rejection
- `authorization.ts`: principal → Case grant/operation effect 확인
- `routing.ts`: release, deterministic new Case, explicit Case owner 선택
- `projection.ts`: generated descriptor를 MCP Tool/result DTO로 투영
- `results.ts`: capability-specific result validation, bounded content/structuredContent
- `service.ts`: stateless orchestration; lifecycle state 저장 금지
- `index.ts`: Cloudflare entry adapter; source test에서는 injected bindings 사용

CaseDO final service facade가 현재 명확한 단일 module로 없으면 Design 0006에서 새 `edge/case-do/service.ts`를 승인하거나 기존 admission/control/query 함수를 typed facade로 묶는다. Worker가 repository SQL에 직접 접근하면 실패다.

### 8.6 ingress 순서

모든 public semantic request는 다음 순서를 고정한다.

```text
1. transport byte ceiling
2. fatal UTF-8
3. lossless JSON lexical scan
   - duplicate/escaped-equivalent member reject
   - unsafe number reject
   - depth/token/container/string bounds
4. minimal JSON-RPC/MCP envelope
5. request-body protocol revision/capability metadata
6. mirrored header/meta agreement check
7. authentication
8. capability lookup and deep input validation
9. authorization and target grant checks
10. deterministic owner routing
11. canonical service call
12. capability-specific result validation
13. bounded MCP result projection
```

인증되지 않은 요청은 CaseDO lookup, operation catalog deep parse, owner-specific storage read를 유발하면 안 된다.

### 8.7 deterministic routing

- `list_operations`: release-pinned static catalog
- `list_resources`: authenticated locator/query service; D1이 없으면 owner-approved bounded source만 사용
- new `submit_operation`: existing Design 0004 route vector
- explicit Case capabilities: explicit `caseId` → CaseDO
- Artifact bytes: CaseDO metadata authorization 후 byte store interface; R2 미구현이면 typed unavailable/not-yet-materialized result

Worker가 request ID dedupe나 Task lifecycle을 저장하지 않는다.

### 8.8 result·receipt·replay vertical boundary

Mutation result는 다음 순서를 만족해야 한다.

```text
CaseDO transition result construction
-> capability result root validation
-> canonical bytes + digest
-> immutable receipt in same transaction
-> response loss
-> receipt replay reads original bytes
-> capability result revalidation at trust boundary
-> MCP egress projection
```

동일 `requestId + capability + semanticDigest`는 원본 semantic response를 재사용한다. 현재 row로 재구성하지 않는다. 다른 capability/digest는 no-write conflict다.

read result는 receipt를 만들지 않지만 stable snapshot/cursor/result bound를 지켜야 한다.

### 8.9 all-capability integration suite

하나의 table-driven suite가 12개 entry를 모두 다룬다.

각 entry가 선언할 항목:

- input root
- result root
- mutation 여부
- routing owner
- required auth/grant
- expected revision/dedupe behavior
- expected Event/receipt behavior
- maximum result bound
- privacy projection
- Agent dependency

필수 반증:

- unknown capability/root
- duplicate key, invalid UTF-8, unsafe number
- oversized unauthenticated body
- auth 이후 deep schema failure
- unauthorized subject non-enumeration
- same request replay
- request conflict
- response-loss replay
- result schema drift
- Agent-required operation이 success를 fabricate하지 않음
- Worker restart가 routing/continuity를 바꾸지 않음

### 8.10 Worker source 완료 검증

최소 명령/프로파일:

```text
npm run check:generated
node --test protocol/contract.test.ts edge/worker/*.test.ts edge/case-do/*.test.ts
npm run test:ts
npm run test:go
go vet ./...
npm run check:forbidden
npm run check:governance
npm run verify:sandbox
git diff --check
```

모든 결과는 exact source, profile, inputs, environment, before/after status를 기록한다.

## 9. Stage B — 실제 Cloudflare M1 qualification

Worker source commit을 게시한 뒤 별도 Root Task에서만 수행한다.

필수 관측:

- exact Worker bundle digest
- Wrangler/release config, compatibility date, `nodejs_compat` 또는 Web Crypto 결정
- isolated namespace와 migration identity
- authenticated/unauthorized ingress
- concurrent requests와 transaction serialization
- response loss와 immutable receipt replay
- object inactivation, hibernation, restart 후 canonical re-read
- cursor를 await 전에 소비하는지
- migration fault와 incompatible schema fail-closed
- PITR bookmark/restore/undo
- row reads/writes, index amplification, DB size, CPU duration, request/response bytes
- key generation rotation과 current/previous acceptance
- secret/unauthorized identifier log leakage 없음

source, Node SQLite, structural adapter, Miniflare만으로 이 gate를 닫지 않는다.

M1 completion은 최소 다음 walking skeleton을 실제 환경에서 증명해야 한다.

```text
authenticated request
-> public Worker
-> real CaseDO transaction
-> deterministic response/replay
-> hibernation/restart
-> same bounded read
```

## 10. Stage C — Design 0007: AgentDO + 최소 Go Termux Agent

Worker source가 remote에 게시된 exact commit에서 새 Root Task를 만든다. Worker Task와 섞지 않는다.

### 10.1 ownership

| component | owner |
| --- | --- |
| CaseDO | intent, Attempt identity, expected fence, result/evidence reconciliation, terminal decision |
| AgentDO | connection epoch, visible queue, dispatch lease/fence, ack visibility |
| Go Termux Agent | filesystem/process/network/Git 등 local OS effect, local precondition recheck, local journal |
| Worker | public adapter와 routing만 |

CaseDO와 AgentDO 사이에 distributed transaction을 가정하지 않는다.

### 10.2 required state sequence

```text
intent durably recorded in CaseDO
-> outbox/dispatch record visible
-> AgentDO accepts with epoch/fence
-> Agent receives
-> Agent acknowledges
-> effect may have started
-> result/evidence received
-> CaseDO validates Attempt/fence/revision/schema/digest
-> verified terminal or explicit unverified/reconciliation
```

network timeout, disconnect, cancellation intent는 no-effect 증거가 아니다.

### 10.3 source layout decision

현재 `edge/agent-do`, `cmd`, `agent` 경로가 없다. Design 0007가 path-local owner와 packaging을 먼저 확정한다. 권고 후보:

```text
edge/agent-do/README.md
edge/agent-do/queue.ts
edge/agent-do/connection.ts
edge/agent-do/fencing.ts
edge/agent-do/index.ts
edge/agent-do/*.test.ts

cmd/tdev-agent/main.go
internal/agent/protocol/
internal/agent/journal/
internal/agent/operations/
internal/agent/runtime/
```

이 경로는 Design 0007 승인 전 영구 계약이 아니다. 기존 Go module/package naming과 install/upgrade owner를 검토한 뒤 확정한다.

### 10.4 first operation: `file.read v1`

`docs/OPERATIONS.md`의 exact contract를 구현한다. 최소 안전 조건:

- explicit granted workspace/project root
- relative canonical path
- absolute path와 `..` escape reject
- symlink/reparse escape fail closed
- exact target/project revision 또는 owner-approved read precondition
- offset/length/max bytes hard bounds
- fatal read errors와 typed not-found/permission errors
- bytes digest와 result digest
- no write/open-for-write
- cancellation check before effect and bounded read loop
- stale attempt/lease/fence result reject
- duplicate dispatch는 local journal/operation identity로 reconcile
- result/evidence schema를 CaseDO가 다시 검증

처음부터 generic shell, arbitrary command, Git push, install, deploy를 추가하지 않는다.

### 10.5 Agent tests

source/emulator tests:

- duplicate dispatch
- stale connection epoch
- stale fence
- disconnect before ack
- disconnect after effect/before result
- cancellation before effect
- cancellation racing valid success
- process SIGKILL and journal reopen
- partial/corrupt journal record
- result schema/digest tamper
- CaseDO idempotent reconciliation

real device tests:

- Android process reclaim
- Termux restart
- phone reboot
- network loss/reconnect
- battery optimization/standby profiles
- CPU, peak RSS, wake frequency, network bytes, battery delta

real device evidence 전에는 always-on Agent, install, recovery 완료를 주장하지 않는다.

## 11. Stage D — public MCP와 current-client qualification

다음은 server source completion과 별도다.

- official final revision `2026-07-28` 재관측
- 실제 사용 SDK revision 지원 확인
- current client request body의 revision/capabilities 관측
- `tools/list` exact order/name/inputSchema/outputSchema snapshot
- `structuredContent`와 readable `content`
- core `resultType: complete | input_required`
- Tasks extension bilateral declaration 시에만 `task`
- internal Task → MCP Task DTO loss mapping
- Resources/elicitation도 current request declaration 시에만 활성
- controlled schema change 후 refresh/republication
- predecessor projection rollback
- write confirmation/action control

public endpoint가 응답했다는 사실만으로 current client refresh를 추정하지 않는다.

## 12. source publication 절차

각 source Task는 다음 순서를 따른다.

1. `remote.branch.read(concept-revision-1)`
2. exact remote commit에서 새 Task-owned worktree 생성
3. authority와 path-local instructions 읽기
4. accepted design과 WORKBOARD pointer 갱신
5. 가장 좁은 vertical slice 구현
6. focused falsifier
7. affected TypeScript/Go tests
8. generated drift
9. portable profile
10. `go vet ./...`
11. `git diff --check`
12. governance/forbidden checks
13. complete effective diff review
14. clean staged tree와 index tree 확인
15. repository-authorized identity로 commit
16. remote를 다시 읽고 exact lease fast-forward push
17. provider branch 독립 read
18. commit ancestry/tree/status 확인
19. checkpoint 작성
20. Task pause/finish와 remaining unknown 기록

`git push` accepted 또는 Job terminal success 하나만으로 remote publication을 완료 처리하지 않는다.

## 13. 완료 계층과 보고 어휘

각 계층을 분리한다.

| 계층 | 현재 | 완료 증거 |
| --- | --- | --- |
| foundation source | verified | remote `2c3c5c14...`, portable green |
| Worker source | incomplete | accepted Design 0006, source tests, remote commit |
| Cloudflare M1 | unverified | isolated real runtime probes |
| public MCP | unverified | authenticated public semantic probes |
| current client | unverified | actual client schema/call observation |
| AgentDO source | incomplete | accepted Design 0007, source tests |
| Go Agent source/package | incomplete | build/package/source tests |
| Android device | unverified | real device kill/reconnect/reboot |
| install/upgrade | unverified | installed release observation |
| rollback/recovery | unverified | predecessor activation + state/public probes |
| cost/energy | unverified | measured profile |

`source-complete`, `runtime-qualified`, `route-published`, `client-qualified`, `agent-qualified`, `installed`, `rollback-verified`를 서로 대체해서 쓰지 않는다.

## 14. 즉시 실패시키는 반증

다음 중 하나가 있으면 해당 slice completion을 거부한다.

- public root가 target manifest에 없음
- outputSchema만 있고 construction/storage/replay contract가 generic JSON
- Edge-only root를 근거 없이 Go에 생성
- production transaction-control SQL 재도입
- Worker가 Case/Task/Attempt 상태를 저장
- AgentDO가 OS effect 성공을 판정
- CaseDO가 network timeout을 no-effect로 해석
- cancellation intent를 terminal cancelled로 강제
- request replay가 current row로 응답을 재구성
- unauthenticated request가 deep owner-specific work를 수행
- non-enumerating privacy가 깨짐
- source green을 live Cloudflare/client/device 완료로 표현
- orphaned worktree 초안을 원격 구현으로 사용
- dirty/stale checkout을 publication source로 사용
- skipped/unsupported를 clean으로 보고
- generic shell 또는 permanent compatibility fallback 도입

## 15. 권고 Root Task 분할

### Task W1 — Worker source

Base: exact current `origin/concept-revision-1`

Objective:

```text
Accept Design 0006; add all executable capability input/result roots,
TypeScript projection/catalog/digest, bounded authenticated Worker ingress,
deterministic routing and all-12 Worker/CaseDO integration; validate, commit,
and exact-lease publish only to concept-revision-1.
```

No live deployment claim.

### Task W2 — Cloudflare M1 qualification

Base: W1 exact remote commit.

Objective: isolated real Cloudflare Worker/CaseDO qualification, metrics, migration, hibernation, rollback gate. Source patch는 qualification에서 발견한 owner-approved defect만 포함한다.

### Task A1 — Agent source

Base: W1 또는 W2에서 owner가 정한 exact commit.

Objective: accept Design 0007; implement AgentDO, Go Agent package, `file.read` source/emulator vertical slice; publish source only.

### Task A2 — real Termux qualification

Base: A1 exact remote commit.

Objective: install/package/device process-kill/reconnect/reboot/cost/battery/recovery qualification.

### Task P1 — public MCP/current-client

Base: Worker runtime-qualified release.

Objective: publish isolated endpoint, qualify MCP revision/Tool snapshot/result/Tasks/Resources/client refresh, record rollback.

이 분할은 다른 계층의 녹색 결과를 추정하지 않도록 한다.

## 16. 다음 구현자의 첫 행동

1. tmcp로 `task_2ba_6d0b642538`, `task_2mg_263eecf72e`, remote `concept-revision-1`을 다시 읽는다.
2. remote가 이 문서에 기록된 SHA보다 전진했으면 이 문서를 diff하고 새 remote를 source of truth로 사용한다.
3. stale checkout과 orphaned worktree를 수정하거나 재사용하지 않는다.
4. exact remote에서 새 Root Task와 unique Task-owned worktree를 만든다.
5. `AGENTS.md`, `RULE.md`, `SDD.md`, `WORKBOARD.md`, owner set, Design 0004/0005를 읽는다.
6. Design 0006를 작성하고 owner coherence를 확인한다.
7. schema/target/fixture slice를 먼저 완료한다.
8. generated capability descriptor/projection을 완료한다.
9. Worker ingress/auth/routing/result를 구현한다.
10. 12 capability integration suite를 완료한다.
11. portable와 complete diff를 통과한다.
12. exact-lease로 `concept-revision-1`에만 push한다.
13. remote provider에서 SHA와 ancestry를 독립 확인한다.
14. Worker source completion과 live unknown을 분리해 보고한다.
15. 그 뒤에만 AgentDO/Go Agent Task를 시작한다.

## 17. 주요 증거 Job

- remote `concept-revision-1` read: `job_2ui_34414471ed`
- clean review status: `job_2uh_32c6154363`
- exact remote portable validation: `job_2sh_2ff69efa48`
- missing `ListOperationsInput`: `job_2si_755145aaec`
- missing `SubmitOperationResult`: `job_2sj_c2d1821e0b`
- only `edge/case-do` present: `job_2sk_1b26c60840`
- missing `cmd` path: `job_2sl_c7ffb1d438`
- no production `BEGIN IMMEDIATE`: `job_2s0_91edfd7b11`
- no production `ROLLBACK`: `job_2s2_414f7d3e54`
- MCP owner explicitly records missing roots: `job_2s6_e2a4054bae`
- Worker successor Task remained uncommitted at base: `job_2t0_510053c8c4`, `job_2tf_4aca77dc84`
- foundation Task context: `job_2t1_21526d7fe3`
- WORKBOARD current gate: `job_2uf_e6e6d1afe3`

## 18. 이 문서의 종료 조건

다음 구현자는 각 accepted design과 WORKBOARD가 현재 gate를 충분히 소유하게 된 후 이 문서를 계속 유지할지 제거할지 별도 diff로 결정한다. 이 문서를 제품 계약이나 completion 증거로 승격하지 않는다. 삭제 또는 대체 시에도 원격 commit history와 Task checkpoint에서 기존 감사 사실을 추적할 수 있어야 한다.
