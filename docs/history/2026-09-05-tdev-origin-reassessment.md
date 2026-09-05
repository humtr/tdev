# tdev 원점 재검토 — 2026-09-05 독립 감사

> 문서 종류: 완료된 범위 한정 감사의 역사 기록. 아래 상태는 2026-09-05 관측 시점의 값이며 현재 route, Design 상태, provider 상태 또는 구현 승인을 소유하지 않는다. 다음 작업은 반드시 `AGENTS.md`로 published snapshot을 다시 바인딩한다.

- 관측 근거: [read-only audit evidence](../evidence/group-f-origin-reassessment-readonly-audit-2026-09-05.json)
- 후속 제안: [상세 수리 계획](../development/2026-09-05-tdev-repair-plan.md)
- 문서 기록의 분류: SDD Class 0. 관측·해석·미승인 계획을 보존하며 제품 계약, Design revision/status, runnable frontier, 지원 범위 또는 검증 요건을 변경하지 않는다.
- 요청 범위: 첫 감사에서는 변경 없이 결과와 계획만 제시했고, 후속 사용자 요청으로 이 기록을 저장·푸시한다. 수리 구현이나 제품 qualification의 완료 기록이 아니다.

## 1. 결론과 사용자 목표

감사 시점에 실제 MCP 개발 경로는 목표에 도달했다고 판정할 수 없다. 가장 짧은 수리 경로는 lazy repository context 계약을 정하고, 실제 개발 실행을 disposable exact-base clone 및 warden cleanup 경계에 연결한 뒤, 작은 scoped context로 실제 MCP부터 validation까지 한 번 완주하는 것이다. 502의 원래 내부 예외는 미확정이다.

사용자 목표는 ChatGPT가 MCP로 tdev를 호출하고, tdev가 로컬 Termux의 trusted-local Agent/Codex 경계에서 파일 개발을 수행하는 경로다. tdev의 제품 역할은 ChatGPT용 MCP와 로컬 Agent다. Codex는 그 안의 개발 실행 구성요소다.

사용자가 지정한 수리 제약은 다음과 같다. 이 목록은 요청의 역사적 기록이며 아직 바뀌지 않은 제품 owner를 대신하지 않는다.

- tdev 단일 경로를 먼저 완성한다. tmcp 비교는 이후다.
- 단일 사용자 trusted-local M0에서 bwrap/커널 sandbox를 사용하지 않는다.
- 실행 경계는 disposable exact-base clone, 결과 전용 ChangeSet, warden cleanup이다.
- hostile-local-code 및 multi-tenant 격리는 지원 대상으로 주장하지 않는다.
- 1GB 저장소에서도 exact commit, base digest, manifest를 먼저 고정하고 필요한 파일만 bounded search/list/read로 가져오는 lazy context가 기본이다.
- 전체 repository를 대상으로 한 lazy 실행과 의도적인 전체 context 로드는 다른 검증이다. 전체 로드는 별도 stress qualification이다.
- 파일 제외로 digest나 권한을 조용히 바꾸지 않는다. scoped context는 명시적인 Design/계약을 갖는다.
- provider CLI 문제와 tdev 운영 경로의 문제를 구분한다.
- 인증, 접근 권한, Case authority, Agent delivery, 실제 실행, candidate, validation, Git publication의 소유자를 구분한다.
- 소스 테스트·패키지·배포·접속만으로 개발 성공을 보고하지 않는다.

## 2. Authority 재구성과 snapshot 관계

기존 대화의 분석·완료 보고·실패 원인·핸드오프를 권위로 사용하지 않았다. published 후보를 새로 열거하고 후보 자신의 WORKBOARD identity를 검사한 뒤 RULE → SDD → WORKBOARD 순서로 읽었다. 이후 documentation taxonomy, workflow, 해당 product owner, qualification 및 관련 gate만 점진적으로 읽었다.

| Published ref | 관측한 exact SHA | Authority 판정 |
| --- | --- | --- |
| `development` | `d2a1573b2c71e2f50e1656fca9c36a82a827d0aa` | `humtr/tdev`, 자기 ref, 단일 `persistent-v1`을 선언하고 live predecessor가 없음 |
| `codex/cloudflare-access-minimum-requirements-20260901` | `77f3c525726337366e57ebee1fab22ab96385f97` | WORKBOARD가 자기 ref 대신 `development`를 선언하므로 self-declaring 후보가 아님 |
| `main` | `b86287b84375e2aeb833cf775371a7808a1239cf` | 해당 snapshot에 WORKBOARD가 없음; terminal persistent route를 elect하거나 block하지 않음 |

따라서 bound authority는 `humtr/tdev refs/heads/development@d2a1573b2c71e2f50e1656fca9c36a82a827d0aa`였다. provider default나 checkout 이름으로 고르지 않았다. 이 관측에서 `concept-*` published ref는 없었다.

| Bound WORKBOARD의 as-of gate | Design owner의 as-of 상태 | 의미 |
| --- | --- | --- |
| D0043@r2 | accepted | 선택된 다음 작업: 실제 Termux Codex·고정 validation |
| D0046@r1 | accepted | MCP/provider composition과 실제 supported-client 결과 |
| D0039@r12 | implementing | 별도 Q7/Q8/Q9 시나리오; 물리 qualification 부채와 scope가 독립적 |

로컬 HEAD는 `9f1bca3cf01f56b0229ab41bf18cc7cb1d60a294`였고 published base만의 커밋 0개, 로컬만의 커밋 72개였다. 로컬 D0043 r3, D0046 r3 및 후속 source/evidence는 이 unpublished 이력에 있다. 로컬 기록의 존재와 published acceptance를 혼동하지 않았다.

기존 미추적 상태는 502 진단 JSON, `native/installable-agent-package/`, D0044 resume 스크립트 두 개였다. 사용자 상태를 지우거나 72커밋을 일괄 승인·발행하지 않았다. 이 보고서의 문서 publication은 bound published base에서 별도 worktree로 작성하는 후손이다. 이후 로컬 72커밋과 문서 publication 사이에 생기는 동기화 부채는 WORKFLOW에 따라 따로 재조정해야 한다.

## 3. 주장과 증거의 불일치

아래의 “기존 주장”은 감사에서 실제로 읽은 저장소/로컬 기록의 주장이다. 원문을 보지 못한 이전 대화 내용을 만들어 넣지 않았다. 로컬 기록의 digest와 retained claim은 evidence의 `priorLocalRecords`에 보존한다.

| 기존 주장 또는 해석 | 관측 증거 | 감사 판정 |
| --- | --- | --- |
| 최신 로컬 수정이 현재 development 권위다 | published head와 로컬 HEAD가 다르며 로컬이 72커밋 앞섬 | publication debt이며 현재 권위의 대체물이 아님 |
| no-bwrap M0 PASS가 현재 실행도 증명한다 | 과거 물리 M0 PASS 문서는 존재하지만 이번 감사는 실제 Codex 개발을 실행하지 않음 | 현재 환경·release의 물리 성공은 미검증 |
| sandbox 인자 삭제가 no-sandbox를 보장한다 | 설치 profile은 인자를 생략하고 runtime은 `sandboxMode: none`을 기록함 | 실행 설정 선언과 실제 경계 증명은 다름 |
| M1 PASS이므로 실제 개발을 받을 준비가 됐다 | source-bound preflight 기록은 용량·binding readback이고 `caseCreated: false` | 같은 owner 경로의 candidate preflight 요건을 충족하지 못함 |
| 502 내부 원인이 이미 확정됐다 | 해당 진단은 `exactRemoteException: unknown` | 원인 확정 주장 불가 |
| Agent 접속/용량이 현재 502의 원인이다 | readback에서 CURRENT, effective capacity 1, reservation/delivery 0 | 현재 관측만으로 지지되지 않음 |
| semantic object 저장이 곧 lazy 실행이다 | restore는 전체 hydration/materialization, load/command는 전체 객체 용량 집계를 수행 | 저장 표현과 실행 비용을 혼동한 해석 |
| warden이 실제 개발 실행 cleanup을 증명한다 | 개발 실행은 별도 in-process adapter로 가고 cleanup이 completion rejection을 삼킨 후 true를 반환 | 요구한 실제 프로세스/정리 경계와 불일치 |
| context 제외는 프롬프트 양만 줄인다 | 제외 후 tree로 semantic base digest를 계산함 | 의미와 범위를 바꾸므로 명시적 계약 필요 |
| placement 존재가 Case 성공을 증명한다 | D1 placement는 있지만 terminal receipt를 관측하지 못함 | placement만의 증거 |

## 4. 확정한 사실과 proof layer

새 readback의 정확한 관측 시각과 값은 evidence의 `provider`를 따른다. 아래 요약도 그 관측 시점에 한정된다.

- `tdev-mcp-trial`은 source `78f47d5002f7f0fbeb3520b7ec82dbc2a7356b61`, version `5fc3a517-f82d-4aa4-9f37-5e2b0586e3e9`, deployment `574091a3-31bf-4890-a2c4-967118b9dd13`, traffic 100%였다. 이 source는 감사의 published authority와 다른 로컬 후손이다.
- Case owner `tdev-d0020-composition-case-r1`은 source marker `e4420cb776bf8f6a4bde4d636aef7bc4bb2b2626`, version `ce96bc9d-4756-4b24-84c9-141522ba65da`, 16,777,216바이트 Case 예산을 가졌다.
- Case namespace `3b3d5808028f4e74bcbc1dc22f0757fd`, drive namespace `138b3b6fc20d4d8988b598c572aa39f7`, Agent namespace `0dad69baa7154d00949f88c8b8dbf94a`, D1 placement database `ff868f84-4fa3-4d3d-9024-8a1eec7b0c79` binding이 관측됐다.
- 기존 `tdev.humtr.workers.dev`는 Case/drive/Agent composition이 없는 별도 OAuth experiment였다.
- 설치 Agent package sourceRevision은 `ca98b26979a44757b7643403b73b349c855846af`였다. 개발 runtime, repository model transport, Agent control, operation config 네 파일은 조사한 로컬 HEAD와 byte-identical했다.
- 첫 감사에서 Case Worker의 관련 다섯 모듈을 실제 provider의 content API로 읽어 위 source marker의 Git blob과 비교했다. 전부 일치했다. 이 결과와 해시는 `originalAuditProviderModuleJoin`에 별도 보존한다. 문서 기록 시의 새 module download라고 주장하지 않는다.
- CLI 관측은 `codex-cli 0.153.4`였다. 버전/help 조회는 실제 model/candidate 실행의 증거가 아니다.
- 공개 protected-resource metadata와 authorization metadata는 200, 비인증 `/mcp`는 401이었다. 이것은 discovery 및 인증 거부 경계만 증명한다.
- `tdev-trial-m2-20260905-r3`의 D1 placement를 SELECT로 읽었으며 `rowsWritten: 0`이었다. Case authority 초기화·명령 commit·terminal receipt의 존재는 이 조회로 알 수 없다.

첫 감사에서 Agent epoch는 이전 로컬 기록의 11과 달리 15로 관측됐고, 문서 기록을 위한 14:24 UTC readback에서는 18이었다. mutable 값은 이후 readback에서도 다시 확인해야 하며 이 숫자를 새로운 route owner에 저장하면 안 된다. CURRENT/capacity 관측은 특정 502 요청이 Agent에 도달했다는 증거가 아니다.

## 5. 502와 연결 실패의 재현 경계

| 경계 | 실제 확보한 증거 | 미확정 사항 |
| --- | --- | --- |
| 공개 discovery | HTTP GET metadata 200 | 현재 ChatGPT login/refresh 전체 성공 |
| 인증 후 ingress | retained local diagnostic에 Access assertion 및 tools/call HTTP 500 두 건 | 당시 요청의 독립 재현, client의 502와 원격 요청의 완전한 join |
| Case/drive RPC | cross-DO 비정형 예외가 `mcp_internal_error`로 가려지는 source | 원래 remote exception, 실패 operation, commit 전/후 경계 |
| Agent | 별도 read-only route/capacity readback 성공 | 실패 요청의 delivery·process 이력 |
| Codex CLI | 버전과 실행 옵션 help | model 실행 성공 및 해당 502와의 인과관계 |

미추적 진단은 08:27–08:28 UTC에 약 24.5초 및 23.3초 뒤 내부 500이 반환됐다고 기록했다. `connector502: outer_client_representation_of_worker_internal_500`은 그 기록의 해석이다. 원격 내부 예외는 그 기록에서도 unknown이다. 이것을 이번 감사의 새 end-to-end 재현으로 승격하지 않는다.

현재 확정 가능한 결함은 오류 처리 경계에서 원인 정보를 잃는다는 점이다. CPU, 메모리, serialization, storage, 특정 RPC 중 무엇이 최초 원인인지는 미확정이다. 로컬 benchmark의 약 25.7초와 원격 wall time이 비슷하다는 사실만으로 CPU 초과를 확정할 수 없다. DO의 CPU 예산과 wall-time 의미도 구분해야 한다. [Cloudflare DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)

확인한 credential 위치에 Case qualification token이 없었고, 감사 세션에는 trial의 authenticated development MCP 도구가 노출되지 않았다. Worker의 retained observability/logpush도 사용할 수 있는 것으로 관측되지 않았다. 원래 예외를 얻기 위해 새로운 token, 인증 우회, deployment, Tail subscription 또는 Case를 만들지 않았다. 이는 현재 세션의 관측 가능성 한계이며 provider 전체 고장의 증거가 아니다.

## 6. Eager full-context 및 semantic-object 판정

다음은 source에서 확인한 실행 구조다. unpublished 파일은 exact local source의 path로 표기하며 현재 published 파일로 가장하지 않는다.

| Source 경계 | 확인한 동작 | 목표와의 차이 |
| --- | --- | --- |
| `src/repository-model-transport.mjs` | 전체 listing 후 제외되지 않은 모든 blob을 읽고 complete tree 및 JSON 표현 생성 | 파일 내용의 lazy retrieval이 아님 |
| `qualification/mcp-trial-base-tree-builder.mjs` at local `9f1bca3…` | full text tree를 gzip/base64 module로 배포 | Worker 생성·composition에 repository bytes를 결합 |
| `src/engine.mjs`의 semantic restore 경로 | base semantic tree hydrate/materialize 후 Plan 재구축 | 작은 명령도 큰 base의 재구축 비용을 가질 수 있음 |
| `src/semantic-authority.mjs::hydrateSemanticTree` | 모든 자식을 방문하고 materialize 후 root 재검증 | reference 존재만으로 lazy라고 할 수 없음 |
| `src/casedo-authority.mjs::#existingUsage` | object/chunk 전체 집계 | 작은 Case read/command의 비용이 repository 크기에 결합 |
| `src/policy.mjs` | semantic tree 16 MiB, 단일 text file 2 MiB 한도 | 1GB repository 요구는 단순 timeout 증가로 충족되지 않음 |

현재 Codex 전용 프롬프트는 instruction과 commit/base/context 식별자 중심이다. “전체 repository 내용이 항상 Codex prompt에 들어간다”는 것은 정확하지 않다. 문제는 그 전에 하는 eager preparation, full clone, Worker의 full-tree 보유, Case 복원 비용을 함께 포함한다. clone을 디스크에 준비하는 비용과 모델 context에 내용을 공급하는 비용도 별도로 측정해야 한다.

semantic object 자체를 폐기할 근거는 없다. immutable root, 단일 Case head, deterministic Promotion은 필요한 의미다. 문제는 그 의미를 유지하기 위해 모든 요청이 전체 content를 복원해야 하는 결합이다. published ARCHITECTURE는 cold hydration/scrub의 O(N)을 허용하지만, 사용자가 요구한 기본 lazy 파일 개발 경로는 별도로 설계해야 한다. D0017의 packed reference도 현 계약상 complete context를 복원하므로 이를 대신하지 못한다.

로컬 preflight 기록의 507개 text file, 7,853,951 semantic bytes, 3,493 semantic objects, 11,606,963 required authoritative bytes는 해당 로컬 source와 측정법의 기록이다. 이번 감사에서 원래 benchmark를 다시 실행하지 않았다. metadata-only `git ls-tree`로는 배포 source에 tracked entry 510개와 세 native blob의 존재를 확인했다. 세 파일을 제외한 semantic digest는 whole-repository identity와 같은 의미가 아니다.

## 7. 실행·cleanup·validation 경계

설치 profile은 `tdev.model.codex-exec-no-bwrap.v1`이며 `exec --ephemeral --json --ignore-user-config`를 사용한다. runtime이 `sandboxMode: none`을 기록하는 것과 실제 CLI가 kernel sandbox를 사용하지 않는 것은 다른 증명이다. 공식 `codex exec` 문서는 기본 read-only sandbox를 설명한다. 해당 Termux executable에 맞는 명시적 설정과 실제 launch 관측이 필요하다. [공식 non-interactive 지침](https://learn.chatgpt.com/docs/non-interactive-mode)

`src/installable-agent-control.mjs`는 development operation을 `createLocalDevelopmentOperationExecutionAdapter`로 보내고 일반 진단 작업의 supervisor adapter와 분기한다. development adapter는 control process 안에서 동작하고 Codex/npm 자식을 직접 만든다. `cleanup()`은 completion rejection을 삼킨 뒤 `cleanupComplete: true`를 반환한다. lower-level SIGKILL 시도나 child close만으로 독립 warden의 양성 cleanup 증거가 생기지 않는다.

candidate는 runtime의 memory Map에 있고 workspace 정리는 dispose에 의존한다. control stop의 dispose 오류도 관측 밖으로 사라질 수 있다. control process 소실 후 실제 자식·candidate·claim 수명을 다시 확인하는 경계가 필요하다. trusted-local 범위라도 cleanup uncertainty를 성공으로 바꾸면 안 된다.

고정 npm executable/argv는 validator 전체의 불변성 증명과 다르다. candidate가 package scripts나 validator 코드를 변경할 때의 admission, validation 전/후 candidate identity, 변경된 검증기로 만든 허위 PASS를 별도로 검증해야 한다. 이번 감사는 그런 공격의 물리 재현을 실행하지 않았다.

## 8. 사실, 가설, 미확정 사실

- **확정:** published/local/provider/package identity 차이, source의 eager 구조, 직접 development 실행 adapter, 오류 원인 masking, 현재 읽힌 HTTP/Agent/placement 값.
- **가설:** eager composition/semantic reconstruction이 provider resource budget을 넘겨 500/502에 기여했을 가능성. 아직 원격 예외로 확인하지 못했다.
- **미확정:** 실패 Case의 initialization/command commit 및 terminal receipt, 원래 remote exception, 현재 authenticated ChatGPT 개발 성공, 현재 물리 Codex candidate/validation 성공, 실제 warden cleanup, 1GB 및 full-context stress 결과.

작은 구현 과제의 후보도 확인했다. `createDevelopmentUnitStartAdapter`에 `'가'.repeat(21846)`을 넣은 메모리 내 probe는 21,846 code unit / 65,538 UTF-8 bytes 입력이 context resolver까지 도달함을 보였다. Case creation과 provider call은 0회였다. 이것은 code-unit counting의 확정 증거다. 64 KiB 바이트 계약을 responsible owner에서 확인하거나 명시한 뒤 CP1의 실제 경계조건 수리 과제로 사용할 수 있다. 계약 확인 전에 이를 임의로 새 public semantics로 구현하지 않는다.

## 9. 최소 수리와 출시 차단

최소 수리는 authority/local debt 정리 → bounded 원인 관측 → lazy context와 exact-base identity 계약 → warden 소유 실행/candidate/validator 연결 → 작은 실제 MCP candidate → full-repository lazy 경로 → 별도 stress qualification 순서다. 구체적인 파일 범위, acceptance, 실패 및 migration 처리는 [상세 계획](../development/2026-09-05-tdev-repair-plan.md)에 제안으로 기록한다.

다음은 해당 release claim의 차단 조건이다.

- CP1을 실제 MCP/Agent/validation/current-client 경로에서 완주하지 못함.
- source, accepted Design, package, provider identity가 서로 맞지 않음.
- 오류 뒤 commit/Attempt/process 효과가 unknown인데 새 identity로 반복 실행함.
- 파일 제외나 digest 재해석으로 repository/context/쓰기 권한이 조용히 바뀜.
- warden cleanup, candidate 수명, validator 고정을 증명하지 못함.
- 인증·Case authority·delivery·실제 OS 효과의 owner가 서로 대체됨.
- 실행하지 않은 1GB, hostile-local-code, multi-tenant, Git publication 또는 제품 완료를 주장함.

첫 감사의 범위는 read-only였다. baseline 전체 테스트, 실제 model invocation, 새 Case, candidate validation, provider 변경 또는 client E2E는 실행하지 않았다. 문서 검사 성공도 이 product proof들을 승격시키지 않는다.

## 10. 외부 지침과 재사용 규칙

사용자 의도 추론, 지속 수행, user instruction 우선은 [Astra 공식 지침](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra)과 대조했다. 첫 turn의 “감사·계획만”과 이후 “저장·푸시”는 각 요청의 작업 범위로 지켰다. 향후 수리 실행 지시 이후의 작은 commit·source test·package·provider readback은 사용자 완료 지점이 아니다.

이 문서와 evidence는 as-of 자료다. 재사용자는 published authority, affected Design revision/status, mutable provider/ref/package/credential/capacity 사실을 다시 읽어야 한다. 불일치는 current owner에 따라 정정하며 이 보고서가 route, runtime 또는 완료 판단의 두 번째 owner가 되어서는 안 된다.
