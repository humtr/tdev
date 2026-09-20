# tdev 구현자 참고 노트

상태: **비규범적(non-normative) 사용자 의도·레퍼런스 노트**

이 문서는 사용자가 차세대 `humtr/tdev` 설계를 요청하면서 반복해서 강조한 목적, 우선순위, 비교 대상, 경계조건과 미래 확장 의도를 구현 모델이 독립적으로 이해할 수 있도록 정리한 참고자료다. 현재 repository의 authority를 대체하지 않는다.

충돌 시 우선순위는 다음이다.

1. 현재 세션의 사용자 지시와 실제 권한 경계
2. repository root의 현재 navigation (`AGENTS.md`)
3. 현재 작업 상태 (`README.md`)
4. 설계 의미 (`ARCHITECTURE.md`)
5. wire field/type/required/limit (`contracts/tools.schema.json`)
6. 상세 실행 보조자료 (`IMPLEMENTATION_PLAN.md`)
7. 이 문서

과거 대화의 commit, branch, provider/runtime 상태는 항상 resume hint일 뿐 current authority가 아니다. 구현을 시작하거나 mutable 사실에 의존하기 전에 현재 repository/runtime/provider owner를 fresh하게 다시 읽는다.

## 1. 최초 요청의 요지

사용자의 최초 목표는 기존 `dev-2` 구현을 계속 고치는 것이 아니라 **차세대 tdev를 처음부터 다시 설계하고 구현 계획까지 완성하는 것**이었다.

핵심 요구는 다음과 같다.

- 현재 `dev-2`, 과거 tdev, `tmcp`, 여러 외부 MCP/development-harness에서 실제로 얻은 기능·실패·장단점·architecture lesson을 종합한다.
- 실제 개발 성능, 총비용 대비 성능, 단순성, 확장성, 운용성을 함께 최적화한다.
- 기존 architecture hierarchy나 관성을 보존하는 것이 목표가 아니다. 필요하면 과감하게 버린다.
- 새로운 설계선은 clean-root `tdev` branch이며 과거 `dev-2`/`main` ancestry와 독립적으로 시작했다. 정확한 current ref/commit은 매 세션 fresh하게 확인한다.
- 이미 존재하는 증거와 구현을 충분히 분석할 수 있다면 불필요한 prototype, 장시간 benchmark, 재현 실험, 복잡한 검증 체계를 먼저 만들지 않는다.
- 설계가 선택되면 계획만 작성하고 멈추는 것이 아니라 구현 모델이 단계적으로 실제 제품에 수렴할 수 있어야 한다.

초기 clean-root commit과 당시 branch 상태는 historical context일 뿐 현재값이 아니다. 구현자는 repository current owners를 다시 bind해야 한다.

## 2. 사용자가 말하는 “좋은 tdev”

사용자는 tdev를 단순한 코드 편집 MCP가 아니라 **ChatGPT의 지능을 최대한 직접 활용하면서, 정확성·권한·실행 경계만 기계적으로 보장하는 개발 harness**로 본다.

최적화 목표는 특정 지표 하나가 아니다.

> 개발 성능 / 총비용

여기서 총비용에는 모델 context, tool 왕복, runtime/compute, provider 비용, engineering complexity, coordination overhead, 실패·재시도·validation 비용, 운영 부담이 모두 들어간다.

따라서 “툴 호출 수가 적다”, “코드가 짧다”, “validation이 많다”, “병렬성이 높다” 같은 하나의 proxy만으로 우월성을 판단하면 안 된다. 실제 task 성공과 exactness를 보존하면서 총비용을 줄여야 한다.

## 3. 모델 지능과 harness의 책임을 섞지 말 것

사용자가 여러 차례 가장 강하게 확인한 원칙이다.

**무엇을 할지 판단하는 주체는 모델이다.**

모델이 결정해야 하는 예:

- 어떤 repository/ref를 볼지
- 어떤 파일·검색어·range를 읽을지
- 어떤 patch를 만들지
- 어떤 command/CLI/tool/capability를 쓸지
- 어떤 순서로 진단하고 수정할지
- 어떤 작업을 병렬화할지
- 언제 workspace를 compose할지
- 추가 테스트가 필요한지
- 외부 advisor/JEV 같은 보조 기능을 쓸지
- 실패 후 다음 행동을 무엇으로 할지

harness가 결정해야 하는 것은 **기계적으로 판정 가능한 경계**다.

예:

- authenticated principal이 누구인지
- 어떤 binding/ref/action grant가 존재하는지
- exact workspace revision/base가 일치하는지
- request가 같은 의도의 replay인지
- installed capability/action/descriptor digest가 exact한지
- sandbox/local/external boundary가 어떤 adopted contract에 속하는지
- mandatory validation receipt가 정확한 commit/policy를 가리키는지
- canonical integration이 expected old head에 대해서만 일어나는지
- 이미 effect가 있었는지/불명인지

**금지 방향:** server-side semantic planner, “이 command가 안전한가/적절한가”를 의미적으로 추론하는 classifier, 별도 agent가 모델 대신 workflow를 정하는 구조.

잘못된 구조:

```text
ChatGPT -> tdev semantic planner -> approve/deny strategy -> executor
```

원하는 구조:

```text
ChatGPT -> primitive 선택/조합 -> tdev mechanical boundary checks -> effect
```

“보안”을 이유로 모델의 개발 전략을 server workflow에 옮기면 제품 목적을 훼손한다.

## 4. repository 개발 관점과 운영 관점을 분리

사용자는 과거 `AGENTS → DIRECTIVE → RULE → WORKBOARD → route-map → campaign → Design`처럼 많은 owner를 거치는 hierarchy가 실제 개발을 방해한다고 지적했다.

새 tdev repository 자체 개발에서는 필요한 최소 owner만 둔다. 현재 clean-root governance가 단순한 이유다.

반면 **운영(runtime/provider/security) 경계까지 없애라는 뜻은 아니다.** 실제 effect가 있는 곳에는 필요한 exact identity, grant, CAS, receipt, readback을 유지해야 한다.

요약하면:

- repository 개발 흐름: 얇고 직접적
- 운영/권한/canonical effect: 정확하고 기계적
- 두 영역의 복잡성을 서로에게 전파하지 않는다.

## 5. 기존 tdev/dev-2에서 반드시 배울 것

기존 구현을 “낡았으니 폐기”하거나 “검증됐으니 그대로 복제”하는 양극단을 피한다.

회수 가치가 큰 lesson:

- exact Git repository/ref/base identity
- immutable candidate/checkpoint
- request dedup-before-stale-check
- 동시 writable state 격리
- trusted outer validation receipt
- 테스트된 exact commit을 재생성하지 않고 integrate
- expected-old-head qualified CAS + provider readback
- human auth / device transport / executor identity 분리
- response loss와 external effect uncertainty를 같은 실행의 observation 문제로 처리

줄여야 할 lesson:

- 너무 많은 durable owner와 lifecycle object
- 일반 coding loop에 release/bootstrap/recovery 의미가 섞이는 것
- 같은 ref 병렬 작업 때문에 validation/rebase가 폭증하는 구조
- 모델이 정상 개발을 시작하기 전에 거대한 authority graph를 읽어야 하는 구조
- 일회성 migration/recovery abstraction이 영구 architecture가 되는 것

과거 `dev-2`의 현재 runtime/provider 상태를 새 branch authority로 가져오지 않는다.

## 6. tmcp에서 배울 것

사용자가 tmcp에서 중요하게 본 것은 **모델이 임의 command를 자유롭게 고르고 typed file/Git primitive와 섞어 쓰는 자율성**이다.

회수 후보:

- generic command autonomy
- bounded stdout/stderr
- long-running process observation/cancellation
- request ID 기반 durable re-observation
- fixed-argv Git/target boundary
- 모델이 다음 진단을 직접 선택하는 얇은 도구 구성

그대로 가져오지 말 것:

- Task/RootTask/registry 중심 workflow가 다시 core가 되는 것
- 필요한 command/permission이 catalog에 없다는 이유로 모델이 admin route, 새 Task, compatibility bridge를 연쇄 탐색하게 만드는 것
- creator Task가 terminal이면 자신이 만든 worktree/resource를 더 이상 정리하지 못하는 lifecycle trap
- stale Task/lease/worktree 하나가 unrelated 개발이나 project rebind까지 전역 차단하는 것
- same-UID shell을 hostile-code sandbox라고 부르는 것
- command 자유도를 얻기 위해 canonical correctness/validation link를 희생하는 것

## 7. 외부 구현은 레퍼런스이지 authority가 아님

구현자는 필요 시 다음 외부 프로젝트를 현재 상태에서 다시 조사할 수 있다. 설계 문서에 pinned evidence가 있으면 먼저 그것을 사용하고, mutable/current behavior가 중요할 때만 fresh하게 확인한다.

- **DevSpace**: workspace/process/session UX, direct model-led lower primitives, local process lifecycle에서 배울 점
- **AgentDock**: typed file/edit/command/session, browser/desktop 확장, adapter 경계에서 배울 점
- **Chat On Steroids (CoS)**: Codex-style read/patch/exec primitive, plugin/MCP 확장, host-shell trust model의 장단점
- **WebGPT**: 매우 얇은 local terminal bridge, 단순성의 장점과 correctness/state 부재의 한계
- **tmcp**: 사용자의 직접 비교 대상
- **dev-2 / historical tdev**: exactness/security/recovery 경계의 주된 evidence

목표는 여러 프로젝트 기능을 합쳐 거대한 “모든 것을 하는 플랫폼”을 만드는 것이 아니다. 실제 개발 성능에 필요한 primitive와 failure-boundary lesson만 회수한다.

## 8. Multi-repository / multi-session 의도

사용자는 서로 다른 ChatGPT 세션이 여러 repository에서 동시에 작업할 수 있어야 한다고 본다.

중요한 해석:

- `executionCapacity = 8` 같은 값은 repository 최대 개수가 아니다.
- idle workspace/repository는 실행 slot을 점유하지 않아야 한다.
- 한 repository가 여러 실행을 쓰더라도 다른 principal/binding이 영구 starvation되지 않도록 fair scheduling이 필요하다.
- repository/ref마다 별도 Worker/daemon/controller를 복제하는 방식은 원하지 않는다.
- ChatGPT conversation/session identity를 **durable operation/workspace authority**로 쓰지 않는다.
- 다만 shared login 보호를 위한 **One-Time Permit의 짧은 session binding**에는 OpenAI transport session metadata를 acceptance 후 사용할 수 있다. 이 값이 바뀌면 Permit 재승인이 필요할 수 있고, 그 UX가 durable identity를 만드는 이유가 되어서는 안 된다.
- workspace label이나 세션 표시 metadata는 UX를 도울 수 있으나 repository/canonical 권한이 아니다.
## 9. Termux, first-release ingress와 authorization에 대한 의도

사용자는 “모든 실행을 무조건 remote container로 보내라”는 요구를 한 것이 아니다. 반대로 “Termux에서 뭐든 직접 shell로 돌리자”도 아니다. 목표는 실제 trust boundary에 따라 local/remote/host capability를 조합하는 것이다.

핵심 실행 구분:

- arbitrary repository-controlled code: controller credential과 분리된 hostile-code execution boundary 필요
- explicitly adopted local capability: 실제 device/Termux/app와 상호작용 가능
- future isolated-local executor: 실제 OS-level isolation을 확보할 수 있으면 추가 가능
- PRoot/cwd/env filtering만으로 hostile-code sandbox라고 주장하지 않음

### first-release MCP ingress

사용자는 외부 OAuth service 가입이나 Termux public inbound URL을 원하지 않는다. 따라서 first release는:

```text
ChatGPT
 -> OpenAI Secure MCP Tunnel
 -> tunnel-client-runtime on Termux
 -> localhost HTTP tdev
```

를 기본으로 한다. OAI Tunnel은 transport일 뿐 tdev durable authority가 아니다. generic transport abstraction이나 Cloudflare Worker/DO/custom WS를 먼저 만들지 않는다. 실제 측정/요구가 생기면 localhost MCP 앞 transport를 나중에 교체할 수 있어야 한다.

현재 Termux에는 ngrok/tmcp-server를 장기 실행하는 `termux-services`/runit/service-daemon 계층이 이미 존재한다. tdev와 tunnel-client도 최종 installer에서 별도 `runsv` service로 설치하고 자체 supervisor를 만들지 않는다.

### Connector Secret

공유 ChatGPT 계정 사용자가 tunnel을 보고 임의 Connector를 새로 등록하는 것을 막기 위해 installation-level bearer **Connector Secret**을 둔다. 이는 OpenAI tunnel runtime API key와 다르다. 틀린 Connector Secret은 tools가 보이지만 실행만 실패하는 것이 아니라 MCP ingress 자체에서 거절하는 것이 목표다.

### account access mode

복잡한 read/editor/admin RBAC는 원하지 않는다. account access는 다음뿐이다.

- `full`: 정상 tdev runtime 사용
- `permit`: 기본 locked; 현재 ChatGPT session이 One-Time Permit을 가져야 runtime 사용
- 미등록 subject: deny

account mapping은 local Termux owner-only env config를 사람이 직접 편집할 수 있어야 한다. remote MCP나 candidate code는 이를 수정하지 못한다.

### One-Time Permit

사용자가 tmcp에서 시험한 OTP/session authorization 방식을 tdev에서는 **One-Time Permit**이라는 제품 용어로 사용한다. literal shared ChatGPT login에서는 account subject만으로 사람을 구분할 수 없으므로, local Termux 사용자가 짧은 Permit을 발급하고 원하는 chat/session에서 입력해야 unlock된다.

회수할 prototype invariant:

- Permit 평문 durable 저장 금지
- atomic single/session claim과 concurrent-race 안전
- subject + session binding
- replay/challenge binding
- expiry와 persistent failed-attempt throttling
- immediate local revoke
- account ceiling보다 높은 권한 생성 금지

OAuth provider를 first release에 추가하지 않는다. 대신 OpenAI Tunnel이 전달하는 subject/session이 실제 account/session identity로 충분히 trustworthy한지 live acceptance한다. 실패하면 조용히 믿거나 OAuth service에 자동 가입하는 대신 identity 설계를 다시 선택한다.

### credential 역할 구분

- OpenAI tunnel runtime key: tunnel-client → OpenAI control plane
- Connector Secret: ChatGPT Connector → tdev installation ingress
- local account policy: subject → `full|permit`
- One-Time Permit: `permit` subject의 특정 session unlock
- provider/Git credentials: canonical integration/executor boundary

candidate sandbox에는 이 credential들을 전달하지 않는다.
## 10. hard-link / Android filesystem 제약

사용자는 Termux에서 `EACCES` hard-link 문제가 어떤 걸림돌인지 물었다.

설계 의도는 **native correctness가 hard-link 생성에 의존하지 않도록 하는 것**이다.

구현 원칙:

- hard-link를 lock/CAS/publication correctness primitive로 사용하지 않는다.
- Git object, SQLite transaction, copy, same-filesystem atomic rename 등으로 구현한다.
- local clone/materialization도 hard-link가 없어도 동작해야 한다.
- 실제 target Android/Termux에서 `link(2)` capability는 stage 1 capability probe로 확인할 수 있지만, 성공 여부가 core correctness의 전제가 되어서는 안 된다.

이 제약은 특히 generic Linux compatibility, 일부 cache/installer/rootfs materialization에 영향을 줄 수 있다. 필요 시 해당 기능을 extension/executor별 capability로 보고한다.

## 11. Blender·Android 화면·Telegram은 “요구 기능 목록”이 아니라 확장성 예시

사용자는 Blender 자체에 현재 관심이 있어서 요구한 것이 아니다. **미래에 어떤 방향으로든 tdev를 확장/adapt할 수 있는가**를 시험하기 위한 예시였다.

같은 의미로 다음 예들도 특정 구현 우선순위가 아니다.

- Blender MCP 또는 Blender CLI
- Termux의 새 CLI
- Android app install/test/ADB
- Android 화면 실시간 관찰
- overlay/상주 companion app
- Telegram 출력/remote control
- browser/desktop automation
- GPU machine/executor
- NAS/artifact store
- 아직 존재하지 않는 미래 API/MCP/tool

제품 요구는 이것들을 지금 built-in으로 만드는 것이 아니라:

> 새 기능이 필요할 때 core를 재설계하거나 public tool list를 계속 늘리지 않고 capability/adapter로 붙일 수 있어야 한다.

## 12. Open capability architecture에 대한 사용자 의도

이 요구는 장기적으로 매우 중요하다.

새 기능을 붙이는 정상 경로는 다음과 같아야 한다.

```text
사용자 요구
  -> 모델이 필요한 capability 판단
  -> adapter/descriptor 구현 또는 기존 extension 채택
  -> 검증
  -> operator/admin install/enable
  -> context summary에서 발견
  -> 필요할 때 describe
  -> 모델이 invoke action/args 선택
```

새 capability 하나 때문에 매번 다음을 요구하면 실패다.

```text
core source 수정 -> public MCP tool 추가 -> Worker redeploy -> ChatGPT Refresh -> 새 workflow owner 추가
```

### 공개 tool 호출 방식 결정

사용자가 명시적으로 **B안, stable capability gateway**를 선택했다.

현재 방향:

- core tools 9개
- extension gateway `tdev_capability` 1개
- total public tool surface 10개
- installed extension이 늘어도 `tools/list`는 안정적으로 유지
- context에는 compact authorized summary
- full descriptor/action schema는 필요할 때 lazy `describe`
- `invoke`는 exact `descriptorDigest`를 pin
- 결과/long-running effect는 기존 operation/observe를 재사용

Dynamic MCP tool-per-extension 방식은 기본 선택이 아니다.

## 13. extension이 가져야 할 자유와 가지면 안 되는 authority

기억하기 좋은 표현:

> **기능은 열려 있고 authority는 닫혀 있다.**

extension이 할 수 있어야 하는 것:

- 새 executor 제공
- 외부 CLI/API/MCP 호출
- device/environment observation
- UI/presenter/notification
- artifact ingress/egress
- advisor/model invocation
- 미래에 생기는 새로운 capability class

extension이 자기 주장만으로 할 수 없어야 하는 것:

- grant 생성/확대
- principal 위조
- mandatory validation PASS 생성
- tested commit이 아닌 것을 integrate
- canonical ref/policy/release authority 획득
- controller global credential store 접근
- repository source가 자기 자신을 trusted plugin으로 등록

role 문자열은 설명용일 뿐 closed enum이나 authority가 아니다. 미래 역할을 추가하기 위해 core schema를 다시 바꾸지 않는 것이 좋다.

## 14. JEV에 대한 의도

JEV도 Blender와 마찬가지로 **지금 넣으라는 요구가 아니다.**

사용자는 미래에:

> “JEV를 이 프로세스의 특정 판단에 써봐”

같은 간단한 요구만으로 쉽게 끼울 수 있는 자유를 원한다.

적합한 위치는 optional advisor extension이다.

가능한 미래 활용:

- 대량 search hit ranking
- log/failure category 후보 정리
- 이미 계산된 여러 diagnostic 중 선택 보조
- patch risk pre-review
- 추가 context가 필요한지 빠른 판단

하지만 JEV의 score/confidence는 proof가 아니다. 권한, stale/CAS, validation PASS, integration, duplicate-effect correctness를 결정하는 authority로 쓰지 않는다.

처음 도입할 때는 shadow mode로 실제 모델 판단과 비용/latency를 비교한 뒤, 유용한 bounded case만 사용하도록 하는 것이 바람직하다. 이는 현재 stage 1–3 core 구현보다 우선하지 않는다.

## 15. Android/실환경 agent 방향도 extension으로 열어둘 것

사용자는 장기 예시로 모델이 폰 화면을 실시간 관찰하고 overlay/companion/Telegram 등으로 결과를 표시하거나 실제 device action을 수행하는 방향을 제시했다.

이 역시 지금 built-in product scope가 아니라 architecture의 미래 적응성을 확인하는 예시다.

따라서 core가 `develop_android_app()` 같은 workflow를 소유하면 안 된다. 미래 extension이 제공할 수 있는 것은 낮은 수준의 primitive다.

예:

- screen/frame observation
- accessibility/UI tree observation
- app launch/install
- typed device action
- overlay/presenter
- logs/artifacts

어떤 것을 언제 조합할지는 모델이 결정한다.

## 16. extension 설치도 장기적으로 모델 주도로 자동화 가능해야 함

사용자의 장기 자유도 요구를 충분히 만족하려면 다음도 가능해야 한다.

> “이 CLI/MCP/API를 앞으로 tdev에서 쓸 수 있게 해.”

그때 ChatGPT가 정상 개발 경로로:

1. 외부 contract 조사
2. adapter/manifest/descriptor 구현
3. disposable 검증
4. extension-specific tests 수행
5. 현재 사용자에게 admin authority가 있으면 install/enable
6. capability readback
7. 원래 작업 계속

할 수 있어야 한다.

이것은 extension이 스스로 설치 authority를 가진다는 의미가 아니다. 모델이 사용자의 현재 권한 범위에서 operator/admin effect를 명시적으로 수행하는 것이다.

## 17. 구현 과정에서 사용자가 원하지 않는 것

다음 패턴은 명확한 경계나 실측 필요가 없는데도 추가하지 않는다.

- 기존 dev-2 governance hierarchy 재생성
- campaign/Design/route-map을 작은 변경마다 추가
- 별도 Codex/agent loop를 core 필수 dependency로 추가
- semantic safety/planning classifier
- `fix_bug`, `develop_app`, `build_feature` 같은 지능 workflow를 durable server operation으로 만들기
- extension마다 public MCP tool 추가
- extension마다 Worker/daemon/DB 추가
- conversation identity를 durable authority로 사용
- generic arbitrary same-UID Termux shell을 security sandbox로 주장
- architecture 선택 전에 대규모 prototype/benchmark를 반복
- 동일 success postcondition이 아닌 benchmark 수치를 speedup 근거로 사용
- validation 수나 tool call 수를 줄이기 위해 correctness를 희생
- clean-root 새 제품에 불필요한 legacy compatibility layer를 추가
- ordinary 개발 command마다 별도 permission/Task/admin contract를 만들기
- stale/uncertain object를 이유로 충돌하지 않는 다른 workspace/binding까지 막기
- resource cleanup을 그 resource를 만든 옛 operation/task의 생존 여부에 종속시키기

## 18. 구현 과정에서 사용자가 원하는 작업 방식

repository를 수정할 때:

- 매 세션 current authority를 fresh하게 bind한다.
- 과거 handoff/대화의 SHA/runtime/provider 값을 그대로 믿지 않는다.
- 필요한 owner만 읽는다. 매번 전체 history/evidence를 재독하지 않는다.
- 기존 source/evidence로 충분한 결론을 낼 수 있으면 새 실험을 만들지 않는다.
- 실험이 필요하면 결정을 바꿀 수 있는 최소 falsification만 한다.
- 실패를 단순 기록하고 넘어가지 말고 first-order cause를 localize → falsify → repair → revalidate한다.
- 한 checkpoint나 한 테스트가 끝났다고 자발적으로 작업을 멈추지 않는다.
- current authority가 허용하는 범위에서는 구현·검증·통합까지 실제로 진행한다.
- 수행하지 않은 test/acceptance를 PASS라고 쓰지 않는다.
- 문서와 실제 source/runtime가 서로 다른 현실을 설명하지 않도록 current state를 갱신한다.
- `full` 또는 Permit-unlocked principal이면 이미 허용된 binding/ref 안의 일상 개발 권한을 harness가 자동 projection하여 모델이 바로 command/patch/validate/integrate를 조합하게 한다.
- special API/device/credential boundary가 아니라면 generic command를 먼저 사용하고, bespoke operation 부재를 capability 부족으로 오판하지 않는다.
- stale lease/process/worktree/operation은 exact scope에서 reconcile하고, unrelated 정상 작업을 계속 진행한다.

## 19. 성능/비용 판단 원칙

사용자의 주요 우려 중 하나는 과거 tdev가 정확성은 높지만 작업량·비용·진행 속도에서 과도하게 무거워지는 것이다.

따라서 구현자는 다음을 계속 확인한다.

- startup context가 불필요하게 커지지 않는가
- 같은 source/blob/schema를 반복 전송하지 않는가
- validation이 불필요하게 반복되지 않는가
- provider session/container startup을 합리적으로 재사용하는가
- 같은 ref 병렬 작업을 explicit compose로 한 번 검증할 수 있는가
- workspace/operation 외에 새로운 durable owner가 정말 필요한가
- extension이 설치되지 않았는데도 schema/context 비용을 만들고 있지 않은가
- 한 repository의 작업이 capacity를 독점하는가
- 실제 task success가 유지되는가

첫 최소 완전 개발 경로(stage 3)가 생긴 직후 실제 workload를 측정한다. 설계 전에 완전한 benchmark framework부터 만들지 않는다.

## 20. 설계 판단이 애매할 때 사용하는 휴리스틱

새 기능/변경을 검토할 때 다음 순서로 생각한다.

1. 이 판단은 모델 지능이 해야 하는가, 기계적으로 검증 가능한 invariant인가?
2. 이미 Git/SQLite/OS/provider/MCP가 소유하는 primitive를 또 다른 durable owner로 복제하고 있지 않은가?
3. 정상 개발 경로의 tool/context/latency를 늘리는가?
4. 이 기능을 core에 넣지 않고 capability extension으로 만들 수 있는가?
5. extension이 authority를 새로 만들고 있지는 않은가?
6. failure/reconnect 시 external effect를 중복시키지 않는가?
7. exact source/result/validation/integration identity를 보존하는가?
8. local execution이라면 controller credential과 untrusted code의 OS boundary가 실제로 존재하는가?
9. 이 ordinary development effect를 generic command/기존 primitive로 할 수 있는데 새 permission object나 workflow를 만들고 있지 않은가?
10. resource creator가 terminal이 되어도 controller가 exact evidence로 reconcile/retire할 수 있는가?
11. stale/uncertain 상태의 block scope가 실제 충돌 resource보다 넓어지고 있지 않은가?
12. 현재 근거로 결정 가능한데 과도한 연구/실험을 추가하고 있지 않은가?
13. 실제 workload에서 성능/비용을 측정할 수 있는가?

대체로 다음 선택을 선호한다.

- 모델 자유도 > server workflow
- mechanical invariant > semantic classifier
- immutable checkpoint > mutable shared checkout
- exact CAS/readback > optimistic assumption
- one reusable operation family > feature별 lifecycle hierarchy
- lazy discovery > startup schema dump
- extension > core 재설계
- 최소한의 충분한 검증 > 의식적인 qualification bureaucracy
- command-first generic execution > command별 server catalog
- bounded authority projection > permission scaffolding
- scoped reconciliation/quarantine > stale global lock

## 21. 현재 특정 예시는 요구사항으로 고정하지 말 것

다음은 **가능성을 검토하기 위해 대화에서 든 예시**다. 별도 사용자 지시가 없다면 우선 구현 대상이라고 해석하지 않는다.

- Blender
- phone screen/overlay
- Telegram
- JEV
- browser/desktop
- local arbitrary executor APK

이 예시들의 공통된 요구만 보존한다.

> tdev는 앞으로 생길 다양한 execution/tool/environment/advisor capability를 적은 작업으로 채택하고 모델이 즉시 활용할 수 있어야 한다.

## 22. 구현자가 시작할 때의 최소 체크리스트

- 현재 `tdev` HEAD와 ancestry를 fresh 확인했는가?
- `AGENTS.md`와 `README.md`를 읽었는가?
- 지금 구현하는 stage와 관련된 `ARCHITECTURE.md` section만 읽었는가?
- wire를 건드리면 `contracts/tools.schema.json`을 함께 읽었는가?
- 세부 단계가 필요하면 `IMPLEMENTATION_PLAN.md`를 읽었는가?
- 설계 의도가 모호할 때만 이 문서를 참고하고 있는가?
- 과거 dev-2/runtime/provider 값을 current authority로 오해하지 않았는가?
- 모델이 해야 할 판단을 server workflow로 옮기지 않았는가?
- 새 기능을 core change보다 extension으로 구현할 수 있는지 검토했는가?
- ordinary command에 필요한 authority가 자동 projection되고 있는가, 아니면 모델이 permission scaffolding을 관리하게 만들고 있는가?
- stale creator/lease/resource가 unrelated 작업을 막지 않고 controller-level reconcile/retire가 가능한가?
- 필요한 검증만 하고, 완료하지 않은 사실을 완료로 기록하지 않았는가?

## 23. 한 문장으로 요약

**tdev는 ChatGPT의 개발 지능을 가로막지 않는 얇고 정확한 harness여야 하며, generic command와 자동 authority projection으로 정상 개발을 직접 수행하게 하고, stale/orphan을 exact scope에서 reconcile하여 unrelated 작업을 멈추지 않으면서, Git·workspace·execution·validation·integration의 필수 correctness만 기계적으로 보존하고 미래의 어떤 tool/environment/executor/advisor도 stable capability gateway를 통해 core 재설계 없이 붙일 수 있어야 한다.**
