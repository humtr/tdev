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
  -> OpenAI Secure MCP Tunnel
       -> tunnel-client-runtime on Termux
            -> localhost Streamable HTTP MCP
                 -> one Termux trusted controller
                      -> ingress auth: Connector Secret
                      -> account access: subject -> full | permit | deny
                      -> permit account: session-bound One-Time Permit
                      -> SQLite: binding/grant/workspace/operation/executor/capability
                      -> Git object/checkpoint store
                      -> fixed Git/provider integration client
                      -> capability registry + adapter protocol host
                      -> managed executor adapter
                           -> trusted outer runner
                                -> credential-free per-operation OCI container
```

first release는 Cloudflare Worker/DO/custom WebSocket/external OAuth provider를 필수 dependency로 두지 않는다. OAI Tunnel은 replaceable ingress이고 durable work/authorization authority가 아니다. localhost HTTP MCP 경계를 유지하되 generic transport framework를 만들지 않는다.

Termux controller가 소유할 것은 control state, Git canonical identity, repository/capability grants, One-Time Permit grant, adopted capability identity와 provider credential custody다. subject별 `full|permit` access ceiling은 owner-only local env config가 소유하고 remote MCP가 수정하지 못한다. untrusted repository code는 controller UID의 credentials/state와 분리한다.

source truth는 immutable Git tree를 가리키는 workspace checkpoint다. operation은 durable admission/실행/결과의 공통 family이며 validate 자체가 receipt, integrate 자체가 publication intent다.
## 2. Stage 1 — contracts + local HTTP/auth + native workspace/capability vertical slice

### 구현

- `contracts/tools.schema.json`의 exact 10 tools를 actual MCP descriptor/handler validation에 연결한다.
- localhost Streamable HTTP MCP server를 구현한다.
- Connector Secret bearer 검증을 initialize/tools/list/tools/call보다 앞에 둔다. secret 원문은 owner-only file에만 둔다.
- OpenAI tunnel transport metadata에서 subject/session을 bounded하게 읽는 auth adapter를 만든다. metadata가 없거나 malformed면 fail closed한다.
- owner-only access env config를 parse해 subject digest별 `full|permit`, unknown=deny ceiling을 적용한다. config reload는 validate-then-swap한다.
- One-Time Permit issue/claim/revoke를 최소 local-only operator command로 구현한다. grant는 SQLite 기존 `grant` family에 넣고 digest-only, subject+session binding, idle+absolute expiry, persistent failed-attempt throttle을 강제한다.
- Permit input은 core tool semantics와 분리한다. MCP form elicitation을 우선 사용하고 host 미지원 시 tool 이름/효과를 바꾸지 않는 bounded auth-input decoration을 사용해 handler 전에 제거한다.
- installation DB schema/migration bootstrap과 `binding`, `grant`, `workspace`, `operation`, `executor`, `capability` table을 구현한다.
- Git object/tree/commit helper와 `tdev_context/read/workspace/patch/observe`, stable `tdev_capability list/describe/invoke`를 구현한다.
- capability adapter protocol v1을 synthetic no-op/echo fixture로 먼저 고정한다.
- OAI `tunnel-client-runtime`은 installer 없이 explicit dev/manual command로 localhost MCP에 붙여 실제 host acceptance를 수행한다.

### 반드시 확보할 invariant

- wrong Connector Secret은 MCP surface 이전에 거절
- subject access ceiling: full / permit / unknown=deny
- Permit이 account ceiling을 절대 확대하지 않음
- Permit 평문 durable 저장 금지, atomic single/session claim, 다른 subject/session replay 거절
- policy downgrade/revoke는 다음 admission에서 existing Permit보다 우선
- request dedup-before-stale-check
- workspace revision single-writer CAS
- grouped patch all-or-nothing immutable publication
- path/symlink/`.git` control metadata 경계
- capability exact descriptor digest + action schema + namespaced grant
- extension install/disable 전후 public MCP tool names 동일
- hard-link 없이 native core 동작

### 최소 검사

- bad/good Connector Secret
- unknown/full/permit subjects
- same shared subject의 session A/B에서 A Permit claim 후 A만 unlock
- Permit expiry/revoke/replay/concurrent claim/persistent rate limit
- policy `full→permit`, `permit→deny` 즉시 반영
- actual ChatGPT/OAI Tunnel에서 subject/session 분리·reconnect·spoof resistance
- form elicitation 또는 bounded fallback
- schema fixtures, same request replay/mismatch, stale revision/base, patch conflict/crash-point
- controller restart 후 workspace/operation/capability/Permit readback
- capability descriptor mismatch/unauthorized/disabled rejection
- actual ChatGPT 10-tool discovery, two-query read, two-file patch
- synthetic capability install 후 Refresh 없이 `describe -> invoke -> observe`

### 완료 조건

public Termux endpoint나 외부 OAuth provider 없이 실제 ChatGPT가 OAI Tunnel을 통해 private tdev MCP를 발견하고, account/session authorization을 거쳐 exact source를 읽고 durable atomic edit를 만들 수 있다. subject/session acceptance가 실패하면 account-specific production authorization은 완료로 판정하지 않는다.
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

Disposable protected ref에서 실제 `ChatGPT -> OAI Tunnel -> localhost tdev -> context -> read -> workspace -> patch/exec -> validate -> integrate -> readback` 한 경로를 완료한다. 개인 `full` subject와 shared `permit` subject의 서로 다른 chat session을 함께 검증한다.

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
- OAI tunnel-client process/control-plane reconnect와 tdev operation lifetime을 분리
- Permit expiry/revoke/policy reload/restart recovery
- same executor/provider session reattach 가능한 범위 구현
- bounded cache/GC/retention
- disk pressure와 offline/device state의 정확한 오류 분류
- capability adapter disconnect/restart/disable semantics
- actual optional capability adapter 하나를 install -> describe -> invoke -> observe -> disable

### 최소 검사

actual Termux process restart, tunnel-client restart/network loss/reconnect, transport disconnect 중 admitted operation 생존, output replay, unknown stdin, disk full, account policy/Permit revoke-before-new-admission, Connector Secret rotation, provider-terminal proof, adapter version/digest replacement, running operation 중 disable/reconcile.
## 7. Stage 6 — release/install/cutover

### 구현

- 작은 `tdev-admin` operator surface를 만든다.
- binding/grant/policy/capability/release 관리와 account policy inspection, Permit issue/list/revoke를 local operator boundary에 둔다.
- approved release manifest와 active/previous pointer를 구현한다.
- `install.sh`가 verified release, owner-only config/secrets, existing `termux-services` dependency를 검사하고 두 service definition을 설치한다:
  - `$PREFIX/var/service/tdev`
  - `$PREFIX/var/service/tdev-oai-tunnel`
- 두 service는 `runsv -> exec` one-process ownership과 `svlogger`를 사용한다. tdev가 tunnel-client를 child로, tunnel-client가 tdev를 child로 관리하지 않는다.
- default install은 tdev local readiness 후 tunnel readiness를 확인하고, `--no-start`와 read-only `--check`를 제공한다.
- OpenAI tunnel runtime key, Connector Secret, authz env는 owner-only file로 설치하고 argv/repo/log에 원문을 두지 않는다.
- 기존 Cloudflare public endpoint/Access/DO는 새 production path acceptance와 rollback 준비 뒤 unused가 증명될 때만 retire 후보로 둔다.
- clean-root product에 generic transport/provider framework나 legacy migration hierarchy를 만들지 않는다.

### gate

Stage 1–5 acceptance가 통과하기 전에 production cutover를 서두르지 않는다.

### 최소 검사

activated executable/tunnel-client digest readback, runit exact process ownership, tdev health + tunnel ready/control-plane poll health, secret/config owner/mode, two subjects(`full`, `permit`)과 shared-chat session isolation, Connector Secret rotation, no active writer at cutover, exact rollback, schema/runtime version separation, capability registry export/import/readback, old/new runtime confusion negative test.
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
