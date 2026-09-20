# tdev 상세 구현 계획

기준 architecture commit: `23b1ba6048f5cae0381be336911a75bd19716672`
상태: architecture/contract 확정, runtime 미구현

이 문서는 `ARCHITECTURE.md`의 구현 결정을 실제 실행 순서와 acceptance 단위로 모은 보조 문서다. 새로운 authority owner가 아니다. 충돌 시 설계 의미는 `ARCHITECTURE.md`, wire field/type/required/limit는 `contracts/tools.schema.json`, 현재 작업 상태는 `README.md`가 우선한다.

## 0. 구현 전제

- Candidate C — model-led hybrid typed harness를 유지한다.
- ChatGPT가 planner/orchestrator다. 서버는 semantic planner나 command safety classifier가 되지 않는다.
- 공개 MCP surface는 9개 core tool + stable `tdev_capability` gateway 1개, 총 10개로 고정한다.
- extension 설치/제거는 `tools/list`를 바꾸지 않는다. compact summary → lazy `describe` → exact `descriptorDigest`를 핀한 `invoke`가 정상 경로다.
- extension은 grant, mandatory validation PASS, canonical integration authority를 스스로 만들 수 없다.
- arbitrary repository code는 credential-free isolated execution에서 돌린다. explicitly adopted local adapter는 별도 trust transition이며 same-UID arbitrary project shell의 우회로가 아니다.
- Android/Termux native correctness는 hard-link creation을 요구하지 않는다.
- 기존 dev-2/tmcp source는 재사용 가능한 구현과 lesson의 공급원이지 새 branch의 authority가 아니다.
- 단계 1–3의 exactness 경계를 나중 단계로 미루지 않는다.

## 1. 목표 runtime shape

```text
ChatGPT
  -> Cloudflare MCP ingress / human auth / installation route
       -> authenticated outbound device channel
            -> one Termux trusted controller
                 -> SQLite: binding/grant/workspace/operation/executor/capability
                 -> Git object/checkpoint store
                 -> fixed Git/provider integration client
                 -> capability registry + adapter protocol host
                 -> managed executor adapter
                      -> trusted outer runner
                           -> credential-free per-operation OCI container
```

Termux controller가 소유할 것은 control state, Git canonical identity, authorization, adopted capability identity, provider credential custody다. untrusted repository code는 이 UID의 credential/state와 분리한다.

source truth는 immutable Git tree를 가리키는 workspace checkpoint다. workspace의 모델-visible identity는 `(binding, fullRef, baseCommit, tree, revision, state)`로 단순화한다. candidate generation 같은 별도 parallel owner를 만들지 않는다.

operation은 durable admission/실행/결과의 공통 family다. validate operation 자체가 receipt identity이며 integrate operation 자체가 publication intent다. feature별 Task/Case/Drive/Result/Effect owner를 새로 만들지 않는다.

## 2. Stage 1 — contracts + native workspace/capability vertical slice

### 구현

- `contracts/tools.schema.json`을 actual MCP descriptor/handler validation에 연결한다.
- installation DB schema와 migration bootstrap을 만든다.
- `binding`, `grant`, `workspace`, `operation`, `executor`, `capability` table을 최소 필드로 구현한다.
- Git object/tree/commit helper를 구현한다. hooks/filter/credential helper/foreign remote 같은 repository-controlled configuration을 신뢰하지 않는다.
- `tdev_context`, `tdev_read`, `tdev_workspace`, `tdev_patch`, `tdev_observe`를 실제 handler로 구현한다.
- stable `tdev_capability list/describe/invoke` gateway를 구현한다.
- capability adapter protocol v1을 synthetic no-op/echo fixture로 먼저 고정한다.
- extension install/enable/disable은 public capability invoke가 아니라 admin boundary로 구현한다.
- context에는 full descriptor가 아니라 compact authorized capability summary만 넣는다.

### 반드시 확보할 invariant

- request dedup-before-stale-check
- workspace revision single-writer CAS
- grouped patch all-or-nothing immutable publication
- same-file multiple replace는 staged buffer에서 순차 적용
- crash-before/after SQLite pointer publication에서 이전 또는 새 checkpoint 중 하나만 유효
- path/symlink/`.git` control metadata 경계
- capability exact descriptor digest + action schema + namespaced grant
- repository source가 self-register하여 trusted adapter가 될 수 없음
- extension install/disable 전후 public MCP tool names 동일
- hard-link 없이 native core 동작

### 최소 검사

- schema valid/invalid fixtures
- same requestId/same intent replay
- same requestId/different intent mismatch
- stale revision/base
- patch path/mode/type/symlink conflict
- crash point injection around tree/object flush and pointer CAS
- controller restart 후 workspace/operation/capability readback
- descriptor digest mismatch
- unauthorized capability action
- disabled/replaced adapter rejection
- actual ChatGPT host에서 10-tool discovery, two-query read, two-file patch
- synthetic capability install 후 Refresh 없이 `describe -> invoke -> observe`, disable 후 rejection

### 완료 조건

모델이 exact source를 읽고 durable atomic edit를 만들 수 있으며, future capability를 core/public tool-list 변경 없이 붙일 수 있는 실제 vertical slice가 존재한다.

## 3. Stage 2 — generic sandbox process

### 구현

- `tdev_exec_command`와 `tdev_process`를 managed credential-free sandbox에 연결한다.
- command/cwd/env/stdin/tty/network/deadline/yield/capturePaths를 contract대로 구현한다.
- long-running process의 stdout/stderr를 byte cursor로 retained observation 가능하게 한다.
- stdin sequence와 delivery state를 durable하게 기록한다.
- cancel은 intent를 먼저 기록하고 전체 descendant/container termination을 확인한다.
- command 종료 후 eligible filesystem changes를 trusted outer controller가 새 Git checkpoint로 수집한다.
- nonzero exit도 source capture가 안전하면 checkpoint를 남길 수 있게 한다.

### 반드시 확보할 invariant

- candidate container에 controller/Git/provider/device credential 없음
- 다른 workspace/controller filesystem escape 없음
- response loss가 새 command launch를 유발하지 않음
- lost stdin acknowledgement에서 자동 resend 없음
- process terminal proof 전 slot/workspace writer를 재사용하지 않음
- output/log budget과 resource limit 강제
- network preset은 adopted policy만 사용

### 최소 검사

credential sentinel negative test, cross-workspace read/write negative test, launch-response loss, interactive stdin, unknown delivery, SIGTERM/cancel, descendant process cleanup, nonzero edit preservation, output truncation/cursor continuation, provider host loss.

### 완료 조건

ChatGPT가 arbitrary diagnostic/build/test command를 선택할 수 있고 그 자유도가 controller credential boundary를 약화시키지 않는다.

## 4. Stage 3 — mandatory validation + exact integration

### 구현

- workspace revision에서 exact commit을 freeze한다.
- current adopted mandatory validation profiles를 고정한다.
- trusted outer receipt에 exact source/policy/executor/result identity를 묶는다.
- `tdev_validate`는 diagnostic command 성공과 구분되는 authoritative validation operation을 만든다.
- `tdev_integrate`는 named validation이 seal한 **동일 commit**만 publish한다.
- expected-old-head qualified CAS와 provider readback을 구현한다.
- lost publish response는 ref/readback과 retained intent로 reconcile한다.

### 반드시 확보할 invariant

- stale-before/after-validation 거절
- altered tree/policy/receipt 거절
- same validation effect duplicate canonical publication 없음
- integrate가 commit을 다시 생성/compose하지 않음
- candidate stdout의 PASS/exit 0가 trusted receipt를 대체하지 않음

### 최소 live acceptance

Disposable protected ref에서 실제 `context -> read -> workspace -> patch/exec -> validate -> integrate -> readback` 한 경로를 완료한다.

### 성능 측정 시작점

**이 단계 직후** one-file fix, multi-file refactor, search-heavy fix를 실제 workload로 측정한다. architecture 완성 전에 거대한 benchmark framework를 먼저 만들지 않는다.

## 5. Stage 4 — composition + multi-repo/ref/principal + fair capacity

### 구현

- `workspace.compose`로 1–16 exact source workspace checkpoints를 하나의 새 workspace로 합성한다.
- automatic H2 leader/member settlement를 만들지 않는다.
- 동일 ref 병렬 작업은 필요할 때 모델이 explicit compose를 선택한 후 합성 결과를 한 번 mandatory validate한다.
- multiple binding/ref/principal을 하나의 controller/DB/runtime에서 지원한다.
- execution capacity 기본값 8을 실제 active/reserved/uncertain execution에만 적용한다.
- idle repository/workspace는 slot을 차지하지 않는다.
- principal/binding 사이 starvation을 막는 deterministic fair scheduler를 구현한다.

### 최소 검사

- disjoint composition
- overlapping edit conflict
- mode/type/delete/move conflict
- source revision freeze
- compose 중 source 변경 격리
- one final mandatory validation
- capacity 1 및 8
- 한 binding의 burst가 다른 binding을 영구 starvation시키지 않음
- two repos / two refs / multiple principals
- cross-binding handle/credential/grant denial

### 완료 조건

repository 수와 실행 capacity를 혼동하지 않고 여러 ChatGPT 세션/작업이 같은 controller에서 독립적으로 진행 가능하다.

## 6. Stage 5 — reconnect, operations, first real optional capability

### 구현

- Termux restart/network drop 이후 DB/operation/executor reconciliation
- same executor/provider session reattach 가능한 범위 구현
- bounded cache/GC/retention
- disk pressure와 offline/device state의 정확한 오류 분류
- capability adapter disconnect/restart/disable semantics
- actual optional capability adapter 하나를 선택해 install -> describe -> invoke -> observe -> disable 경로를 검증한다.

여기서 선택하는 actual capability는 Blender/JEV/Android를 우선하라는 뜻이 아니다. 구현 시점에 가장 작고 실제적인 adapter를 고른다. 목적은 open extension plane 자체의 현실성을 검증하는 것이다.

### 최소 검사

actual Termux process restart, network loss/reconnect, provider-terminal proof, output replay, unknown stdin, disk full, grant revoke-before-dispatch, device credential != human authority, adapter version/digest replacement, running operation 중 disable/reconcile.

## 7. Stage 6 — release/cutover

### 구현

- 작은 `tdev-admin` operator surface를 만든다.
- binding add/update/remove, grant add/revoke, policy adopt, capability install/enable/disable, release stage/activate/rollback만 둔다.
- 모든 admin mutation은 exact expected current digest/pointer를 요구한다.
- approved release manifest와 active/previous pointer를 구현한다.
- 기존 stable public endpoint와 Access registration은 exact readback 후 안전하게 회수할 수 있으면 회수한다.
- clean-root product에 필요 없는 legacy alias/state migration framework를 만들지 않는다.

### gate

Stage 1–5 acceptance가 통과하기 전에 production cutover를 서두르지 않는다.

### 최소 검사

activated executable digest readback, two-principal OAuth, no active writer at cutover, exact rollback, schema/runtime version separation, capability registry export/import/readback, old/new runtime confusion negative test.

## 8. Stage 7 — production acceptance + cleanup

- stage 3–5 workload를 production path에서 다시 수행한다.
- source/runtime/provider identity를 exact하게 보고한다.
- proven orphan과 transition-only code/resource만 제거한다.
- current README와 실제 runtime/provider 상태를 일치시킨다.
- historical evidence를 current authority처럼 노출하지 않는다.
- cleanup 때문에 correctness/recovery evidence를 삭제하지 않는다.

완료 판정은 “코드가 존재한다”가 아니라 exact end-to-end path, restart/reconnect, multi-repo/principal, capability extension, release/rollback과 실제 성능 자료가 함께 충족될 때 한다.

## 9. Open capability extension protocol — 구현 상세

### Descriptor

Capability는 immutable adopted descriptor로 식별한다.

- `capabilityId`
- `version`
- `descriptorDigest`
- descriptive `role`
- `adapterProtocolVersion`
- actions

각 action은 input/output JSON schema, required namespaced grants와 readOnly/destructive/idempotent/openWorld/asynchronous metadata를 가진다.

role/annotation/description은 모델 선택을 돕는 metadata일 뿐 authority가 아니다. 새로운 role 때문에 core enum/schema를 바꾸지 않도록 role은 open descriptive value로 유지한다.

### Discovery

- `tdev_context`: authorized compact summaries only
- `tdev_capability list`: bounded/paginated summaries
- `tdev_capability describe`: exact immutable descriptor lazy-load
- startup/tools-list에 모든 installed extension schema를 넣지 않는다.

### Invoke

1. human identity/current grant 확인
2. `(installation, subject, requestId)` existing intent lookup
3. same intent replay면 기존 operation 반환
4. exact installed `capabilityId + descriptorDigest + actionId` 확인
5. args를 adopted action input schema로 validate
6. operation intent durable commit
7. adapter dispatch
8. bounded output/artifact publication
9. observe/reconcile

adapter가 반환한 “approved”, score, confidence, PASS text는 authority가 아니다.

### Failure / retry

External capability effect는 exactly-once를 일반적으로 약속하지 않는다. transport loss만으로 재실행하지 않는다. adapter가 exact operation/request identity로 dedup 또는 readback을 제공할 때만 mechanically safe resend를 허용하고, 그렇지 않으면 `uncertain`으로 남겨 모델이 다음 행동을 선택하게 한다.

### Install / trust

Repository bytes는 self-register하여 trusted extension이 될 수 없다. install은 operator/admin effect다. exact package/entrypoint digest, descriptor digest, protocol version, execution boundary, secret references를 고정한다.

같은 Termux UID에서 실행되는 adapter는 controller trust domain 일부라는 사실을 숨기지 않는다. arbitrary/untrusted project code가 local adapter를 가장해 이 경계로 들어오지 못하게 한다.

## 10. Native persistence와 hard-link-free rule

SQLite는 one active controller process, WAL/FULL 기반으로 시작한다. SQL transaction 안에서 network/provider wait를 잡지 않는다.

Git object/checkpoint publication과 native files는 `link(2)` 성공을 correctness 전제로 삼지 않는다. 가능한 경로는:

- Git object store
- temp write + fsync + same-filesystem rename + parent sync
- copy/materialize
- SQLite transaction/CAS

실제 Android에서 hard-link가 되더라도 optimization으로만 사용할 수 있고 correctness/lock/authority primitive로 만들지 않는다.

## 11. Error와 effect certainty

에러는 최소한 다음 의미를 보존한다.

- capability/contract gap
- authentication required
- permission denied
- user confirmation required
- stale/policy/workspace server block
- host/platform safety block
- transport not-sent/delivery-unknown
- resource/quota limit
- implementation invariant failure
- genuinely unknown

모든 mutating path는 가능한 범위에서 `effect:none / committed / uncertain`을 구분하고 retry가 replay인지 new request인지 알려준다. 여러 실패를 “안전검사” 하나로 합치지 않는다.

## 12. Performance/acceptance methodology

새 benchmark service를 만들지 않는다. fixture repos와 작은 workload description, structured logs, 단순 집계 script면 충분하다.

고정할 것:

- starting commit
- task success postcondition
- model/effort
- tool descriptors
- authorization/validation policy
- provider/network class
- cold/warm 여부

측정할 것:

- success/failure
- time-to-first-useful-action
- total wall time
- tool calls
- serialized schema/context/source/input/output bytes
- capability summary/descriptor bytes와 lazy-load 횟수
- duplicate blob/range reads
- process/provider session starts
- Git/provider requests
- validations/retries
- actual parallel executions / held slots
- user interventions

동일 success postcondition이 아닌 과거 수치를 speedup baseline으로 쓰지 않는다. token/billing 데이터가 없으면 byte/duration proxy라고 명시한다.

성능 결정을 할 때는 각 조건을 가능한 한 3회 이상 반복해 개별값과 median/range를 남긴다. correctness smoke는 더 적은 횟수로 가능하다. task success를 희생한 tool-call 감소는 최적화가 아니다.

## 13. 구현 중 피해야 할 구조적 회귀

- AGENTS -> DIRECTIVE -> RULE -> WORKBOARD -> campaign -> Design hierarchy 재생성
- feature마다 새로운 durable owner/state machine 생성
- extension마다 MCP public tool/Worker/daemon/DB 추가
- server-side semantic planner/classifier
- conversation ID를 authority로 사용
- same-UID arbitrary shell을 sandbox라고 주장
- validation과 integrate identity를 느슨하게 연결
- response loss를 새 execution으로 처리
- repository 수를 execution capacity와 동일시
- 미래 예시(Blender/JEV/phone screen 등)를 built-in 우선순위로 오해

## 14. 구현자가 매 단계 시작할 때

1. 현재 `tdev` ref/HEAD/ancestry를 fresh 확인한다.
2. `AGENTS.md`와 `README.md`를 읽는다.
3. 해당 stage와 관련된 `ARCHITECTURE.md` section만 읽는다.
4. wire 변경이면 `contracts/tools.schema.json`의 관련 definition을 읽는다.
5. 사용자 의도나 레퍼런스가 필요할 때만 `IMPLEMENTER_REFERENCE.md`를 읽는다.
6. existing code/evidence로 결론이 나면 불필요한 실험을 만들지 않는다.
7. 실패하면 first-order cause를 localize -> falsify -> repair -> revalidate한다.
8. 수행하지 않은 acceptance를 PASS라고 기록하지 않는다.
9. 하나의 작은 checkpoint가 끝났다는 이유만으로 전체 stage를 자발적으로 중단하지 않는다.

## 15. Stage 1의 즉시 구현 순서

실제 source가 아직 없으므로 다음 순서가 가장 작은 vertical slice다.

1. package/runtime skeleton + deterministic contract loader
2. SQLite bootstrap/schema + single-controller lock
3. binding/grant fixture + auth context adapter interface
4. Git object/checkpoint helpers
5. context/read
6. workspace open + patch + observe
7. request intent/dedup common layer
8. capability registry + descriptor validation
9. synthetic adapter protocol host
10. capability list/describe/invoke
11. admin fixture install/enable/disable
12. crash/restart/path/revision/dedup/capability negative tests
13. staging MCP descriptor advertisement
14. actual ChatGPT host no-refresh capability check
15. README current-work update

여기까지가 Stage 1이다. sandbox process, validation/integration, release framework를 Stage 1에 미리 끌어오지 않는다.
