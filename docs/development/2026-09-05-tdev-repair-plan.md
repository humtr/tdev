# tdev 상세 수리 계획 — 2026-09-05 제안

> 문서 종류: 원점 감사에서 도출한 날짜 한정 implementation proposal. accepted Design, current router 또는 normative product contract가 아니다. 이 파일을 저장·푸시하는 것은 아래 수리의 구현, Design acceptance, runtime 변경 또는 qualification 완료를 의미하지 않는다.

- 원점: [독립 감사](../history/2026-09-05-tdev-origin-reassessment.md)
- 사실 근거: [관측 evidence](../evidence/group-f-origin-reassessment-readonly-audit-2026-09-05.json)
- 변경 분류 owner: [SDD](../../SDD.md)
- routing owner: [WORKBOARD](../../WORKBOARD.md)
- 실행/publication owner: [WORKFLOW](WORKFLOW.md)
- verification owner: [QUALIFICATION](../QUALIFICATION.md)

이 제안의 첫 사용자 기능 체크포인트는 **작은 scoped context로 실제 MCP → Agent → disposable candidate → validation 경로가 한 번 성공하는 것**이다. 내부 준비 단계를 별도의 사용자 완료로 보고하지 않는다. 이후 full-repository lazy 경로와 의도적인 full-context stress를 구분해 검증한다. tmcp 비교는 tdev 단일 경로 이후다.

## 1. 목표와 경계

ChatGPT가 개발 의도를 MCP로 제출하면 tdev의 Case가 immutable Plan/Attempt를 소유하고, 로컬 Termux Agent가 exact-base clone에서 개발 결과를 생성·검증한다. Codex는 release-bound 실행 구성요소다. 반환물은 inspectable ChangeSet/candidate/validation이며 실제 canonical tree 변경과 Git publication은 별도 owner/gate를 따른다.

단일 사용자 trusted-local M0에서 bwrap/커널 sandbox는 사용하지 않는다. disposable clone은 hostile code 격리를 보장하는 sandbox가 아니다. 실제 OS 효과와 cleanup은 로컬 Agent/warden이 관측하고, 인증·lease·Case head가 그 관측을 대신하지 않는다. hostile-local-code 및 multi-tenant 격리 지원은 제안 범위 밖이다.

| 사실/행위 | 기존 책임 경계 | 수리 중 지킬 조건 |
| --- | --- | --- |
| MCP principal와 Case 접근 허가 | D0023/D0024 ingress | 인증이 Task 실행 capability를 대신하지 않음 |
| Plan, readiness, Task/Attempt, accepted result, terminal outcome | D0019/CaseEngine | readiness와 lifecycle의 새 cache owner를 만들지 않음 |
| durable 진행 의도/cursor | D0042 drive | 매 action 전에 기존 Case/Agent owner를 다시 읽음 |
| 연결 epoch, reservation, delivery, aggregate capacity | D0020/D0027 | timeout이나 process 추정으로 capacity를 발명하지 않음 |
| immutable repository bytes와 context retrieval | repository/context owner | 전체 base identity와 조회 범위를 별도 binding으로 유지 |
| 실제 process, filesystem, cancellation, cleanup | 로컬 Agent/warden | 정확한 process handle과 양성 cleanup evidence 필요 |
| derived candidate와 검증 실행 | 로컬 candidate/operation 경계 | ChangeSet 외 직접 canonical 변경 금지; validator 고정 |
| canonical semantic 반영과 Git projection/publication | Promotion, D0025 및 기존 Git owner | CP1에 canonical checkout/ref/push capability를 연결하지 않음 |

parallel semantics, immutable PlanRevision, Task당 최대 하나의 nonterminal Attempt, 결과 순서와 capacity에 무관한 Promotion은 보존한다. CP1의 capacity 1은 parallel 모델의 정상적인 축소 사례다.

## 2. 첫 실행 전 authority와 local debt 정리

감사의 bound base는 `development@d2a1573b2c71e2f50e1656fca9c36a82a827d0aa`였고 로컬 `9f1bca3cf01f56b0229ab41bf18cc7cb1d60a294`가 72커밋 앞섰다. 이 숫자/identity는 역사적 기준점이며 새 실행의 base를 고르지 않는다.

수리 시작 시 수행할 일:

1. published refs를 다시 열거하고 AGENTS resolver로 exact ref@sha를 바인딩한다. RULE → SDD → WORKBOARD를 다시 확인한다.
2. main checkout, isolated candidate, remote의 ancestry와 dirty 상태를 각각 읽는다. 이 문서 publication으로 생긴 별도 후손도 보존한다.
3. 로컬 72커밋 전체 effective diff를 owner별로 검토한다. local r3 문구나 기존 PASS를 일괄 승인·발행하지 않는다.
4. 재사용할 source correction과 역사 evidence, 수정이 필요한 의미, 관련 없는 상태를 식별한다. 코드의 재사용은 exact diff 및 qualification으로 판단한다.
5. published base에서 isolated worktree로 작업한다. 원래 checkout의 미추적 파일, package, credential, worktree, 서비스는 보존한다.
6. 각 작은 commit/publication gate에서 exact base부터의 complete effective diff를 검토하고 실제 remote predecessor/ancestry를 다시 확인한다.

종료 조건은 소스 계보와 current owner가 명확해지고 기존 상태가 보존되는 것이다. Git 정리는 제품 개발 경로의 성공이 아니다.

## 3. 필요한 Design 및 owner 결정

| 수리 결정 | SDD 분류 | 영향을 검토할 owner | 구현 전 산출물 |
| --- | --- | --- | --- |
| full-context 기본값을 lazy context/reference로 변경 | Class 2 신규 coherent decision | SPEC, ARCHITECTURE, PROTOCOL, OPERATIONS, SECURITY; D0013/D0014/D0017 영향 | explicit identity, scope, read protocol, bounds, compatibility, falsifier |
| Case의 base/root/byte materialization 변경 | Class 2 해당 범위, 의미 불변의 내부 최적화는 Class 1 가능 | D0010/D0019, PROTOCOL, DEPLOYMENT, QUALIFICATION | 유지되는 digest 의미, trusted byte/root binding, load/command admission, migration barrier |
| no-kernel-sandbox profile와 warden 실행/candidate 수명 연결 | Class 2 경계 변경; unchanged contract의 국소 결함은 Class 1 | D0043 및 D0027 관련 OPERATIONS, SECURITY, DEPLOYMENT | fixed executable/argv, launch identity, cleanup receipt, package activation 조건 |
| 원격 오류 및 receipt 관측 | 기존 의미 내 오류 보존은 Class 1; wire schema/노출 변화는 Class 2 | D0019/D0042/D0023/D0046 | bounded redacted envelope와 commit/unknown 분류 |
| M1 actual candidate preflight 및 CP1/CP2/stress 분리 | Class 2 acceptance 정정 | D0046, QUALIFICATION, PROGRAM, WORKBOARD | 실제 functional exit, exact source/provider/client join |
| 공개 read/list/search tool 추가가 필요한 경우 | Class 2 | D0023, MCP, SECURITY | versioned surface/schema 및 권한/오류 의미 |

Design ID는 구현 시작 시 registry와 published route를 다시 확인해 배정한다. 기존 Design과 같은 문제/owner family의 정정은 다음 revision으로, 독립적인 identity/storage 결정은 새 Design으로 기록한다. 이 계획의 행을 accepted Design으로 취급하지 않는다.

D0043의 공개 r2와 로컬 r3를 먼저 비교한다. local r3를 같은 번호의 다른 의미로 덮어쓰거나 과거 acceptance를 새 의미의 증거로 바꾸지 않는다. D0046의 공개 r1과 로컬 r2/r3도 같은 원칙으로 정리한다. D0039의 독립 물리/custody gate를 CP1의 새 선행조건으로 무조건 확대하지 않는다. 실제로 공유하는 route/package 안전 조건만 적용한다.

accepted correction과 affected normative owner를 정리한 다음 source를 변경한다. downstream falsifier가 도달한 범위는 reopened/revalidation/block/supersession 관계를 정확히 기록한다. 새 Design 작성과 owner 정합은 수리 실행 중 수행할 작업이며 모호한 문서 해석 때문에 소단위 승인 루프를 만들지 않는다.

## 4. Lazy repository context의 상세 제안

### 4.1 먼저 고정할 identity

다음 서로 다른 값을 하나의 digest나 permission으로 합치지 않는다.

| 값 | 제안 의미 |
| --- | --- |
| repository identity / object format / exact commit OID / Git tree OID | mutable worktree와 분리된 전체 immutable Git snapshot binding |
| base digest와 digest profile | Case/Plan이 승인한 semantic base 의미; 기존 알고리즘을 다른 의미로 재사용하지 않음 |
| manifest digest | 정렬된 path, mode/type, blob identity, size 및 전체 entry 범위의 binding |
| context scope digest | 해당 조회/모델 disclosure에 허용한 범위와 예산; base identity를 다시 정의하지 않음 |
| Task write permission/claims | 변경 가능한 경로·행위; 파일을 읽었다는 사실이나 scope reference 소유로 생기지 않음 |
| candidate digest | exact base와 검증된 result로부터 만든 candidate의 identity |

1GB 대상에서 immutable metadata/manifest를 먼저 확인한다. manifest 자체도 커질 수 있으므로 bounded page, stable cursor, whole-manifest root를 설계한다. 전체 contents의 eager decoding, complete JSON allocation 또는 per-request full hashing을 metadata 준비와 결합하지 않는다.

기존 text-tree base digest가 전체 bytes의 계산을 요구한다면 exact-base admission에서 수행할 streaming 검증/재사용 증거와 hot path의 bounded read를 구분한다. 그것을 회피하기 위해 Git OID나 subset digest를 기존 baseDigest 자리에 넣지 않는다. 기존 표현으로 만족할 수 없다면 새 profile 및 compatibility 규칙을 accepted Design에서 먼저 정한다.

binary, executable mode, symlink, submodule 등 entry 종류는 manifest에서 사라지면 안 된다. CP1이 regular UTF-8 text 변경만 지원하더라도 다른 entry의 전체 base identity와 보존 의미를 명시한다. 지원되지 않는 수정은 typed denial이다. `contextExcludedPaths`에 임의 경로를 추가해 baseDigest를 맞추는 방식은 사용하지 않는다.

### 4.2 Bounded list/search/read

제안하는 내부 capability는 다음 typed operation이다. 이 표는 아직 public API나 허용된 operation catalog가 아니다.

| 동작 | 필수 binding/입력 | 제한·결과 |
| --- | --- | --- |
| manifest/list | context handle, exact manifest root, 허용 prefix, cursor | page entry/byte 한도, stable next cursor, truncation 명시 |
| search | 같은 handle/scope, bounded pattern/path selection | visited file/byte/result 한도; timeout은 stop guard; 불완전 검색을 완전 검색으로 표시하지 않음 |
| read | manifest 안의 정확한 entry 및 line/byte range | path traversal/no-follow 정책, blob identity, encoding, byte 한도, EOF/truncation 구분 |

caller가 local repository path, executable, shell command, environment, provider URL, credential 또는 scope 확대를 선택하지 못하게 한다. content는 exact commit의 Git plumbing 또는 검증된 immutable bytes에서 가져온다. mutable index/worktree와 untracked 파일은 context의 원천이 아니다.

scope 밖 자료가 필요하면 owner가 정한 범위 내 별도 bounded read 또는 명시적 scope 변경 절차를 사용한다. silently widening, partial-context success, full-inline fallback은 허용하지 않는다. 취소·오류·missing/corrupt/stale reference는 typed result로 보존한다.

### 4.3 Case와 provider hot path

Case는 Plan/Attempt/result/head 및 승인한 base/root/reference를 소유한다. immutable bytes의 위치/전송이 Case head의 두 번째 owner가 되지 않도록 binding한다. Worker ingress와 drive에는 repository full-tree payload를 넣지 않고 필요한 compact identity 및 bounded projection을 전달한다.

조사할 구현 범위는 `src/mcp-development-adapter.mjs`, `src/development-unit.mjs`, repository model transport, selected-context delivery, Case/semantic restore 및 local candidate materialization이다. 로컬 이력의 `src/mcp-trial-composition.mjs`, `src/mcp-trial-runner.mjs`, `qualification/mcp-trial-base-tree-builder.mjs`도 재사용 시 검토한다. 뒤의 파일들은 이 문서의 published base에 모두 존재하는 파일이라고 가정하지 않는다.

정상 read/command에 full hydration/scrub을 반복하지 않는 경로를 설계하되, corruption rejection을 단순히 제거하지 않는다. lazy object read가 현재 root와 일치한다는 검증, byte accounting의 transactional 갱신/재구축 규칙, cold reopen을 별도로 증명한다. 새로운 authoritative counter나 외부 byte owner가 필요해지면 먼저 Class 2로 정한다.

## 5. 502 원인 관측의 최소 수리

1. exact request/Case/drive/Attempt/provider version을 binding한 redacted operation trace를 준비한다. token, prompt 내용, repository content, secret path 또는 raw remote stack은 public result에 넣지 않는다.
2. Case/drive RPC 경계 안에서 known error code를 bounded envelope로 보존한다. cross-DO prototype identity에 기대지 않는다. 비정형 예외에는 opaque correlation ID와 제한된 fault classification을 부여한다.
3. initialize/command dispatch 전, owner commit/receipt, 응답 반환 경계를 구분한다. 무응답을 not_applied로 바꾸지 않는다.
4. 기존 failing Case는 가능한 가장 작은 owner read로 조사한다. retained request ID/body가 없거나 commit이 unknown이면 새 Case를 만들어 원래 결과를 덮지 않는다.
5. 원래 사건의 충분한 trace가 남아 있지 않으면 그 사건의 exact cause는 unknown으로 보존한다. 수리된 코드의 새 isolated bounded reproduction은 별도 사건으로 기록한다.
6. 같은 source/operation에서 작은 fixture와 큰 base의 byte/operation count 및 CPU/wall observations를 구분한다. 크기 상관만으로 CPU 초과를 선언하지 않는다.

성공 판정은 내부 원인의 관측 가능성, same-request receipt reconciliation, duplicate dispatch 없음이다. 진단 기능이 새 Case/readiness owner나 범용 credential/dispatcher service로 확장되면 안 된다.

## 6. Termux 실행 및 warden cleanup

### 6.1 Release-bound CLI profile

- 실제 installed Codex/npm executable identity와 버전, release-owned output schema, literal argv, model/reasoning 선택을 기록한다.
- no-kernel-sandbox 설정을 명시하고 해당 Termux executable에서 실제 의미를 확인한다. sandbox 인자 생략과 `sandboxMode: none` 상수 출력만으로 증명하지 않는다.
- `--ephemeral`, JSONL, output schema, trusted-local saved CLI authentication 경계를 유지한다. auth bytes를 tdev/Case/MCP/evidence에 복사하지 않는다.
- CLI 자체의 bootstrap/sandbox/로그인/버전 실패는 provider-CLI lane으로 분류한다. Case/drive/Agent 문제와 같은 원인으로 묶지 않는다.
- 한 Attempt에 한 outer model launch만 허용한다. CLI 내부 provider retry/usage는 직접 관측된 범위만 기록한다.

### 6.2 Disposable workspace와 process 소유

exact-base clone은 canonical checkout과 독립적으로 만든다. hardlink/shared mutable worktree를 결과 경계로 사용하지 않는다. 전체 clone에 드는 디스크/I/O 비용은 context byte 측정과 별도로 남긴다.

모델은 결과 전용 ChangeSet을 반환한다. clone mutation, unsafe path, base mismatch, malformed/multiple terminal output은 거부한다. post-run Git status는 canonical/ref invariance 및 process cleanup을 대신하지 않는다.

warden에 실제 model/validation process와 descendant lifetime을 연결한다. 실행·취소·정상 exit·timeout·control crash를 same operation identity로 다룬다. “completion Promise가 끝남”, SIGKILL 시도, child stdout close 또는 adapter의 true 반환만으로 cleanup을 확정하지 않는다.

실행 결과와 cleanup 상태는 독립적이다. 모델 실패 후 process가 남으면 cleanup held/unknown을 유지하고 capacity/claim 재사용을 금지한다. controller 소실 후에도 warden이 기존 handle/resource를 확인할 수 있어야 한다. source adapter가 직접 cleanup 성공을 만들어 반환하는 우회를 제거한다.

### 6.3 Candidate 수명

candidate는 exact base + accepted ChangeSet으로 disposable 공간에 materialize한다. lifecycle은 생성, validation, bounded inspection/export, terminal cleanup, restart reconciliation을 포함한다. workspace 경로/handle의 소유와 durable binding을 정해 memory Map 소실이 존재하지 않는 candidate를 가장하지 않게 한다.

candidate를 삭제하기 전에 사용자에게 필요한 bounded diff/result를 기존 result/artifact owner 아래 보존한다. path별 old/new identity, candidate digest 및 validation join을 유지한다. cleanup이 불명확하면 artifact 성공과 resource 재사용 가능을 구분한다.

## 7. Validation의 독립성

validation은 release-owned profile로 정한 executable/argv와 명시적 environment에서 candidate를 검증한다. Task/MCP의 command string을 실행하지 않는다. `npm run check` 문자열 고정만으로는 model이 package scripts나 validator 자체를 바꾸는 문제를 막지 못한다.

구현할 admission/check:

1. exact base에서 검증할 package scripts, lock/config 및 validator identity를 고정한다.
2. 모델 변경이 그 boundary를 건드리는지 검사한다. CP1은 해당 경로 변경을 허용하지 않는 명시적 Task 계약으로 한정한다. 이후 validator 변경 과제는 별도 검증 의미를 갖는다.
3. validation 시작 시 candidate identity를 다시 검증한다. 입력 candidate와 반환 validation receipt를 join한다.
4. validation 후 허용된 generated output과 source mutation을 구분한다. source tree가 바뀌었으면 다른 candidate의 성공으로 처리하지 않는다.
5. `passed: false`를 정상적인 validation 실패 결과로 유지한다. false/timeout/unknown은 Promotion 또는 terminal success가 아니다.
6. 검사에 필요한 dependencies/bootstrap을 고정한다. network-none profile의 의존성을 임의 online install로 보충하지 않는다.

## 8. 구현 순서와 내부 acceptance

| 내부 작업 | 구현 범위 | cheapest falsifier / 종료 조건 |
| --- | --- | --- |
| A. Authority/local reconciliation | docs, selected source diff, exact worktree/publication lane | unrelated 상태 보존; approved 의미와 exact source 일치 |
| B. Design/owner correction | 위 Section 3의 실제 영향 범위 | 하나의 현재 의미, 명시적 identity/permission/compatibility; rejected alternative 보존 |
| C. Error/receipt observation | RPC adapters 및 scoped qualification | cross-DO 오류 code 보존, ambiguous commit/response loss의 same-request reconciliation |
| D. Lazy context primitive | repository descriptor/manifest, bounded read/list/search, adapter | wrong base/scope/path/encoding/limit은 zero-effect denial; full-context fallback 없음 |
| E. Compact Case/provider composition | Case/drive/ingress/root integration | 작은 명령이 full repository content를 요구하지 않음; Case authority와 deterministic 결과 유지 |
| F. Warden/candidate/validator | local Agent, runtime, supervisor, release/package | actual process cleanup, candidate lifecycle, validator binding이 성공/실패/취소에서 유지 |
| G. Package와 provider preflight | exact artifact build, quiescence, admitted trial forward update | source/package/provider/profile 일치; 실제 machine candidate preflight까지 완료 |
| H. 실제 ChatGPT 작업 | 기존 MCP 명령과 bounded result projection | CP1의 동일 Case를 terminal validated candidate로 관측 |

내부 A–H는 구현 단위이며 사용자 완료 체크포인트가 아니다. 작은 commit, tests, package, upload, metadata, tools/list가 통과하면 다음 필요한 작업을 계속한다. 사용자 연결/인증 동작이 필요한 경우 exact preflight와 URL을 완성한 후 최소한의 실제 클라이언트 동작만 요청한다. 세션에 trial 도구가 없다는 사실을 service 고장이나 client PASS로 바꾸지 않는다.

## 9. 기능 체크포인트와 성공 판정

### CP1 — 작은 scoped context의 실제 MCP 개발

선행조건은 corrected accepted Design/owner, exact published source/release, 현재 provider/Agent binding 및 Section 8의 안전 바닥이다. 전체 repository에서 임의 파일을 빼서 작은 base를 만들지 않는다. 명시적 조회 scope와 별도 쓰기 권한을 whole-base identity에 결합한다.

첫 과제 후보는 UTF-8 instruction byte-limit 경계 수리다. 감사의 in-memory probe는 65,538 UTF-8 bytes의 입력이 resolver에 도달함을 보여 주었다. responsible input owner에서 64 KiB 바이트 의미를 확인/명시한 뒤, `src/mcp-development-adapter.mjs`와 관련 source/test의 작은 범위를 대상으로 실제 모델이 수정하게 한다. MCP ingress와 adapter 사이의 limit 해석 차이도 함께 검사한다. 경계 바로 아래/정확히 경계/바로 위, 멀티바이트 입력, 거부 전 owner lookup 0회가 객관적 regression이다. 계약이 다르면 그 사실을 기록하고 같은 크기의 실제 owner-backed 결함을 선택한다.

PASS 조건:

- 실제 authenticated ChatGPT MCP 요청이 one exact Case/drive/Attempt에 연결된다.
- 로컬 Agent가 small scoped reads 후 실제 model 실행으로 non-documentation ChangeSet을 만든다. canned output, no-op, out-of-band edit, tmcp result import가 아니다.
- tdev가 disposable candidate를 만들고 objective regression 및 고정 validation을 통과시킨다.
- base/request/Case/Attempt/Agent route/release/provider version/candidate/validation identity가 모두 join된다.
- ChatGPT가 같은 Case의 terminal projection과 inspectable diff를 확인한다.
- canonical checkout/index/ref, 비관련 파일·Case·credential은 unchanged이며 Git publication이 없다.
- warden의 positive process cleanup, candidate cleanup/retention reconciliation, capacity release가 확인된다.
- required negative probes의 false/unknown이 success로 바뀌지 않고 duplicate model launch가 없다.

### CP2 — full-repository lazy 경로

CP1 성공 corpus를 고정한 뒤 전체 tdev repository를 대상으로 같은 경로를 검증한다. scoped view를 full-repository base로 가장하지 않는다. binary/mode 포함 전체 manifest identity를 유지하고 실제 과제에 필요한 파일만 읽는다.

cold/warm preparation과 Case/drive 재구성에서 동일 base, ChangeSet 및 candidate 의미가 유지되어야 한다. 읽지 않은 파일이 바뀌는 다른 exact base를 주면 old reference가 거부되어야 한다. 한두 파일 작업의 ingress/Case payload와 context allocation이 repository content 총량에 비례해 커지지 않는지 byte/operation count로 확인한다. 최초 전체 manifest 검증이나 필요한 clone I/O는 별도 계수로 숨기지 않는다.

### CP3 — 1GB lazy workload 및 full-context stress

먼저 versioned admission/한도가 1GB repository를 표현할 수 있어야 한다. 현재 16 MiB semantic-tree 한도를 숫자만 올려 O(N) hydration을 통과시키는 것은 lazy 경로의 완료가 아니다.

두 workload를 분리한다.

1. **1GB repository + small lazy task:** generated qualification repository의 exact commit/manifest를 고정하고 필요한 작은 파일 집합만 조회한다. 큰 binary/UTF-8 entry의 identity 보존, memory/disk/read bounds와 cancellation을 검증한다.
2. **의도적인 full-context load:** 별도 disclosure/support admission을 받은 stress profile에서 전체 내용 로드를 요청한다. 용량 초과, 부분 완료, cancellation, 메모리/디스크 압박 및 cleanup을 관측한다. 선언된 한도 밖이면 명확한 unsupported/limit outcome이 필요하며 이를 full-load PASS로 보고하지 않는다.

wall time은 관측치다. digest/state-transition 의미에 넣지 않는다. 단일 측정을 production SLO, provider billing/tokenizer 정확도 또는 모델 품질 주장으로 확대하지 않는다.

### 후속 기능

CP1/CP2의 성공 corpus를 기반으로 restart/response loss/reconnect/cancel, 인증 refresh/revocation/JWKS/policy rotation, 재현 가능한 배포·disable·forward recovery를 검증한다. 이후 disjoint width 2/4와 normal capacity에서 실제 overlap 및 동일 promoted tree를 증명한다. Git publication은 D0025와 관련 provider 권한/receipt/rollback gate에서 별도 수행한다. tmcp 비교는 독립적으로 작동하는 tdev 경로가 생긴 후 D0045에서 수행한다.

## 10. 검증 명령과 evidence

다음 baseline은 문서 작성 시점의 [QUALIFICATION §2](../QUALIFICATION.md#2-baseline-source-qualification-gate)에서 옮긴 실행 예시다. 실행 시 current owner와 일치 여부를 다시 확인한다. 이 계획이 command list의 새 owner가 되지 않는다.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
git diff --check
```

focused tests는 영향을 받은 identity, parsing, Case transition, process/candidate lifecycle에 먼저 적용한다. 이를 구현 모양을 그대로 따라가는 테스트나 전체 baseline의 대체물로 쓰지 않는다. 다음은 사용할 수 있는 기존 source test 범위의 예이며 새 테스트는 필요한 반례만 추가한다.

```sh
node --test test/development-runtime.test.mjs test/development-operation-profile.test.mjs test/selected-context-delivery.test.mjs test/casedo-authority.test.mjs test/mcp-surface.test.mjs
```

아래 CLI는 **새로 작성할 예정인 qualification entry의 제안 인터페이스**다. 이 문서 commit에 구현되어 있지 않으며 현재 실행 가능한 명령이라고 주장하지 않는다.

```sh
node qualification/mcp-development-path.mjs --profile scoped-lazy
node qualification/mcp-development-path.mjs --profile repository-lazy
node qualification/mcp-development-path.mjs --profile full-context-stress
```

entry는 accepted profile과 protected deployment configuration을 읽고 raw credential/path를 stdout, argv 또는 evidence에 넣지 않는다. 각 profile에 exact input/workload, source/artifact/provider/client identity, positive/negative checks, effects, unknowns, cleanup 결과를 저장한다. 기존 M0 및 capacity-preflight executable의 결과를 새 lazy/CP1 qualification으로 승격하지 않는다.

| 검증 층 | 필요한 evidence | 불충분한 대체물 |
| --- | --- | --- |
| source | focused falsifier와 complete applicable gate | 문서/compile만 PASS |
| repository/context | exact commit/root/manifest/scope, read/byte counts, stale/corrupt/bound negatives | 파일을 제외해 digest를 다시 맞춤 |
| process | warden launch/termination/descendant/resource receipts | child close나 cleanup true 상수 |
| candidate/validation | exact candidate digest, pinned validator, objective PASS, unchanged canonical | npm exit 0만 존재 |
| provider | actual version/binding/traffic/owner receipt 및 real candidate preflight | upload 또는 capacity 계산 |
| current client | authenticated MCP command부터 같은 Case의 terminal candidate까지 join | HTTP 200, initialize, tools/list |
| scale | workload별 operation/byte/memory/disk 증거와 명확한 한도 | 단일 wall-time 측정 |

## 11. Failure, recovery 및 migration

기존 failing Case와 CURRENT credential을 원인 재현을 위해 reset/delete/remint하지 않는다. 원래 요청이 ambiguous면 같은 owner/identity로만 reconcile한다. parent control process 종료나 Worker eviction을 semantic retry 허가로 사용하지 않는다.

CP1은 새 profile의 fresh trial Case로 qualification할 수 있지만 기존 Case의 state meaning을 재해석하지 않는다. 구형 Case/receipt가 존재하면 해당 reader와 old-writer fence를 유지한다. root/object/schema/storage owner가 바뀌는 실제 migration은 별도 accepted predecessor, quiescence, receipt/in-flight 처리, destination activation, rollback barrier를 갖는다.

package activation 전에는 실제 live operation 및 cleanup-held 여부를 확인한다. provider update 직전 actual config/ref를 다시 읽고 source/artifact/version을 join한다. upload/activation 응답 손실에는 readback을 먼저 수행한다. 이미 Case/candidate가 존재하면 readable receipts 및 positive quiescence 없이 namespace 삭제나 incompatible rollback을 하지 않는다.

원래 실패의 exact cause가 끝내 관측되지 않으면 historical unknown을 유지한다. 새 bounded reproduction과 repaired-path 성공은 별도 evidence로 기록한다. 새 성공이 과거 사건의 원인을 소급해 증명하지 않는다.

## 12. 출시 차단과 보고 규칙

CP1, full-repository, stress, hardening, publication 각각 자신의 gate에 실패하면 해당 claim을 차단한다. 모든 단계의 공통 차단선은 다음과 같다.

- ambiguous authority 또는 source/accepted Design/package/provider mismatch
- 실제 candidate/validation/client join의 부재
- unknown process/commit/effect를 success/no-effect로 변환하거나 새 identity로 blind retry
- base/context/permission의 silent widening, arbitrary exclusion, digest alias
- warden cleanup, candidate retention/cleanup, validator 독립성의 결손
- 인증·Case·delivery·OS effect·Git publication의 owner 혼합
- qualified 범위 밖의 1GB/full-load/isolation/제품 완료 주장

수리 실행 지시 이후에는 내부 commit·source test·package·upload·readback을 중간 완료로 보고하지 않고 기능 체크포인트까지 계속한다. 실제 외부 capability가 없거나 irreversible 선택이 새로 필요하면 이미 승인된 독립 작업을 먼저 끝내고 정확한 의존성과 필요한 사용자 동작만 설명한다. 미실행을 성공으로 바꾸거나 같은 승인을 반복 요청하지 않는다.

이 문서 publication은 감사와 제안의 보존만 완료한다. runtime/source 수리와 CP1은 별도 후속 작업이며, 진행 상태는 current WORKBOARD와 maintained Designs 및 exact evidence에서 다시 재구성해야 한다.
