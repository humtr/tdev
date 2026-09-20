# tdev 차세대 architecture
설계 결정일: 2026-09-20 (Asia/Seoul) · 상태: 구현을 위한 선택 완료, runtime 미구현

이 문서는 clean-root `tdev` 설계의 의미·근거·구현 순서를 소유한다. 정확한 wire 필드·형식·상한의 소유자는 `contracts/tools.schema.json`이다. README는 제품 목적과 현재 작업만, AGENTS는 진입 안내만 소유한다. 과거 문서의 authority는 이 branch로 승계하지 않는다. 별도로 evidence를 표기하지 않은 target 설계·기본값·구현 순서는 ENGINEERING INFERENCE이며 기존 제품의 실측 사실이 아니다.

## 1. Executive conclusion

**Candidate C — model-led hybrid typed harness를 선택한다.** ChatGPT가 개발의 planner/orchestrator이며 tdev는 repository identity, immutable workspace checkpoint, bounded read/patch, credential-free execution, mandatory validation, exact integration을 제공한다. 별도 모델 API나 Codex agent loop는 필수가 아니다. 장기적으로 새 CLI·MCP·device/API·executor·artifact source·보조 모델이 필요해져도 core를 다시 설계하지 않도록 **open capability extension plane**을 둔다. 공개 MCP surface는 9개 core tool과 하나의 안정된 `tdev_capability` gateway로 고정하고, 설치된 extension의 descriptor만 필요할 때 lazy-load한다.

핵심은 “모든 것을 shell로”도 “작업을 server workflow로”도 아니다. 일반 개발은 `context → batch read/search → workspace → patch/exec → validate → integrate`이다. 모델이 관리할 주된 식별자는 workspace/revision과 실행 operation handle이다. candidate generation, prepared-result owner, campaign, Design route를 제품 사용자가 조립하지 않는다.

Termux는 신뢰된 제어·Git·상태 저장의 중심으로 유지한다. 임의 repository code는 credential 없는 managed Linux sandbox에서 실행한다. 기존 Cloudflare public edge/Access/단일 routing DO와 검증된 remote-executor 경계는 회수한다. 이 선택은 같은 UID의 shell을 안전한 sandbox라고 부르지 않으면서 command 자유도를 되찾는다.

동일 ref 병렬 변경의 재검증 폭증은 **명시적 workspace composition → 합쳐진 정확한 결과 한 번 검증**으로 줄인다. 자동 H2 membership/leader/follower settlement는 없앤다. 명시적 합성을 선택하지 않은 경쟁 작업은 정확한 stale 결과를 받는다.

새 제품의 우월한 실측 성능을 주장하지 않는다. 아래 선택은 확인된 실패 비용과 제약에 대한 **ENGINEERING INFERENCE**이며, 첫 완전 개발 경로 직후 실제 workload로 검증한다. 설계의 완성은 구현이나 live acceptance의 완료를 뜻하지 않는다.

## 2. Actual product requirements

### 근거와 관측 범위

원격 GitHub에서 시작 ref/commit/tree를 다시 읽었다. source는 아래 exact revision으로 읽었다. local checkout은 변경하지 않았고, 신규 runtime·provider 배포·prototype·benchmark·추가 모델 worker 실행은 하지 않았다. 테스트 파일의 assertion을 읽은 것과 이번 세션에 테스트를 실행한 것은 구분한다.

| 분류 | 대상 / 고정 revision |
|---|---|
| CURRENT TDEV EVIDENCE | `humtr/tdev` dev-2: `05e5ae681c846ac77457dc0bbeb15f67f3a29688` |
| TDEV HISTORY EVIDENCE | main: `b86287b84375e2aeb833cf775371a7808a1239cf`; development: `afd28533f2ac0edb64639dc637ca8f0600f3ac9e` |
| TMCP EVIDENCE | `humtr/tmcp` next: `ce3f2a78c98853fba06e4ec1a3b21955283ca4b9`; pre-refactor-snapshot: `3ecb88adb10e3cc5940a880f15f3440f97a91418`; main: `ef49f889db6d5aaf479086936261aef81d69605d` |
| EXTERNAL IMPLEMENTATION EVIDENCE | DevSpace: `531d3f973f09f7b6b4993c9ff58f80a4514b9ba2`; AgentDock: `ad51001515a2b1b82baa31281970e0b9f67f28e9`; CoS: `8f76ccc790917b01ee758da6687a1cf9b576ba8a`; WebGPT: `a2a4c4f15b62813cc87700b15b34480146775b04` |

`tdev`의 시작 commit은 `988dab0cf32a18f06e147740c345b986bf19ebf9`, parents `[]`, tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`였다. 기존 dev-2/main ancestry를 가져오지 않는다. 위 source snapshot은 운영 runtime/provider가 현재 그 source를 실행한다는 주장과 다르다.

### 제품의 기능과 책임 배분

| Capability | 모델이 결정 | harness가 강제 | 기존 primitive / durable 필요성 |
|---|---|---|---|
| repository 발견·repo/ref 선택 | 사용자의 목적에 맞는 대상 | stable provider ID, full ref, grants | Git/provider; binding만 durable |
| directory/search/relevant source | 범위·검색식·다음 파일 | 경계·예산·정확한 snapshot | Git blobs/trees; 검색 workflow 저장 불필요 |
| single/multi-file/range read | 자연스러운 파일·range 묶음 | byte budget, pagination, 혼합 snapshot 방지 | immutable cache; read별 state 불필요 |
| diff/status/history | 비교·해석 | 정확한 base/checkpoint 표시 | Git; 별도 Git 모델 불필요 |
| create/edit/delete/move | 변경 전략 | revision CAS, grouped atomic publication | Git object construction + workspace pointer |
| command/test/build/lint | command·순서·추가 진단 | sandbox·resource/network class·ownership | process/container; 실행 identity는 durable |
| long process/stdin | 대화·중지·다음 조사 | exact process, sequence, output cursor | session handle; 외부 effect 재실행 금지 |
| candidate isolation/concurrency | 작업 분해·병렬성·합성 | 독립 writable state, workspace 단일 writer | private sandbox + immutable Git |
| exact base/stale/conflict | 충돌 해결 전략 | expected old head/revision, no silent merge | Git CAS; 결과의 별도 workflow 불필요 |
| validation | 추가 검사와 실패 진단 | mandatory policy와 receipt identity | validation operation의 immutable 결과 |
| canonical integration | 통합을 요청할 시점 | tested commit 그대로 publish, dedup | Git CAS + durable publication intent |
| retry/reconnect/recovery | 불명확한 진단 후 새 의도 선택 | accepted intent 보존, unknown effect 격리 | operation record; read는 재호출 |
| multi-repo/multi-ref/multi-principal | 대상·협업 | namespace/grants/fair capacity | binding/ workspace 반복; daemon 복제 없음 |
| open-ended capability extension | 어떤 새 도구·환경·executor·advisor를 언제 사용할지 | installed descriptor digest, exact action schema, explicit namespaced grants | stable capability gateway + adopted adapter; core workflow 추가 없음 |
| external/local environment interaction | 어떤 MCP/CLI/device/API를 어떤 순서로 사용할지 | exact installed target, declared execution boundary, bounded result/artifact | extension adapter; repository source가 스스로 trusted adapter가 되지 않음 |
| optional advisor/model | 사용할지·어떤 질문을 맡길지·결과 해석 | advisor output은 authority/validation이 아님 | optional extension invocation; durable planner state 불필요 |
| credential/authorization | 권한 요청 이유 | 인간 인증, credential containment | Access/provider secret store + local grants |
| deploy/release | 명시적 승인·배포 선택 | artifact identity, quiescence, rollback pointer | 별도 operator 경계; 일반 coding loop 아님 |

운영 조건은 Android/Termux, no root/no systemd/no local Docker, sleep/kill/reconnect, 하나의 안정적 public endpoint다. 정상 새 개발 작업을 여는 데 tmcp·GitHub 직접 mutation·Worker 재배포가 필요해서는 안 된다. 표의 capability는 모델의 지능을 대체할 workflow를 요구하지 않는다.

장기 요구사항은 **기능은 열려 있고 authority는 닫혀 있는 것**이다. 미래 기능 하나를 추가하기 위해 core MCP tool 이름, workspace/operation state model, Cloudflare endpoint 또는 controller release를 매번 바꾸지 않는다. extension은 immutable descriptor+adapter binding으로 설치·활성화하며, `tdev_context`는 작은 authorized summary만 보여주고 `tdev_capability`가 `list/describe/invoke`를 제공한다. 설치/enable/disable은 operator/admin boundary이고, 설치된 뒤의 사용 순서와 action 선택은 모델이 결정한다. native correctness는 Android/Termux의 hard-link 지원을 전제로 하지 않으며 `link(2)` 없이 Git objects, SQLite transaction, copy와 같은-filesystem rename으로 구현 가능해야 한다.

## 3. Current tdev architecture summary

**CURRENT TDEV EVIDENCE [T1] [T2] [T3] [T4] [T5] [T6] [T7].** 이미 dev-2는 ChatGPT를 외부 의사결정자로 두고 `context/read/work/observe`를 노출한다. Termux native broker의 repository별 SQLite와 Git object store, Cloudflare Access/Worker/installation routing DO, credential-free managed execution, trusted outer receipt와 exact Git integration을 결합한다. “현재 tdev는 모든 사고를 서버가 대신한다”는 평가는 부정확하다.

그러나 공개 `work` union 뒤에 work revision, candidate generation, action/attempt, prepared result, validation/effect, managed session, H2 selection/member, release activation이 함께 존재한다. profile 기반 run과 구체화된 validation/release 동작은 일반적인 ad-hoc coding command보다 좁다. 현재 read도 이미 batching/range/diff를 지원한다. `read_files` 부재를 근거로 새 시스템의 우위를 주장하지 않는다.

`main`은 README만 남은 tree다. 이전 구현은 `development`에서 조사했다. 그 구현의 `mcp-development-adapter`는 context capability/semantic plan/Case create+drive를 연결하고, `development-runtime`은 Codex model transport/operation catalog/Agent envelope를 결합한다. D1 Case placement와 별도 Drive state도 실제 source에 있다 [H1] [H2] [H3]. 이 유산은 요구사항과 실패 원인을 알려주지만 새 branch의 구성 요소는 아니다.

## 4. Current tdev strengths

**CURRENT TDEV EVIDENCE [T2] [T3] [T4] [T5] [T6] [T7] [T8].** 회수할 핵심은 정확한 Git identity와 all-or-nothing immutable candidate, dedup-before-stale-check, 동시 writable state 격리, trusted outer validation receipt, tested commit을 재생성하지 않는 integration, explicit old-head lease와 provider readback이다. 인증/authorization과 device transport identity도 분리되어 있다.

`src/integration/git-ref.mjs`는 sole parent와 exact old OID를 검증한 뒤 한 refspec의 qualified `--force-with-lease`를 사용한다. `github-boundary.mjs`는 enrolled provider boundary를 재검증한다. `candidate/tree.mjs`는 모든 edit precondition과 topology를 먼저 확인한다. 이는 문서 슬로건만이 아니라 source에서 확인한 보장이다.

D0005는 같은 UID의 환경변수 filtering/cwd/PRoot를 OS sandbox로 오인하지 않으며, candidate의 “PASS” 출력을 trusted receipt로 취급하지 않는다. multi-repository routing/capacity와 receipt recovery 관련 테스트 파일도 존재한다. 다만 이 설계 세션에서 기존 전체 acceptance를 다시 PASS 선언하지 않았다.

## 5. Current tdev complexity/failure analysis

**CURRENT TDEV EVIDENCE [T1] [T3] [T9] [T10].** prescribed navigation의 AGENTS/DIRECTIVE/RULE/WORKBOARD/route-map/C2 plan을 whole-file로 읽으면 **53,706 UTF-8 bytes**다. selected Designs와 source 전의 정적 proxy이지, 실제 토큰·latency 측정은 아니다. 파일별 bytes는 2,892 / 14,738 / 9,514 / 5,446 / 7,029 / 14,087이다.

동일 pinned tree에서 `src/`는 120 files, 953,382 bytes, 8,293 physical lines다. execution/release/runtime 세 디렉터리는 70 files, 665,338 bytes다. minified code·주석·빈 줄을 포함하며 SLOC나 결함률로 해석하면 안 된다. 다만 개발 기능 외 제어/lifecycle 비용이 집중된 위치를 특정한다.

| 비용 | 본질적으로 필요한 부분 | 현재 구현/구성에서 줄일 부분 |
|---|---|---|
| exactness | base, snapshot, policy, 실행 identity | 매 호출 다수 owner ID 복사, generation/revision 이중 노출 |
| recovery | lost publish, duplicate launch, PID/run 재사용 방지 | 일반 read에도 history/route 해석, 일회성 수리의 영구 abstraction |
| authority | 요구사항·보안 경계·현재 작업 | 여러 문서의 동시 상태 소유, campaign/Design routing 강제 |
| release | 실행 artifact와 활성 pointer 일치 | coding surface 안 stage/activate, bootstrap/compatibility 잔여물 |
| parallelism | 정확한 합성 결과 검증 | 자동 leader/member settlement와 반복 개별 검증 |

실제 `docs/ARCHITECTURE.md`는 당시 구 controller의 validation과 호환시키려고 남긴 deprecated sentinel이다. 문서 삭제가 설치된 validator 전환에 종속된 사례다. 반대로 최근 hard-cutover recovery 제거 assertion도 확인했으므로 과거 결함을 현재 잔존 결함처럼 나열하지 않는다.

기존 비용 진단 [T9]은 8개 같은-base 작업의 30분 창에서 34회 full validation, canonical 성공 6건, CONTENDED_REF 27건을 기록했다. 이는 이 세션의 측정이 아니다. tmcp 비교 실험은 capacity·성공 postcondition이 달라 승패 판정에 쓰지 못한다. H2 후속 N=3 기록 [T10]은 3 member+1 combined validation으로 3개를 한 commit에 정리했지만 matched A/B나 보편적인 비용절감률은 아니다.

**ENGINEERING INFERENCE:** “모든 H2를 삭제하고 독립 작업마다 full validate/rebase를 반복”하는 thin 설계도 실패다. 합성이라는 기능은 보존하고, **합성된 하나의 workspace만 소유**하도록 구현을 바꾼다.

## 6. tmcp strengths and weaknesses

**TMCP EVIDENCE [M1] [M2] [M3] [M4].** 모델이 임의 command를 고르고, typed file/Git operation과 generic shell을 섞는 자율성은 회수할 가치가 크다. request ID로 durable Job을 다시 읽고 timeout/cancellation을 process group까지 전달하는 구현도 유용하다. target-root 확인, fixed-argv Git, expected revision, explicit permission 및 secret lease가 실제 코드에 있다.

그러나 현재 next를 “순수한 얇은 shell server”로 미화하지 않는다. Workspace/Project/RootTask/Job/registry/lifecycle/checkpoint/tunnel 구조가 있고, main은 README-only라 구현 비교 기준이 아니다. pre-refactor snapshot의 tracked source catalog에도 Task와 runtime-handoff/rollback/tunnel 파일이 존재한다. 그 snapshot 전체의 runtime 동작을 검증한 것은 아니다. 정적 diff가 크다는 사실은 처리 성능의 증거가 아니다.

`process-runner.ts`의 shell stdin은 one-shot end/ignore이고, Codex형 지속 stdin 세션과 같지 않다. cwd/실행파일을 spawn 직전에 재검증하지만 그 shell은 같은 UID 권한을 갖는다. `same_uid_policy_not_os_sandbox`라는 실제 assurance가 정확하다. secret redaction은 containment가 아니다.

`store.reserveRequest`는 payload hash와 exclusive file creation으로 중복 의도를 구분하고, executor는 기존 Job을 돌려준다. 반면 Task authority와 Operation discovery/result envelope가 호출마다 커질 수 있고, request retention 만료 후의 보장은 별도로 검토해야 한다. typed guarded Git helper가 존재한다고 “mandatory validation의 exact result만 통합한다”는 dev-2 수준 보장이 자동 생기지는 않는다.

회수: command 자유도, 정확한 target/argv, bounded output, observable Job, model-led diagnosis. 미회수: RootTask hierarchy, registry-first discover/submit 의식, same-UID shell을 강한 경계로 해석하는 것, tunnel rolling/recovery 전체.

## 7. External MCP/harness findings

모든 주장은 위 pinned revision의 source 조사에 한정한다. README만 비교하지 않았다. “별도 model API 없음”은 **직접 tool 경로에 필수가 아님**을 뜻하며 모든 optional 기능의 API 호출 부재를 주장하지 않는다.

| 구현 | 지능 loop / actual reuse | primitive·state·경계 | 회수 / 미회수 |
|---|---|---|---|
| DevSpace [E1] | direct tools는 host 모델이 조율. codex/claude vocab 선택. optional Codex adapter는 실제 CLI/app-server를 탐색 [E1-codex]; workspace context는 pi-coding-agent helper 사용 | workspaceId, managed worktree, allowed realpath roots, `exec_command/write_stdin`, optional PTY. SQLite에 workspace/conversation/context/OAuth/local-agent state; process buffer는 메모리 drain | 자연스러운 workspace와 continuation 회수. optional agent daemon·UI·conversation binding을 core에 강제하지 않음 |
| AgentDock [E2] | host tool loop + optional ACP agent subprocess. Go MCP SDK server, 도구별 typed 계약 | read_file/list_dir/search_text/file_edit; exec_command/session_observe/session_act [E2-command]. staged patch preflight/backup/no-replace/rollback. stateless JSON HTTP. bearer/OAuth·browser CDP·desktop/WSL/tunnel 확장 | observe와 act 분리, bounded reads, patch preflight 회수. Desktop/ACP/Nexus/skill/memory subsystem은 제외 |
| Chat On Steroids [E3] | 직접 ChatGPT tools; browser companion의 ChatGPT worker 조정도 존재. **Codex Rust primitive의 TypeScript port**가 source header/attribution으로 확인됨 [E3-port]. Codex binary/agent loop 전체 재사용은 아님 | multi-target read, Codex grammar patch, unified exec/session, retained output. approved roots는 file tools 경계; exec는 OS user 권한. local session recording, browser request correlation, core/desktop/plugins surfaces | streaming range read, grouped read, process pattern 회수. browser identity join·conversation continuity·multi-agent machinery는 core 제외 |
| WebGPT [E4] | caller의 CUA browser API로 ChatGPT에 assignment 전달; local Node worker가 MCP exec/stdin과 selected input/result 처리. 별도 coding model loop를 worker 안에서 만들지 않음 | loopback+secret URL/task token, durable task/result JSON. terminal Map·drain output·user UID shell; command timeout/output truncation 없음. 별도 repo/workspace/Git correctness 모델 없음 | 얇은 local bridge와 불명확한 전송 재발송 금지 교훈 회수. model-visible task token, unbounded log, host shell을 제품 경계로 채택하지 않음 |

DevSpace process environment가 부모 환경을 넓게 상속하고, WebGPT/CoS는 shell의 OS 권한을 명시한다 [E1-process] [E3-security] [E4-worker]. 이것만으로 해당 제품의 모든 configuration을 취약하다고 단정하지 않는다. 다만 tdev의 candidate-vs-credential 요구와는 다른 trust model이다.

CoS의 patch port는 preflight 이후에도 순차 filesystem IO 실패 시 앞부분이 남을 수 있음을 source가 명시한다 [E3-patch]. AgentDock rollback 역시 그 자체로 power-loss atomic publication의 증명이 아니다 [E2-patch]. 새 tdev는 이 경험을 읽고 **Git tree + DB pointer**를 atomic unit으로 선택한다.

DevSpace의 process drain, WebGPT의 완료 session 삭제 [E4-terminal]와 달리 tdev output은 byte cursor로 재관측한다. CoS source의 특정 ChatGPT 출력량/요청 header 관측은 외부 구현 경험이지 공식 안정 계약이 아니다. tdev는 undocumented browser metadata를 principal authority로 사용하지 않는다.

직접 read 시 선택한 source가 host 모델에 전달되고 shell 출력에도 source가 포함될 수 있다. local 실행 구현이라고 source가 모델 provider에 전혀 전송되지 않는 것은 아니다. 새 tdev는 여기에 더해 remote sandbox로 materialize되는 source의 disclosure를 enrollment에 명시한다.

## 8. Cross-system architecture lessons

**ENGINEERING INFERENCE [T2] [T3] [T4] [T5] [T6] [T7] [T8] [T9] [T10] [M1] [M2] [M3] [M4] [E1] [E2] [E3] [E4].** coding harness의 하단 primitive를 MCP로 노출하면 ChatGPT 자체가 개발 orchestrator가 될 수 있다는 주장은 직접 tool 경로들로 지지된다. 이것은 모든 Codex facility를 MCP가 동일하게 제공한다는 뜻은 아니다. freeform patch grammar, PTY, filesystem boundary, model context management, authentication은 각각 구현해야 한다.

Codex source reuse, vocabulary imitation, execution pattern reuse, local bridge, browser-mediated orchestration은 별개다. 이번 선택은 vocabulary/pattern과 검증된 작은 구현을 회수하되, 두 번째 agent loop나 browser identity subsystem은 들이지 않는다.

좋은 abstraction은 반복되는 자연스러운 작업 단위와 failure boundary를 함께 묶는다. multi-file read와 atomic grouped edit는 좋고, “fix bug” 같은 지능 단계의 durable workflow는 불필요하다. 반대로 integration을 일반 shell에 숨기면 검증 결과와 canonical effect의 연결이 사라진다.

확장성도 같은 원칙을 따른다. 외부 기능마다 새 public MCP tool이나 core workflow를 추가하면 tool discovery·Refresh·schema 비용과 제품 결합도가 계속 증가한다. 반대로 완전히 무형식의 generic registry는 tmcp에서 줄이려는 선택/계약 비용을 되살릴 수 있다. 따라서 **하나의 stable capability gateway + digest-pinned lazy descriptor + 기존 operation/observe 재사용**을 선택한다. extension은 primitive를 제공하고 모델이 조합한다.

## 9. Model vs harness responsibility

모델은 탐색·command·수정·진단·작업 분해·합성 시점·추가 검사뿐 아니라 설치된 extension 중 무엇을 언제 쓸지, 어떤 action과 인자를 선택할지도 결정한다. 서버는 사용자의 목표가 달성됐는지, 특정 command가 적절한지, 어느 advisor를 써야 하는지를 별도 planner나 semantic safety classifier로 판단하지 않는다. model-generated objective와 extension/advisor의 score·approval 문자열은 display/data이며 실행권한이 아니다.

harness는 subject/repository/ref, path boundary, workspace writer, immutable result, mandatory validation, process ownership, credentials, installed capability/action identity와 canonical effect를 **기계적으로** 강제한다. capability admission은 authenticated subject, exact adopted descriptor digest, explicit namespaced grants, target/boundary와 mechanically verifiable precondition만 본다. arbitrary command와 repository test는 untrusted input이며 서버 정책을 바꾸지 못한다.

Git은 content/history/CAS를, provider는 ref boundary와 execution-run identity를, OS/container는 process와 credential 격리를 맡는다. extension은 자기 domain의 primitive를 소유하지만 core authority를 만들지 않는다. 이미 존재하는 primitive를 별도 semantic owner로 복제하지 않는다.

## 10. Tool-surface alternatives

| 형태 | 장점 | 비용 / 거절 이유 |
|---|---|---|
| Fine-grained 15–25 tools | 단순 개별 schema, 읽기/쓰기 분리 | create/delete/move/test마다 vocabulary·선택 비용; 자연스러운 batch가 깨짐 |
| Codex-style 4 primitives + integrate | 익숙하고 composable | exec로 read/validate/status를 다 처리하면 effect/receipt semantics를 flags나 prompt에 숨김 |
| 현재 four-tool union | 작은 이름 수, 확장 여지 | `work` schema와 owner identity가 큼; 이름 수만으로 cognitive cost를 평가할 수 없음 |
| extension마다 dynamic MCP tool | 각 extension의 강한 개별 schema·자연스러운 이름 | 설치마다 tools/list 변화·client Refresh 가능성·startup schema/context 증가; core와 extension lifecycle 결합 |
| **선택: 9 core tools + 1 stable `tdev_capability` gateway** | core effect boundary는 typed하게 유지하고 미래 기능은 lazy descriptor로 확장; extension 설치가 public tool list를 바꾸지 않음 | gateway가 무형식 registry로 비대해질 위험. descriptor digest, server-side schema validation, bounded list/describe, 기존 operation/observe 재사용으로 제한 |

batch는 read queries/ranges, 한 workspace의 edits, 명시적 source composition, validation profile set에서 제공한다. arbitrary DAG, generic operation registry, 서로 다른 repository의 mutation transaction은 제공하지 않는다. 서로 다른 workspace의 독립 호출은 병렬 처리한다. 공개 MCP tool set은 extension 수와 무관하게 **10개로 고정**한다. capability gateway는 extension workflow를 소유하지 않고 `list/describe/invoke`만 제공한다.

## 11. Repository-development plane analysis

tdev 자체 개발에는 제품 목적·구현 결정을 잃지 않는 문서가 필요하다. 따라서 모든 문서를 없애지 않는다. 다만 새 세션의 첫 source 수정 전에 architecture의 모든 과거 이유를 재구성할 필요가 없어야 한다.

startup은 AGENTS와 README의 current work를 읽고, 바꾸려는 component에 관련된 이 문서 section과 contract definition만 연다. 테스트와 코드가 강제 가능한 불변식은 테스트로 옮긴다. 문서 compliance checker가 무관한 historical sentinel을 보존하도록 만들지 않는다.

## 12. Product-operation plane analysis

일반 제품 사용자는 binding/ref와 workspace, operation, 그리고 현재 principal에게 노출된 **compact capability summary**만 본다. source 파일에 적힌 대상 repository의 AGENTS를 따를 수는 있지만 tdev 자신의 campaign/Design history를 읽지 않는다. 이 둘은 서로 다른 문제다.

`context`는 authorized binding 목록과 선택한 ref의 정확한 snapshot, limits, 자기 open workspace, 설치·허가된 extension의 작은 summary를 돌려준다. 전체 action schema는 startup에 싣지 않는다. 모델이 실제로 필요하다고 판단한 capability만 `tdev_capability{op:"describe"}`로 읽고 exact `descriptorDigest`를 고정하여 `invoke`한다. descriptor/args는 dispatch 전에 server가 검사하고 invoke 결과는 기존 operation/observe로 재관측한다. extension을 설치·제거해도 MCP public tool list는 바뀌지 않는다. `read`는 immutable snapshot을 재사용하므로 매 source read마다 remote ref를 다시 확인하지 않는다. fresh head는 open/compose/validate/integrate의 의미 있는 경계에서 확인한다. 비용 감소를 freshness 위조로 얻지 않는다.

## 13. Governance/authority cost analysis

| 기존 항목 | 방지하려던 실패 | 새 위치 / 결정 |
|---|---|---|
| AGENTS | 잘못된 진입/검증 경로 | 작은 navigation만 KEEP |
| DIRECTIVE | 제품 목적 변질 | README의 product intent로 MERGE |
| RULE | invariant/권한 오해 | architecture 해당 경계와 tests로 MERGE |
| WORKBOARD | 현재 frontier 유실 | README current work로 MERGE |
| route-map | 진행 경로 오선택 | 별도 문서 REMOVE; current step 하나만 |
| campaign plans | 장기 작업 중복·handoff 손실 | 구현 순서는 §30, 현재 단계만 README; 중복 state REMOVE |
| Design IDs/owner graph | 이유 추적·아키텍처 회귀 | 이 문서 관련 section+Git diff; 분산 owner graph REMOVE |
| evidence hierarchy | unsupported completion 방지 | 필요한 linked receipt/log만; 과거자료는 lazy-load |

ROI는 startup bytes/hops, first useful action까지 reads, wrong-route/rework, 중복 fact, maintenance edits를 같이 본다. 새 owner 추가는 실제 예방할 실패와 비용을 짧게 설명해야 하며 새 campaign ID가 진척은 아니다. 숫자 목표는 §28/31에서 검증한다.

## 14. Durable-state analysis

**선택 예산:** operational semantic owner는 **하나의 Termux controller/SQLite**다. 다른 물리적 권위(GitHub ref, OAuth, 실행 process)는 그 권위 자체를 재구현하지 않는다.

| Durable 내용 | 왜 memory/Git/filesystem/provider만으로 부족한가 | 저장·수명 |
|---|---|---|
| binding + grants + adopted policy | Git commit은 human 권한/allowed ref/실행 disclosure가 아님; provider가 local mapping을 모름 | SQLite binding/grant rows, 명시적 변경까지 |
| workspace | Git tree만으로 owner/base/revision/active writer를 알 수 없음 | SQLite workspace + Git pinned tree |
| operation intent/result/tombstone | response loss 때 같은 의도인지 Git·process가 모름 | SQLite operation; compact tombstone은 installation 수명 |
| executor session/launch identity | provider run과 local launch를 안전하게 join해야 함 | SQLite executor row; run terminal proof 이후 compact |
| installed capability descriptor/binding | process memory나 external MCP가 재시작 후 어떤 exact schema·adapter가 승인됐는지 증명하지 못함 | SQLite capability row + immutable descriptor/adapter digest; 명시적 admin change까지 |
| validation receipt | Git object가 테스트 성공/신뢰된 실행을 증명하지 않음 | validate operation의 immutable result/artifact |
| integration effect | local DB와 remote ref는 단일 transaction이 아님 | integrate operation 안 exact old/new/receipt/observation |
| release pointer | 재시작 시 어떤 검증된 bundle을 실행할지 필요 | operator-owned active/previous manifest; 일반 DB workflow 아님 |

물리적 기본 table은 `binding`, `grant`, `workspace`, `operation`, `executor`, `capability`와 schema metadata다. receipt/effect/checkpoint provenance는 각각의 immutable value이지 독립 workflow나 public owner ID가 아니다. Git content/hash cache, logs, backups는 별도 state machine이 아니다.

통계적으로 신뢰할 수 있는 failure 빈도는 대부분 없다. 사용자 disconnect 이력과 기존 response-loss/retirement evidence는 위험의 존재를 지지하지만 발생 확률을 만들어내지 않는다. canonical 중복·credential 유출은 빈도가 낮아도 영향이 커 유지한다. read 실패는 durable row를 만들 이유가 없다.

## 15. Recovery analysis

| 등급 | 상황 | 처리 |
|---|---|---|
| 반드시 안전하게 자동 처리 | lost canonical response, duplicate admission, stale overwrite, restart 후 owned process, concurrent workspace writer | exact intent/lease/identity를 관측하여 기존 작업을 복구. 불명확하면 quarantine, 새 실행 금지 |
| 단순 retry | immutable read/search/diff/context 조회; terminal로 확인된 replay-safe 검사 | 동일 snapshot/query 재호출; effect 없음. 검사는 새로운 명시적 요청 가능 |
| 수동 복구가 더 저렴 | DB/디스크 손상, provider admin rewrite, 증명 불가한 orphan, Android app data 삭제 | binding만 fence하고 backup/객체/실제 provider 확인. 새 자동 migration/recovery 제품은 만들지 않음 |

process kill 후 임의 command를 자동 재실행하지 않는다. command의 외부 side effect에 exactly-once를 약속하지 않는다. stdin 전달과 수신 프로그램의 처리도 하나의 atomic transaction이 아니다. `delivery_unknown`이면 같은 input을 자동 재전송하지 않는다. 명시적 output cursor 재관측은 새 실행이 아니다.

capability invoke도 같은 원칙을 사용한다. requestId/operation intent를 adapter dispatch보다 먼저 저장하고 response loss는 같은 operation을 observe한다. descriptor의 `idempotent` metadata만으로 unknown external effect를 자동 재실행하지 않는다. adopted adapter protocol이 exact operation/request identity의 중복 effect를 기계적으로 dedup하거나 기존 effect를 read back할 수 있을 때만 safe resend를 허용하며, 그렇지 않으면 `uncertain`으로 남기고 모델이 다음 행동을 결정한다.

## 16. Termux/Cloudflare topology analysis

**CURRENT TDEV EVIDENCE [T5] [T6] + OFFICIAL PLATFORM EVIDENCE [P1] [P2] [P3] [P4] [P5].** 현재 target에서 user namespace/Landlock가 불가하다는 기존 조사와 no-root 조건을 받아들인다. source/test를 신뢰된 native UID로 실행하지 않는 경계를 유지한다. Termux는 trusted controller, Git/SQLite/fixed tools와 **명시적으로 adopted된 capability adapter**만 실행하며, Docker·systemd·root가 필요 없다. repository bytes나 모델이 방금 만든 executable이 단순 등록만으로 controller-trusted adapter가 되지 않는다. adapter가 같은 Android UID에서 실행되면 그 adapter는 그 UID의 trust domain에 들어간다는 사실을 숨기지 않고, hostile/untrusted 실행은 managed sandbox 또는 향후 별도 OS boundary executor로 보낸다. Android/Termux native path의 correctness는 hard-link creation을 요구하지 않는다.

Cloudflare는 public MCP origin, Managed OAuth/Access, 제한된 request routing을 소유한다. DO는 installation당 하나의 WebSocket rendezvous이며 work/validation/queue를 소유하지 않는다. sleep/restart 중에도 edge health와 device-offline을 구분할 수 있지만 device-offline 동안 개발 명령 실행을 보장하지 않는다. D1/R2/Queues, per-repository Worker, changing public tunnel은 필요 없다.

GitHub는 canonical Git/ref protection과 initial managed Linux execution provider다. 현재 검증된 hosted runner + rootless OCI boundary를 회수하므로 Linux container requirement는 **원격 실행 측**에만 있다. source disclosure, provider 비용·용량·cold start는 숨기지 않는다. optional future executor도 동일 isolation/receipt protocol을 만족해야 하며 local trusted-user shell로 조용히 fallback하지 않는다.

## 17. Candidate architectures

공통으로 exact binding/grants, protected canonical ref, immutable Git content, idempotent canonical intent, no forced second model을 요구한다.

### A — cleaned current tdev
Public `context/read/work/observe`. `work`의 create/edit/run/validate/integrate와 현재 revision/generation/prepared identity를 유지하고 docs/release union을 정리한다. read32-query batch, patch original-generation semantics, profile run, managed execution, 현재 H2 leader/member를 유지한다. Termux repository별 ledger, GitHub receipt/CAS, Cloudflare routing은 동일. retry/authority invariants는 강하지만 source/semantic state 감소 폭이 작다. 확장은 profile/union과 Design를 같이 고치는 경향. governance는 네 파일로 바꿀 수 있다.

### B — thin model-led harness
Public `context/read/apply_patch/exec_command/write_stdin/integrate`. workspace selector는 context/patch/exec 공통 input에 포함한다. `exec_command{mode:"diagnostic"|"validate", command|profiles}`가 검증 receipt를 만들고 integrate가 이를 검사한다. kernel sandbox와 credential exclusion은 C와 동일하게 유지하여 위험한 local shell을 비교의 지름길로 쓰지 않는다. explicit tree/revision/CAS/operation persistence도 필요하다. Git/OS/provider 위주의 작고 composable한 core지만 read/write 혼합 stdin과 exec의 validation mode, workspace opening/closing flags가 숨은 schema complexity가 된다. 기본은 per-workspace validation이며 explicit composition이 없으면 동일 ref 경쟁 비용이 남는다. simple registry config로 확장하고 단순 README/architecture를 사용한다.

### C — hybrid typed harness (선택)
공통 primitive를 `context/read/workspace/patch/exec_command/process/validate/integrate/observe`로 나누고, 미래 확장은 하나의 `tdev_capability` stable gateway로 연결한다. 개별 schema와 책임은 §20/JSON에 완결한다. C는 B와 같은 thin execution core에 atomic composition과 typed policy/effect boundary를 추가하되 A의 automatic group settlement는 제거한다. SQLite는 installation 단위, workspace당 한 revision, operation family 하나이며 capability invocation도 같은 operation family를 사용한다. fork/rebase/합성은 exact source checkpoint들을 `workspace.compose`해 새 workspace를 만드는 같은 알고리즘이다. mutable repository execution은 private sandbox, source truth는 local Git checkpoint. provider/OS가 physical lifecycle을 소유한다. 배포와 extension install/enable은 operator plane이다. 새 executor·CLI·MCP·device bridge·artifact provider·advisor는 core workflow를 추가하지 않고 immutable descriptor+adapter binding으로 설치한다.

### D — trusted-local thin shell (기각)
B의 exec를 Termux same-UID로 실행하고 file-path guards/env filtering만 둔다. warm command latency와 engineering cost가 가장 낮을 가능성이 있지만 source command가 controller credential/state에 접근할 수 있다. 신뢰된 모든 repository code와 같은 OS user 전체를 승인한 별도 제품에는 가능하다. 이 세션의 credential/canonical boundary를 만족하지 못하므로 default나 숨은 fallback으로 채택하지 않는다.

## 18. Candidate comparison

정성적 engineering 평가다. 숫자 점수나 가짜 benchmark 순위를 사용하지 않는다.

| 기준 | A | B | C | D |
|---|---|---|---|---|
| 현재 구현 회수 | 가장 큼 | 중간 | 경계 구현 중심으로 큼 | 일부 shell |
| model selection/schema | 이름 적음, union/identity 큼 | 이름 적음, mode flags 큼 | 이름 증가, 의미 경계 명확 | 단순하나 과권한 |
| conceptual/state cost | 높음 | 낮음~중간 | 중간; 자동 owner 제거 | 낮음 |
| multi-file/large read | 이미 가능 | 가능 | native batch/range와 예산 명시 | shell formatting에 의존 |
| same-ref throughput | H2 있으나 member validation/settlement | 재검증 경쟁 위험 | 명시적 compose로 한 번 최종 검증 | correctness 비용 전가 |
| process autonomy | profile 제한 | generic command | generic command + typed receipt | generic command |
| latency/runtime cost | managed startup 비용 | 같은 remote 비용 | warm reuse, 불필요한 ref read 제거 | 낮을 수 있으나 경계 실패 |
| partial failure/retry | 강하지만 많은 owner | caller 규칙 증가 가능 | transaction/operation 단위 명확 | host/process 영향 큼 |
| security/exactness | 강함 | 명시 구현 시 강함 | 필수 유지 | 요구 미충족 |
| engineering/maintenance | 기존 lifecycle 유지 부담 | 작은 core, hidden contract 위험 | 작은 core+검증된 adapter 재사용 | 저렴하지만 다른 제품 |
| 확장성/운용 | 이미 다수 해결 | 적은 abstraction | 반복되는 binding/workspace/handle + stable lazy capability gateway; extension별 core redeploy 불필요 | 동일 UID 확장 제한 |

C를 고르는 이유는 A의 보장을 버리지 않으면서 B의 모델 자율성을 확보하고, 실제로 관측된 같은-ref 검증 비용과 model context overhead를 직접 줄이기 때문이다. remote provider cold start가 전체 시간을 지배하면 tool cleanup만으로 해결되지 않는다. 그 사실은 §31의 별도 cold/warm 측정으로 드러나게 한다.


## 19. Recommended target architecture

제품은 Node.js ES modules, SQLite, native Git, 기존 Cloudflare edge 및 managed Linux executor adapter로 구현한다. 새로운 agent framework나 분산 workflow engine은 도입하지 않는다. Node의 정확한 배포 버전/이미지 digest는 설치 시 고정하며, `node:sqlite`를 사용하는 core에 sqlite3 CLI를 필수로 추가하지 않는다.

source truth는 **immutable Git tree를 가리키는 workspace checkpoint**다. physical worktree는 native 공유 checkout이 아니라 remote command의 disposable private materialization이다. workspace는 `(binding, fullRef, baseCommit, tree, revision, owner, state)`이며 revision 하나만 모델에 노출한다. workspace의 후보와 별도 generation counter를 만들지 않는다.

operation은 durable admission/실행/결과의 동일 family다. validate operation 자체가 receipt identity, integrate operation 자체가 publication intent다. 별도 Result/Effect/Promotion/Case/Drive owner가 없다. executor session은 실제 provider process를 안전하게 찾는 inventory이며 모델이 계획을 유지하는 Task가 아니다.

**warm reuse의 단위는 provider session/승인된 image·immutable dependency cache다.** untrusted mutable container를 서로 다른 command/tenant에 공유하지 않는다. exec 한 번은 private container 하나와 연결된다. interactive command는 같은 operation으로 계속된다. 정상 종료 또는 취소 후 전체 container process가 멈춘 상태에서 변경을 수집한다. provider host가 warm이어도 mandatory validation은 깨끗한 materialization에서 한다.

### Open capability extension plane

public MCP surface는 **9개 core tool + `tdev_capability` 하나**로 고정한다. extension 설치가 `tools/list`에 새로운 이름을 추가하지 않는다. `tdev_context`는 현재 principal에게 보이는 capability의 작은 summary만 반환하고, 필요할 때 gateway의 `list`/`describe`가 exact descriptor를 lazy-load한다. 모델은 descriptor를 읽은 뒤 `invoke`할 action과 args를 스스로 선택한다.

Capability는 `(capabilityId, version, descriptorDigest, role, actions)`의 immutable adopted descriptor와 실제 adapter binding으로 구성한다. `role`은 `executor`, `tool`, `observer`, `presenter`, `artifact`, `advisor` 같은 설명용 문자열일 수 있으나 closed enum이나 authority가 아니다. 미래에 새로운 역할이 생겨도 core schema를 바꿀 이유가 없어야 한다. 각 action descriptor는 input/output JSON schema, required namespaced grants, readOnly/destructive/idempotent/openWorld/asynchronous metadata를 가진다. metadata는 모델 선택과 표시를 돕지만 실제 permission은 current grant와 exact descriptor/action identity가 결정한다.

`invoke`는 항상 모델이 마지막으로 본 `descriptorDigest`를 요구하고 args를 그 adopted action schema로 dispatch 전에 검증한다. side effect가 가능한 호출은 requestId intent를 먼저 저장하고 기존 `operation` family의 `kind=capability`로 관측한다. 작은 typed output은 operation에, 큰 결과는 artifact에 둔다. extension별 Task/Job/workflow owner나 별도 queue를 core에 만들지 않는다. advisor/JEV 같은 결과는 어떤 confidence를 반환해도 권한, mandatory validation, exact integration의 증거가 아니다.

adapter install/enable/disable은 `tdev_capability`가 자기 자신을 확장하는 공개 mutation이 아니라 operator/admin boundary다. 다만 사용자가 명시적으로 새 capability 추가를 요구하고 현재 principal이 해당 admin authority를 가진다면 ChatGPT는 adapter를 정상 tdev 개발 경로로 구현·검증한 뒤 같은 세션에서 admin install을 수행할 수 있다. 설치에는 exact package/entrypoint/descriptor digest, adapter protocol version, 실행 boundary와 필요한 scoped credentials/grants를 고정한다. repository source가 자동으로 trusted extension이 되지 않는다. 설치되지 않은 capability는 startup/schema 비용을 만들지 않는다.

## 20. Public tool contract

### Wire의 단일 소유자

`contracts/tools.schema.json`은 JSON Schema 2020-12 bundle이다. `$defs`와 `x-tools`의 input/output reference를 묶으며, 구현은 각 MCP tool의 input에 필요한 transitive definition만 embed한다. output schema는 이 bundle에 규범적으로 보존하고 서버가 검사하지만 초기 tools/list에는 반복 advertise하지 않는다. root input을 object로 inline하고 필요한 $defs만 포함한 **10개** descriptor의 동일 compact serialization은 이번 계약 갱신에서 **19,745 UTF-8 bytes**였다. 실제 MCP `tools/list` wire bytes와 host token 비용은 단계 1에서 별도로 측정한다. 이는 정적 serialization 측정이며 host token 사용량이나 선택 정확도 실측이 아니다. bundle 전체를 매 tool description에 복제하거나 모델에게 operation registry를 다시 읽게 하지 않는다. root schema는 `{tool,input}` contract fixture를 검사한다. `x-examples`는 실행 결과가 아니라 정적 예시다.

이 section은 의미를 소유한다. JSON의 field/type/required/limit와 아래 의미가 어긋나면 구현 전에 같은 변경에서 둘을 고친다. field가 없는 capability를 “구현자가 알아서” 추가하지 않는다. 정상 응답은 validation의 짧은 summary만 포함하고 full execution/receipt tuple은 권한 있는 artifact read로 lazy-load한다.

### 공통 규칙

- `requestId`는 모든 mutation과 `tdev_capability.invoke`에서 필수다. `(installation, authenticated subject, requestId)`가 unique하다. current authorization 후 기존 request를 찾고, 동일 normalized intent이면 기존 operation을 반환한다. 그 다음에만 새 revision/base/descriptor precondition을 검사한다. 같은 key/다른 내용은 `IDEMPOTENCY_MISMATCH`다. transport wait/output budget은 intent hash에서 제외하고, command/edits/source/policy/capability/action/args 선택에 영향을 주는 field는 포함한다.
- model이 반환한 principal, permission, “approved” 문자열은 authority가 아니다. durable action 이전에 side effect를 시작하지 않는다. request digest는 versioned canonical JSON의 SHA-256이며 현재 source의 검증된 scalar/integer/key-order codec을 회수한다. schema stable defaults만 확장한다. runtime에서 선택한 policy/image는 최초 admission에 한 번 고정하고 replay 때 재선택하지 않는다.
- revision은 unsigned decimal string, Git OID는 `sha1:`/`sha256:` tagged value다. 새로운 설치/retired binding의 old request는 재실행하지 않는다.
- 결과는 `{ok:true,result:...}` 또는 `{ok:false,error:...}`다. command nonzero는 API 호출 자체의 실패가 아니라 `operation.status:"failed"`와 exitCode로 표현할 수 있다. MCP `isError`는 error envelope와 일치시킨다. structuredContent와 동일한 compact JSON text를 제공하되 추가 설명·원래 command·full authority를 중복 dump하지 않는다.
- 초기 read/output 기본 24,000 bytes, 상한 65,536 bytes는 **tdev 자체 budget**이며 ChatGPT의 보편적 host limit이라는 주장이 아니다. transport envelope overhead는 별도 계측한다. mutation 전체 request body는 1 MiB, decoded patch bytes도 합계 1 MiB를 넘기면 prefix 적용 없이 거절한다.
- 거대한 source/log는 pagination한다. cursor는 subject/target/revision/query/position에 MAC-bound된 짧은 token이며 data owner가 아니다. log 읽기는 drain이 아니라 offset read다. snapshot/cursor 기본 유효기간 30분; expired이면 exact workspace나 fresh context로 새 handle을 얻는다.
- read path는 UTF-8 repository-relative이고 절대 경로, `..`, NUL, `.git` control metadata 접근을 거절한다. symlink는 링크의 bytes로 읽고 자동 follow하지 않는다. 실행 materialization은 외부로 나가는 symlink를 거절한다. gitlink/LFS는 명시적인 unresolved capability로 보고하며 실제 내용처럼 검사 PASS하지 않는다.
- capability discovery는 현재 principal에게 authorized된 installed summary만 반환한다. `describe`는 exact immutable descriptor를 반환하고 `invoke`는 그 `descriptorDigest`와 action schema가 현재 adopted state와 같을 때만 dispatch한다. role/description/annotation/advisor output을 권한으로 해석하지 않는다. 공개 tool list는 extension 설치/제거로 바뀌지 않는다.

### 도구별 책임

| Tool | Input의 중심 | Output | Effect / batch / partial / retry / long-run |
|---|---|---|---|
| `tdev_context` | optional bindingId/ref, freshness, cursor | authorized bindings, 선택 snapshot, limits, 자기 open workspace, compact installed capability summaries | semantic read-only. binding/ref와 capability summary를 bounded하게 반환; full extension schema는 포함하지 않음. 선택 ref만 fresh 조회. offline cache는 명시. 같은 요청 재조회 가능; process 생성 없음 |
| `tdev_read` | exact target + 1–32 tagged queries | query별 typed result/error, bytes·coverage·cursor | readonly. file/ranges/list/search/diff/status/history/artifact batch. 한 item 실패는 다른 item을 무효화하지 않음. 전체 budget 소진 뒤 item은 NOT_EXECUTED. cursor retry safe |
| `tdev_workspace` | open: binding/ref/expectedHead; compose: exact source checkpoints+fresh target head; close: workspace/revision | operation summary + new/closed workspace | local durable mutation. compose는 1–16 sources를 하나로 all-or-nothing. open/compose source ingestion이 길면 handle 반환. request replay로 중복 workspace 방지. close는 live writer 있으면 거절 |
| `tdev_patch` | workspace/revision, 1–128 typed edits | operation + new checkpoint + diffstat | all-or-nothing immutable tree publication. replace/put/delete/move; 한 파일의 여러 replacements는 배열 순서대로 staged buffer에 적용. 다른 항목의 중복 path는 거절. 실패 시 revision 불변. request replay safe |
| `tdev_exec_command` | workspace/revision, cmd/cwd/env, initial stdin/tty, capturePaths, network/deadline/yield | operation handle/status, bounded output, 완료 시 새 workspace checkpoint | arbitrary command는 sandbox에서만. natural sequential shell composition 허용, general job DAG 없음. 한 workspace writer를 유지. nonzero여도 안전하게 수집한 변경은 checkpoint; process loss 시 미수집 변경 위험 표시. response loss는 observe/replay, 새 실행 금지 |
| `tdev_process` | operationId + input/sequence, signal, 또는 cancel | operation summary, nextInputSequence, delivery state | explicit process mutation만; empty poll은 observe 사용. input dedup/sequence 강제. cancel은 intent 먼저 저장. stdin crash gap은 unknown, 자동 resend 없음. completed process input 거절 |
| `tdev_validate` | workspace/revision, commit message, optional additionalProfiles | operation; 완료 시 exact commit/tree/policy receipt | mandatory profile set은 서버가 추가·고정. 한 묶음의 결과를 정확히 검증. 진단 exit 0은 대체 receipt 아님. frozen commit을 실행 전 저장. async handle; 실패해도 workspace 유지 |
| `tdev_integrate` | workspace/revision, validationId, expectedHead | operation; exact integratedCommit/observedHead/proof | canonical mutation 유일 경계. 별도 validation/composition 숨겨서 실행하지 않음. unique validation effect + request dedup. commit을 재생성하지 않음. lost response는 같은 intent 관측 |
| `tdev_observe` | operation/request/workspace handles, log cursors, bounded wait | item별 operation/workspace/error, output offsets, suggested poll delay | readonly presentation. remote 상태 관측/cache 갱신 가능; launch/retry/cancel/push를 부수효과로 하지 않음. 여러 handle batch; HTTP 종료가 작업 종료가 아님 |
| `tdev_capability` | `list`, `describe(capabilityId)`, 또는 `invoke(requestId, capabilityId, descriptorDigest, actionId, args)` | authorized summaries / exact descriptor / capability operation | stable extension gateway. 모델이 action을 선택하고 core는 descriptor+grant+schema를 기계적으로 검사한다. invoke는 request dedup 후 adapter에 dispatch하고 기존 operation/observe를 사용한다. extension install/enable/disable은 이 tool의 effect가 아님 |

### Read와 patch의 상세 의미

file은 한 파일의 최대 8개 line/byte range를 받는다. ranges 생략 시 1–200행을 요청한 것으로 처리하되 byte budget을 넘기지 않는다. line range는 1-based inclusive, byte range는 zero-based다. UTF-8 경계를 자르는 byte read는 손실 치환 없이 base64로 반환할 수 있다. 각 chunk는 실제 위치·byte count·range SHA-256, file은 blob OID/size를 돌려준다. 큰 파일의 totalLines는 계산되지 않았으면 null이다. full blob hash/line count를 얻으려고 매 range마다 전체 파일을 읽지 않는다.

search는 literal이 기본, regex는 Rust-regex-compatible engine만 사용하고 PCRE/backreference는 제공하지 않는다. fixed argv의 trusted ripgrep, no config/no follow, frozen read-only cache를 사용한다. match/output뿐 아니라 scanned bytes·deadline도 제한하고 미검색 범위를 cursor로 표시한다. 초기 scan budget 16 MiB/요청, 실행시간 2초, hit 상한 256이다. regex compile error와 budget stop을 “없음”으로 반환하지 않는다. hidden/ignored 포함 여부는 query에 명시한다.

status/diff/history는 source의 Git metadata를 **신뢰된 object store**에서 읽는다. sandbox 안의 `.git` 조작을 source base 변경으로 받아들이지 않는다. exec에는 필요할 때 credential/remote/hook 없는 private Git metadata를 제공하여 `git status/diff/log`가 동작하게 하지만 canonical push 권한은 없다.

patch의 put은 create인지 replace인지 명시하고, delete는 존재하는 단일 leaf, move는 존재하는 source와 absent destination을 요구한다. recursive delete나 자동 overwrite는 없다. replace는 `expectedMatches`를 만족해야 한다. 각 파일 staged buffer를 완성한 뒤 전체 tree를 만든다. Git object를 flush한 다음 SQLite revision CAS로 pointer를 publish한다. 실패나 crash 이전 pointer는 유효하다. directory/type/mode 충돌도 전체 reject한다.

### Errors / confirmation

`category`는 아래 12개 중 하나, `code`는 구체적 안정 코드다. 모든 error에 effect certainty와 retry action을 포함한다.

| Category | 예 |
|---|---|
| CAPABILITY_GAP | unresolved submodule, unsupported executor/PTY/image |
| TOOL_UNAVAILABLE | runtime descriptor에 없는 도구 |
| SCHEMA_OR_CONTRACT_MISMATCH | invalid variant, malformed revision, unexpected field |
| AUTHENTICATION_REQUIRED | human OAuth 없음/만료 |
| PERMISSION_DENIED | valid principal이나 해당 binding/exec 권한 없음 |
| USER_CONFIRMATION_REQUIRED | 운영자가 구성한 실제 approval gate 미충족 |
| SERVER_POLICY_BLOCK | STALE_BASE, STALE_REVISION, WORKSPACE_BUSY, policy changed, unsafe path |
| PLATFORM_SAFETY_BLOCK | host가 명시적으로 보고한 block; 서버가 추측해 붙이지 않음 |
| TRANSPORT_ERROR | not_sent / delivery_unknown / device_offline |
| RESOURCE_OR_QUOTA_LIMIT | capacity/disk/output/admission budget |
| IMPLEMENTATION_ERROR | invariant failure, internal exception |
| UNKNOWN | 근거로 구분할 수 없는 실패 |

동일 “안전검사” 메시지로 합치지 않는다. actual effect에 맞는 annotations를 사용한다. statically readonly인 public tools는 context/read/observe다. `tdev_capability`는 list/describe와 invoke를 한 stable surface에 함께 두므로 tool-level `readOnlyHint=false`이며, action별 readOnly/destructive metadata는 descriptor에서 제공하되 permission으로 사용하지 않는다. mutating tools는 readOnlyHint=false다. metadata는 permission도, confirmation 생략 보장도 아니다 [P2] [P6]. 다른 도구/계정/worker로 host block을 우회하지 않는다.

## 21. Runtime/component topology

```text
ChatGPT (유일한 필수 intelligence loop)
  -> https://tdev.humtr.workers.dev/mcp
  -> Cloudflare Managed OAuth / Access + MCP adapter
  -> installation-scoped routing Durable Object
  <-> outbound authenticated WebSocket
  -> Termux tdev controller (하나의 native service)
       |-- SQLite: binding/grant/workspace/operation/executor/capability
       |-- Git object/checkpoint store + bounded content/log cache
       |-- fixed-argv Git/provider integration client
       |-- capability registry + adapter protocol host
       |      -> explicitly adopted local/external/remote capability adapters
       |      -> optional executors / tools / observers / presenters / artifacts / advisors
       |-- managed executor adapter
       |      -> approved GitHub workflow run / trusted outer runner
       |           -> per-operation untrusted rootless OCI container
       |           -> outer lifecycle/checkpoint/validation receipt
       `-- operator-only configuration/release entrypoint
```

edge는 MCP authentication/shape validation과 bounded forwarding까지만 한다. native controller가 operation authority와 adopted capability descriptor/grants를 결정한다. extension별 public Worker/endpoint나 dynamic MCP tool registration은 만들지 않는다. device transport key만으로 native mutation을 승인하지 않는다. user token은 candidate 환경/command/tool output에 넣지 않는다.

MCP는 negotiated supported version의 Streamable HTTP JSON response를 기본으로 한다. GET SSE를 지원하지 않으면 405, notification은 202, Origin과 protocol version은 검사한다. 초기 구현은 검증된 기존 adapter와 2025-11-25 baseline을 사용하고 이것을 “최신 MCP 규격”이라고 부르지 않는다. host의 더 새 version 협상은 protocol adapter의 호환성 문제이며 business state를 바꾸지 않는다. task-augmented MCP 실행은 core requirement가 아니다. JSON-RPC ID/MCP session ID는 operation identity가 아니다 [P1] [P2].

Termux supervisor는 선택적으로 runit을 쓴다. launcher는 active manifest를 읽고 해당 executable을 exec하는 작은 프로그램이지 또 다른 지속 daemon이 아니다. Android sleep/process kill을 막는다고 약속하지 않으며 wake lock/battery 설정은 운영 안내다. DB/objects는 Termux app-private storage에 두고 공유 Android storage에서 lock/rename 보장을 추정하지 않는다.

remote launch는 승인된 workflow source commit을 가리키는 auxiliary ref를 사용하는 기존 경로를 회수한다. default branch에 workflow가 없는 상황에서 `workflow_dispatch`로 바꾸지 않는다 [T6] [P4]. launch nonce/run_id/run_attempt/approved workflow digest를 join하고, 중복 provider run은 assignment를 받지 못한다. live 또는 ambiguous run의 launch ref는 GC하지 않는다.


remote adapter의 message vocabulary도 고정한다. broker→outer는 `assign`, `input`, `signal`, `cancel`, `inspect`이고 outer→broker는 `started`, `output`, `terminal`, `input_ack`이다. 각 메시지는 operationId와 launch nonce, 선택한 provider repo/workflow commit/run_id/run_attempt에 묶인다. assign은 exact source manifest, sandbox plan/command, deadline과 adopted controller/image identity를 포함한다. output은 stream/byte offset/content digest를 포함하고 동일 offset의 다른 bytes는 integrity error다.

terminal receipt는 container 전체 정지 증명, exit/signal, source/input/output manifest와 profile outcomes를 포함한다. 선택된 run의 OIDC/approved source를 검증한 후 controller가 제공한 per-session key로 outer가 canonical receipt bytes에 HMAC-SHA256을 붙인다. key는 candidate mount/env에 없다. authenticated receipt만 DB에 받아들이며 late callback은 current observer가 exact run을 다시 확인한 뒤 admit한다. checkpoint artifact는 전체 hash/path/type/size 확인과 pointer transaction 전에는 source truth가 아니다. transport 연결 재생성은 이미 admit한 immutable receipt의 유효성을 저절로 없애지 않는다.

`tdev_process`의 request도 control operation row를 갖는다. 그 결과의 `operation`은 control operation이고 `targetOperationId`가 원래 exec/validate/integrate를 가리킨다. input에는 sequence와 delivery state를 보존한다. input marker를 durable하게 저장한 뒤 pipe에 쓰며, 그 사이 crash는 unknown으로 남기고 다시 쓰지 않는다. cancel accepted는 termination 완료가 아니므로 원래 target을 observe한다. control operation은 target의 writer reservation을 대체하지 않는다.

capability adapter protocol v1도 planner가 아니라 얇은 effect transport다. controller→adapter는 `invoke`, `cancel`, `inspect`, adapter→controller는 `accepted`, `output`, `artifact`, `terminal`을 사용한다. 모든 메시지는 capabilityId/version/descriptorDigest/actionId/operationId와 canonical request digest에 묶이고, controller가 args를 먼저 schema-validate한다. adapter가 자체 descriptor나 grant를 런타임 응답으로 바꿀 수 없으며, disconnect는 effect 없음의 증거가 아니다. large output은 hash-bound artifact로 반환하고 bounded inline output만 operation에 저장한다.

## 22. State ownership

| Owner | 사실 / 저장 방식 | 다른 owner와의 경계 |
|---|---|---|
| GitHub Git/ref | canonical content/history/current ref | DB cached head는 timestamp 있는 관측일 뿐 |
| Termux SQLite controller | grants/bindings, adopted capability descriptors/bindings, workspace revision, immutable operation intent/result, selected executor identity | single active process OS lock+WAL/FULL; 네트워크 중 SQL transaction을 잡지 않음 |
| local Git/object store | workspace/receipt에 쓰이는 flushed immutable bytes | unreferenced insertion은 GC 가능, pointer가 content보다 먼저 durable해지지 않음 |
| remote provider + trusted outer spool | physical job/container lifecycle, output/input receipt/checkpoint manifest | temporary per-operation spool은 runner 내부 재연결을 위한 것. logical work나 human authority의 주인이 아님. provider job 손실 이후 생존을 주장하지 않음 |
| Cloudflare Access | identity/OAuth issuance·revocation | grant table의 repository 권한을 대신하지 않음 |
| routing DO | 연결 attachment/nonce/요청 forwarding | job queue, canonical truth, durable result를 소유하지 않음 |
| operator launcher/admin | approved release manifests, active/previous pointer, capability install/enable/disable manifests | 일반 capability invoke나 repository source가 수정할 수 없음 |
| bounded logs/backups | 관측 자료, offline restore | PASS/권한/작업 상태를 로그 텍스트에서 추론해 복원하지 않음 |

SQLite operation은 `queued → running → succeeded|failed|cancelled|uncertain`을 사용한다. uncertain은 자동 재실행 상태가 아니며 exact observation으로 원래 결과를 확정할 수 있다. `step`은 kind별 필요한 checkpoint(예: admitted/launched/checkpointed, prepared/validated, intent/pushed/readback)만 저장하고 새로운 state machine class를 만들지 않는다. retries는 같은 canonical intent 안에서 오직 증명된 safe resend만 한다.

workspace state는 `open|integrated|closed`, revision은 tree/state 변화 때만 증가한다. writer reservation과 마지막 operation pointer는 DB transaction으로 묶는다. log append/poll은 revision을 올리지 않는다. integrated workspace를 다시 열지 않고 follow-up workspace를 만든다.

terminal payload/log는 기본 7일, 로그는 operation당 32 MiB/설치 전체 2 GiB 상한으로 시작한다. 사용자의 미통합 workspace와 unresolved effect는 시간 경과로 삭제하지 않는다. tombstone은 subject/target/request digest/result identity만 compact하게 installation 수명 동안 보존한다. old key를 다시 새 의도로 허용하는 silent TTL은 없다. disk budget 초과 시 신규 mutation만 명시적으로 거절하고 observe/cancel/recovery 여유를 남긴다.

## 23. Normal development flow

예시 ID/OID는 설명용이다. JSON bundle의 fixture가 문법을 검사하며 이 흐름을 실행했다고 주장하지 않는다.

```json
{"tool":"tdev_context","input":{"bindingId":"self","ref":"refs/heads/tdev"}}
{"tool":"tdev_capability","input":{"op":"describe","capabilityId":"example.optional-tool"}}
{"tool":"tdev_capability","input":{"op":"invoke","requestId":"cap-01","capabilityId":"example.optional-tool","descriptorDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","actionId":"inspect","args":{}}}
{"tool":"tdev_read","input":{"target":{"snapshot":"returned-snapshot"},"queries":[
  {"id":"find","kind":"search","query":"validation failed","path":"src","regex":false},
  {"id":"rules","kind":"file","path":"AGENTS.md","ranges":[{"startLine":1,"endLine":80}]}
]}}
{"tool":"tdev_workspace","input":{"requestId":"fix-01-open","op":"open","bindingId":"self","ref":"refs/heads/tdev","expectedHead":"sha1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
{"tool":"tdev_patch","input":{"requestId":"fix-01-edit","workspaceId":"ws-example","expectedRevision":"0","edits":[
  {"op":"replace","path":"src/message.mjs","replacements":[{"oldText":"Bad input","newText":"Invalid input","expectedMatches":1}]}
]}}
{"tool":"tdev_validate","input":{"requestId":"fix-01-check","workspaceId":"ws-example","expectedRevision":"1","message":"Clarify invalid-input message"}}
{"tool":"tdev_observe","input":{"targets":[{"operationId":"op-validation"}],"waitMs":5000}}
{"tool":"tdev_integrate","input":{"requestId":"fix-01-publish","workspaceId":"ws-example","expectedRevision":"1","validationId":"op-validation","expectedHead":"sha1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
```

대상이 알려졌으면 binding/ref를 명시한 context 한 번으로 시작한다. 위 capability 두 줄은 **설치된 optional capability가 실제 작업에 필요할 때만** 사용하는 별도 예시이며 정상 repository 작업마다 실행하지 않는다. context summary로 충분하면 describe도 생략하고, descriptor가 필요할 때만 lazy-load한다. full test를 `exec`로 먼저 반복한 다음 같은 test를 validate에서 다시 실행하는 것은 기본 경로가 아니다. validate를 첫 mandatory test로 쓰고, 실패할 때 필요한 diagnostics만 exec한다.

exec 예시는 `{cmd:"npm run format",cwd:".",network:"none"}`다. admission 후 workspace writer를 예약하고 private container를 만든다. 완료되면 전체 container process 종료를 확인하고 trusted outer가 filesystem diff를 수집한다. controller는 manifest/path/mode/size/hash를 검증하여 새 tree를 flush하고, operation 결과와 workspace revision을 한 DB transaction으로 publish한다. formatter가 nonzero여도 수집된 변경은 보존하고 exitCode를 숨기지 않는다.

수집은 tracked files와 시작 checkpoint의 ignore 규칙으로 결정한 non-ignored new files, 명시적 capturePaths를 대상으로 한다. `.git`/control paths/외부 symlink/device file은 제외·거절한다. capture 한도는 기본 64 MiB, binding hard cap 256 MiB다. 초과 시 부분 import하지 않고 기존 checkpoint를 유지하며 remote artifact와 복구 방법을 보고한다. candidate가 바꾼 Git config/index는 수집 기준이 아니다.

interactive process가 실행 중이면 read는 마지막 **committed checkpoint**와 `busyOperationId`를 보여주며 live filesystem이라고 거짓 표시하지 않는다. 입력/출력은 process handle로 확인한다. command가 종료되기 전의 filesystem 변경은 durable checkpoint가 아니고 runner loss 때 유실될 수 있다. 일반 source editing은 durable patch 경로가 우선이다.


## 24. Failure/recovery flow

### Disconnect / Android suspension
edge가 native에 전달하기 전 실패하면 `not_sent`, 전달 후 결과를 모르면 `delivery_unknown`이다. native에 admission된 operation은 MCP 연결과 무관하게 남는다. 사용자는 requestId/operationId를 observe하거나 동일 요청을 재전송한다. edge/DO는 command를 자체 재실행하지 않는다. native의 restart는 single-writer lock을 얻고 retained executor run을 확인하며 기존 workspace/revision을 그대로 읽는다.

### Stale base / integration conflict
open/compose/validate의 fresh head와 expectedHead가 다르면 부수효과 전 STALE_BASE다. validation 도중 head가 전진했으면 receipt는 역사적 검사 결과지만 현재 통합에는 ineligible하다. 모델이 최신 head를 읽고 `workspace.compose`의 source 하나로 rebase하거나 새 workspace에서 수정한다. 겹치는 path의 base entry가 바뀌었으면 CONFLICT이며 자동 fuzzy merge하지 않는다.

compose는 sources 각각의 immutable `(base, tree, revision)` delta를 target head에 적용한다. 같은 binding/ref, source base가 target head의 ancestor임을 확인한다. 바뀐 path에서 target entry가 해당 source base entry와 같아야 한다. 여러 source가 동일 path를 변경하면 결과가 정확히 같을 때만 하나로 합칠 수 있고 다른 bytes/mode/type은 충돌이다. directory collisions도 실패다. source member state는 고치지 않고 **새 workspace 하나**만 생성한다. 취소된 원본에서 합성을 원하면 명시적으로 retained checkpoint를 선택한 새 요청이어야 한다.

### Test failure
failed receipt와 exit/output은 유지하고 workspace는 open이다. 모델이 필요한 범위만 조사·수정한다. 수정은 revision을 바꾸므로 이전 receipt는 새 bytes의 증거가 아니다. mandatory profile의 실패를 optional diagnostic 성공으로 덮지 않는다.

### Process loss
provider job/run_attempt, launch nonce, container ID와 시작 identity를 join한다. PID만으로 signal/adopt하지 않는다. 통신 단절은 process death가 아니다. surviving exact run은 관측/attach하고, 종료가 증명된 lost run은 failed/interrupted로 확정한다. 불명확하면 해당 workspace writer와 capacity reservation만 유지한다. 다른 workspace/ref 전체를 잠그지 않는다. 자동 재시작이 command를 중복 실행하지 않도록 launch intent가 항상 선행한다.

### Response loss during integration
1. `validate`가 parent H/tree T/message/author/time를 고정한 commit C를 **실행 전에** 만든다. receipt는 binding epoch, workspace/revision, H/T/C, policy/controller/image/dependency identities와 trusted execution 결과에 묶인다.
2. integrate는 current grants/policy/provider boundary와 exact receipt를 검사하고 `(ref,H,C,validationId)` intent를 먼저 저장한다. C의 sole parent=H, Git object hash/tree가 일치해야 한다.
3. 고정 remote에 `git push --porcelain --force-with-lease=<fullRef>:<H> -- <remote> <C>:<fullRef>` 한 번을 사용한다. 이는 history rewrite 허가가 아니라 정확한 expected-value fence다. REST `force:false`나 unqualified lease로 대체하지 않는다 [T7] [P3].
4. ref가 C 또는 verified managed descendant라면 이미 통합됐다. 같은 operation을 finalize한다. H이고 기존 sender 종료가 증명됐으면 같은 C만 재전송할 수 있다. H에서 파생된 다른 head이며 C가 ancestor가 아니면 stale이다. unreadable/incomplete lineage/살아 있을 수 있는 sender는 uncertain이다.
5. provider의 no-delete/no-rewrite와 exclusive normal writer 경계가 깨지면 affected binding의 publication을 fence한다. admin/break-glass 변경은 별도 재등록 없이 신뢰하지 않는다.

requestId가 달라도 같은 validationId에 대한 canonical intent는 unique다. receipt/commit를 재생성해서 중복 publish하지 않는다. 이미 C가 들어간 뒤의 cancel은 `cancellationTooLate`이며 reset/revert를 자동 수행하지 않는다. 한 uncertain operation이 같은 ref의 다른 정확한 CAS를 불필요하게 막지 않는다.

## 25. Multi-repository/concurrency model

installation마다 하나의 controller/DB/endpoint를 둔다. binding row는 stable provider repo ID, sanitized fixed remote, allowed full refs, adopted policy, grants, executor class를 가진다. repository 이름은 display label이다. ref마다 별도 Worker나 daemon은 없다.

새 repo 등록은 operator가 remote identity·allowed refs·policy·source disclosure·grant를 등록하는 한 번의 설정 변경이다. 기존 binding의 다른 허용 ref는 context/open에서 선택한다. 새 repo별 runtime build/배포는 필요 없다. 더 많은 ChatGPT 세션도 자기 authorized workspace/operation을 선택하며 conversation ID를 durable job authority로 사용하지 않는다.

서로 다른 workspace는 mutable materialization을 공유하지 않는다. 같은 workspace는 one writer reservation과 revision CAS를 사용한다. 읽기는 immutable checkpoint에서 병렬 가능하다. source object cache 공유는 권한 공유가 아니므로 조회 때 grants를 다시 확인한다. principal 간 compose/조회는 명시적 공유 grant가 없으면 거절한다.

초기 configurable executionCapacity는 8, 단위는 active/reserved/uncertain execution이다. idle open workspace는 execution slot을 쓰지 않는다. pending bound, disk/log budget, max warm sessions는 별도다. capacity는 데이터 구조의 hard-coded 8이 아니며 1 또는 다른 값으로 바꿔도 계약이 같다. 실제 hardware/provider quota보다 큰 capacity가 병렬 실행 능력을 보장하지 않는다.

scheduler는 queued operation을 principal/binding별 공정하게 고르고 blocked workspace는 건너뛴다. 짧은 SQL admission과 fetch/object maintenance lock만 사용한다. validation/push 동안 전역 lock을 잡지 않는다. slot의 time-to-live만으로 process가 죽었다고 간주하지 않는다. running 작업을 capacity 축소 때문에 임의로 취소하지 않는다. warm provider idle TTL은 초기 60초, lifetime은 provider hard cap보다 짧은 고정 운영 설정이며 benchmark 후 변경한다.

같은 ref의 natural batch는 source workspace N개를 compose하고 resulting workspace 하나를 validate/integrate한다. 원본을 모두 integrated로 자동 settlement하지 않는다. 합성 workspace의 provenance와 receipt가 어떤 exact source revision을 포함했는지 증명하며 원본 정리는 명시적 close다. 이 단순화가 자동 H2 group recovery owner를 없앤다.

capability invocation도 installation-wide scheduler와 operation capacity를 재사용하되 descriptor가 별도 executor를 선언한 경우 그 provider의 실제 quota를 따른다. capability는 특정 repository에 묶일 수도, installation/device 전체에 묶일 수도 있다. 어느 경우든 current subject의 namespaced grant와 exact target을 매 admission에 확인하며, extension role이나 model 판단으로 scope를 넓히지 않는다.

## 26. Security/authorization model

**핵심 trust boundary:** candidate code는 악의적일 수 있다. 모델이 만든 shell string도 native controller에서 실행하지 않는다. Termux의 trusted executable/config/state/credentials와 sandbox filesystem/process/network namespace를 분리한다. Android owner UID 자체가 이미 침해된 상황, provider/OS administrator의 악의적 행동까지 방어한다고 주장하지 않는다.

Access token assertion은 서명/issuer/audience/time/허용 algorithm을 검증하고 human subject를 local grant와 결합한다. transport service credential은 연결에만 쓰며 human write grant를 만들지 못한다. allowlisted subject별 repository/ref/read/write/exec/integrate 권한을 별도로 둔다. email label이나 browser `wfr_...` 요청 header를 human authority로 대체하지 않는다. 권한 폐기는 dispatch/publication 직전에 다시 확인한다.

canonical ref는 등록한 integration principal의 정상 write만 허용하고 deletion/rewrites를 막는다. 다른 writer를 허용하는 repository는 읽기/후보 작업은 할 수 있지만 이 exact canonical-acceptance mode를 허용하지 않는다. 초기 enrollment가 boundary를 확보하지 못하면 integrate capability를 false로 명시한다. Git/HTTP credential은 native client의 scoped secret store에 두고 candidate env/argv/output으로 전달하지 않는다.

remote container는 host socket, controller mount, GitHub token, Access/device secret, cloud metadata/OIDC endpoint를 받지 않는다. trusted outer만 실행 identity와 receipt를 증명한다. rootless OCI, uid/namespace/cgroup limits, no privileged mount, capability drop, egress policy를 사용한다. host run의 workflow code와 image digest는 승인된 source에 고정한다. candidate의 workflow/package script가 그 controller를 교체하지 못한다.

network preset은 `none`, `dependencies`, `internet`이다. 기본 none이고 binding grant가 허용한 preset만 선택한다. dependencies는 승인된 lock/artifact fetch 경로이며 broker는 package bytes만 받아 code를 실행하지 않는다. install scripts는 sandbox 안에서 실행한다. private credential 지원이 없는 package source는 capability gap이지 candidate에 credential을 전달할 이유가 아니다. internet은 명시적 source-disclosure/egress 권한이며 기밀 source 유출 방지 보장과 동시에 주장하지 않는다.

validation의 mandatory command/controller/policy는 operator가 digest로 adopt한다. candidate가 validation policy 파일을 바꿔도 곧바로 채택되지 않는다. 새 policy는 이전 policy로 검사한 commit을 명시적으로 adopt한다. 검증 성공은 **고정한 검사들의 실제 결과**이지 모든 버그/악의적 코드 부재의 증명은 아니다.

destructive boundary는 canonical push, workspace close, process cancellation, release activation, capability install/enable/disable과 extension이 선언한 destructive external effect에 둔다. workspace close는 checkpoint를 즉시 지우는 recursive delete가 아니라 closed 표시다. retention 이후 object GC가 reclaim한다. 명시적 operator authorization 없이 runtime/schema-policy/provider/capability resource를 바꾸지 않는다.

extension security는 **semantic intent 분류가 아니라 adopted contract enforcement**다. core는 command나 action 내용을 보고 ‘안전해 보인다’고 local로 승격하지 않는다. exact capability/action, descriptor digest, current grant, declared execution boundary와 structural precondition만 검사한다. extension은 controller DB/secret store에 직접 쓰지 않고 adapter protocol을 통해 bounded input/output/artifact만 교환한다. controller-trusted local adapter가 필요한 경우 그것은 명시적 operator trust transition이며, arbitrary repository code의 same-UID 실행을 우회적으로 허용하는 수단이 아니다. advisor/JEV/다른 모델의 출력은 어떤 confidence여도 권한·validation receipt·integration proof가 될 수 없다.

## 27. KEEP / REPLACE / MERGE / REMOVE / DEFER matrix

| 검토 요소 | 결정 | 이유 / target |
|---|---|---|
| exact repository/ref/commit identity | KEEP | 모든 source/effect의 의미 |
| fixed argv Git + qualified CAS + readback | KEEP | 검증된 작은 implementation 회수 |
| atomic candidate invariant | KEEP INVARIANT, REPLACE IMPLEMENTATION | workspace revision 한 개; sequential replacements와 one tree CAS |
| batch/range read | KEEP INVARIANT, REPLACE IMPLEMENTATION | source 읽기마다 current-ref 재조회 제거; 범위/hash 비용 제한 |
| four-tool surface | REMOVE | 9개 core effect tool + 1 stable capability gateway로 재선택 |
| tmcp generic Operation registry | REMOVE | core 도구를 직접 호출; registry discovery 왕복 불필요 |
| tmcp shell 자율성 | KEEP INVARIANT, REPLACE IMPLEMENTATION | generic command, 그러나 credential-free sandbox |
| Work/Action/Attempt/Prepared/Effect 노출 | MERGE | workspace + operation family, receipt/effect는 value |
| repository별 SQLite owner | MERGE | installation 단일 DB, per-binding namespace |
| H2 composition benefit | KEEP INVARIANT, REPLACE IMPLEMENTATION | explicit compose + one final validation |
| automatic H2 leader/member settlement | REMOVE | 합성 workspace만 상태 소유 |
| Case/Drive/Agent/capability plan hierarchy | REMOVE | 별도 intelligence loop/작업 owner 불필요 |
| managed outer receipt/launch fencing | KEEP INVARIANT, REPLACE IMPLEMENTATION | 필요한 provider/process join만 adapter에 집중 |
| generic rare recovery machinery | REMOVE | affected operation/binding만 quarantine; 극희귀 사고 수동 |
| process logs/results | KEEP INVARIANT, REPLACE IMPLEMENTATION | cursor replay, bounded retention; drain하지 않음 |
| public release.stage/release.activate | REMOVE | operator plane으로 이동 |
| release identity/quiescence/rollback | KEEP INVARIANT, REPLACE IMPLEMENTATION | approved bundle+active/previous pointer |
| historical schema aliases/migration interpretations | REMOVE | 새 protocol/runtime epoch; current user data만 export/import |
| one-shot cutover implementation | REMOVE | 전환 도구/기록은 그 전환에 한정 |
| AGENTS | KEEP | 작은 navigation, authority policy 중복 없음 |
| DIRECTIVE/RULE/WORKBOARD | MERGE | README 목적/작업 + architecture/test |
| route-map/campaign/Design dependency graph | REMOVE | 작업 진행을 위해 graph 재구성 불필요 |
| verification evidence | KEEP | 필요한 claim별 source/receipt; startup에서 lazy-load |
| Worker/Access/installation DO | KEEP | 실제 ingress/reconnect/auth 요구 |
| D1 Case placement, queue/result provider DB | REMOVE | 현재 target의 local owner와 중복 |
| changing tunnel manager | REMOVE | 안정 public origin/outbound bridge로 충분 |
| stable open capability gateway | KEEP TARGET | extension별 public tool/core workflow를 만들지 않고 lazy descriptor+operation으로 확장 |
| dynamic MCP tool per extension | REMOVE | tools/list/Refresh/schema context를 extension lifecycle과 결합하지 않음 |
| browser/CDP/desktop automation | DEFER AS EXTENSION | coding core dependency가 아니며 필요 시 capability adapter로 추가 |
| local Codex/ACP/subagent/model API | DEFER AS EXTENSION | host가 직접 orchestration; 필요 시 advisor/executor adapter로 추가 |
| writable build-cache reuse, semantic search index | DEFER | 실제 workload 병목이 확인될 때 |
| arbitrary local same-UID candidate execution | REMOVE | 선택한 trust model과 모순 |
| local isolated executor | DEFER AS EXTENSION | 실제 OS boundary가 있을 때 capability/executor adapter로 추가 |
| hard-link-dependent native correctness | REMOVE | Android/Termux portability를 위해 Git object/SQLite/copy/rename 기반으로 구현 |

## 28. Repository-development governance

현재 필요한 저장소 문서는 **AGENTS.md, README.md, ARCHITECTURE.md**, 그리고 declarative **contracts/tools.schema.json** 네 파일이다. 이 개수가 영구 법칙인 것은 아니나 현재는 더 늘릴 이유가 없다.

AGENTS는 README current work와 관련 architecture/contract를 찾는 방법만 말한다. README는 짧은 product intent와 현재 단계/다음 행동/진짜 blocker를 소유한다. 이 문서는 architecture와 분석 근거를 소유하며 전체를 매 세션 읽지 않는다. contract bundle은 wire 필드를 소유한다. chronology는 Git history에 남긴다.

fresh-session의 필수 AGENTS+README 합계 목표는 **6 KiB 이하, navigation 1 hop**이다. 이 계약 갱신 후 실제 합계는 **4,531 UTF-8 bytes**다. 이는 관련 기술 source까지 6 KiB로 제한한다는 뜻이 아니다. 관련 section만 추가로 읽는다. 이 목표가 wrong-route/rework를 늘리면 구체적 실패를 근거로 바꾼다.

작은 구현 변경은 source/test와 현재 작업 상태만 바꾼다. 경계를 바꾸면 해당 architecture section과 schema/test를 같은 commit에서 고친다. 개별 extension은 중앙 architecture 문서를 새로 만들거나 core tool schema를 바꾸는 대신 자기 package의 descriptor/manifest와 필요한 adapter tests를 소유한다. 별도 Design ID/route-map/캠페인 인허가 단계는 없다. 증거는 실제 PASS/FAIL을 뒷받침하는 최소 receipt나 재현 script를 관련 변경에 남기며 historical narrative를 중복 유지하지 않는다.

## 29. Migration strategy

이 설계 publication은 현재 production을 바꾸지 않는다. 실제 전환 때 runtime/provider를 다시 inventory하며 이 문서의 source SHA를 live deployment identity로 간주하지 않는다.

### 회수할 source와 새로 만들 source
dev-2의 identity/canonical encoding, Git object/path routines, qualified CAS, provider-boundary verification, Access assertions, framed transport, trusted outer receipt/managed-session fencing과 관련 regression assertion을 회수한다 [T2] [T3] [T4] [T5] [T6] [T7] [T8]. contract/workspace/operation storage와 generic exec command/checkpoint는 새로 구현한다. tmcp의 process-group/output/permission pattern과 외부 read/exec/patch pattern은 선택적으로 port한다. 실제 code를 복사할 때 upstream license/NOTICE와 pinned source를 보존한다. 이번 branch에는 외부 source를 vendor하지 않는다.

### 보존/폐기할 state
보존 대상은 canonical Git, human principal의 명시적 grants, binding/policy 설정, 사용자가 명시적으로 재채택할 capability package/descriptor manifest, 사용자 미통합 변경, 필요한 immutable receipts와 rollback artifact다. SQLite row를 구조 그대로 migration하지 않는다. old work는 exact base/tree의 Git bundle 또는 manifest export로 보존하고 새 workspace로 import한 뒤 새 controller로 다시 validate한다. old receipt를 새 policy의 PASS로 재라벨하지 않는다.

Case/Drive/old request/epoch/queue/H2 membership/tunnel state와 old plugin/adapter runtime state는 새 core로 import하지 않는다. capability는 exact package/descriptor digest를 새 controller에서 다시 adopt하고 필요한 grant를 명시적으로 복원한다. old log/history는 접근 제한 archive이며 새 runtime의 authority가 아니다. 살아 있는 operation/process는 넘기지 않고 정상 drain/종료 증명 후 전환한다. 중지할 수 없는 genuine live work가 있으면 전환을 보류한다.

### Endpoint와 provider
canonical endpoint/Worker name/Access application은 재사용 후보이고 resource identity/claim shape를 fresh 확인한다. existing routing DO를 protocol-compatible하게 쓸 수 있으면 재사용한다. incompatibility가 있으면 같은 installation route의 generation을 **quiescent cutover**에서 전환하며 old writer를 먼저 fence한다. per-repository endpoint는 만들지 않는다.

Cloudflare D1/old Worker/DO namespace/aux refs는 inventory에서 active/historical/migration/orphan으로 구분한다. 실제 참조가 없는 것이 증명된 resource만 rollback 창 이후 제거한다. source에 이름이 없다는 이유만으로 provider resource를 지우지 않는다.

### Release와 rollback
operator entrypoint는 `tdev-admin binding add/update`, `grant add/revoke`, `policy adopt`, `capability install/enable/disable`, `release stage/activate/rollback`이다. 모두 expected current config/pointer digest를 받는 explicit admin boundary다. capability install은 exact package/entrypoint digest, descriptor digest, adapter protocol version, execution boundary와 allowed scoped-secret references를 고정하고 core source/Worker/tool list를 수정하지 않는다. disable은 새 invoke를 fence하되 이미 admitted된 operation을 성공으로 가장하지 않으며 observe/cancel/reconcile이 끝난 뒤에만 제거할 수 있다. `stage`는 source commit, artifact digest, protocol/schema versions, executable relative path, required acceptance를 manifest에 고정한다. `activate`는 no-live-writer → approved manifest 검증 → active/previous pointer의 atomic 교체 → 실제 PID/executable/bundle digest readback 순서다. bootstrap baseline executable을 고정 경로로 재실행하지 않는다.

rollback은 한 개의 previous verified bundle과 전환 전 state backup으로 한정한다. 처음 전환은 new store를 분리하여 old reader가 new schema를 해석할 필요가 없게 한다. activation 후 새 work가 생겼다면 다시 quiesce하고 exact changes/receipts를 보존해야 한다. canonical Git을 과거로 reset하지 않는다. 새 schema에 대해 old binary가 안전한지 확인하지 않고 pointer만 되돌리지 않는다.

old public tool aliases는 유지하지 않는다. endpoint 전환 뒤 client tool Refresh/OAuth 재인증이 실제로 필요하면 그 user boundary만 요청한다. 다계정 subject grants를 다시 확인하고 service credential로 human acceptance를 대신하지 않는다. new code 개발 ref는 `tdev`이며 main/default-branch promotion은 별도 명시적 결정 전까지 수행하지 않는다.

## 30. Implementation sequence

다음 **7단계**는 새로운 governance checkpoint ID가 아니라 engineering deliverable이다. 전체 architecture를 재발명하지 않고 순서대로 구현한다.

| 단계 | 만드는 것 / 재사용 / 제거 | 확보할 invariant와 충분한 검사 | 다음으로 열리는 것 |
|---|---|---|---|
| 1. Contracts + native workspace/capability vertical slice | JSON contract를 actual handlers에 연결, installation DB/bindings/grants/capability registry/Git tree, context/read/open/patch/observe와 stable `tdev_capability list/describe/invoke` gateway를 구현. 실제 production extension 대신 synthetic no-op/echo fixture adapter로 protocol을 고정. 기존 fixed Git/encoding/edge auth adapter 회수. Work/Task hierarchy 없음 | fixture schema valid/invalid, same-key replay, revision race, path/symlink, crash-before/after pointer, native Termux 재시작, descriptor digest mismatch, unauthorized action, adapter disable/restart. 변경 없는 staging route에서 실제 ChatGPT discovery/read와 gateway describe/invoke; extension install 전후 tools/list 동일 | 모델이 정확한 source를 읽고 durable atomic 변경을 만들며 core redeploy 없이 future capability를 붙일 기본 경계를 확보 |
| 2. Generic sandbox process | 기존 approved managed-runner launch/outer receipt 경계 회수. exec/process/stdin/log cursor/terminated-container checkpoint 구현. profile-only diagnostic run 대체 | native credential sentinel에 접근 불가, cross-workspace escape, launch-response loss, group cancellation, nonzero edits 보존, bounded logs; live 한 번의 formatter/interactive session. control assertions는 container 밖 | 임의 test/build/diagnostic과 source 생성 |
| 3. Validation + exact integration | fixed commit freeze, mandatory profiles, trusted receipt, sole writer boundary, qualified CAS/readback. old full publication workflow 대신 operation 값 사용 | stale-before/after validation, altered tree/policy/receipt 거절, lost push readback, same receipt 중복 integrate, no false PASS. disposable protected ref에서 실제 수정→검사→통합 | **최초 최소 완전 개발 경로. 즉시 one-file/multi-file/search workload 측정** |
| 4. Composition + N-way operation | explicit compose, fair capacity, multiple binding/ref/subjects. H2 automatic group state 제거 | disjoint/overlap/mode/type conflict, source rev freeze, one combined mandatory validation, capacity1과8, 두 repo/two refs, cross-principal denied | 병렬 throughput과 multi-repo 실측; per-repo runtime 복제 없음 |
| 5. Reconnect/운용 다듬기 | delta transfer/cache budget, same executor reattach, edge/offline classifications, bounded restore/GC, capability adapter reconnect/disable semantics. unrelated recovery framework 없음 | actual Termux restart/network drop, provider-terminal proof, output replay, unknown stdin, disk full, revoke-before-dispatch, device cred≠human 권한, one optional real capability adapter의 install→describe→invoke→disable. 최초 전체 workload cohort | 공개 path와 extension path의 운영성과 비용 자료 |
| 6. Release/cutover | 작은 admin release entrypoint/manifest/pointer, exact export/import, 기존 endpoint/Access resource 회수. legacy aliases/state migration framework 없음 | actual activated executable digest readback, two-principal OAuth, no active writer, rollback one bundle, old/new schema 분리. 기존 acceptance 통과 후 실제 전환 | 새 production 경로 |
| 7. Real acceptance + cleanup | 같은 workload production 재확인, state/provider inventory, proven orphan과 transition-only 코드 제거 | 정확한 canonical result/권한/회복 증거, current-work와 실제 상태 일치, archive 접근 제한, source/runtime identity 보고 | 구현 완료 판정과 이후 병목 기반 개선 |

1–3에서 반드시 필요한 stale/credential/duplicate effect boundary는 나중으로 미루지 않는다. 단계 5는 그 경계를 처음 만드는 단계가 아니라 더 넓은 실제 장애 조건을 점검하는 단계다. generic shell·최초 full path를 만들기 전에 완전한 release/migration/benchmark qualification framework부터 만들지 않는다.

## 31. Minimal performance/acceptance methodology

새 benchmark service는 만들지 않는다. fixture repositories 두 개, workload 설명 한 파일, connector/runner의 기존 structured logs와 단순 집계 script면 충분하다. 이 설계 세션에는 workload를 실행하지 않았다.

| Workload | 동일한 성공 postcondition |
|---|---|
| 작은 one-file fix | 기대 diff + mandatory pass + exact canonical commit |
| multi-file refactor | 모든 지정 파일/호출부 변경, full set pass, 원치 않은 변경 없음 |
| search-heavy bug fix | 정해진 결함 해결, 제한된 source 탐색, exact integration |
| test/build failure diagnosis | 원인 설명만이 아니라 수리한 canonical 결과 |
| concurrent independent tasks | N개의 의도 보존; 개별/합성 전략과 actual publication 수 명시 |
| second repository task | 같은 runtime에서 다른 binding/ref 수정·검증·통합 |
| optional capability adaptation | disposable extension 하나를 core source/public tool list 변경 없이 install→lazy describe→invoke→disable하고 exact grant/dedup을 보존 |

각 workload는 같은 starting commit, 비슷한 task 크기, 같은 모델/effort/도구 설명, 권한·validation policy·provider class·네트워크 조건을 고정한다. cold/warm을 섞지 않고 따로 기록한다. 첫 smoke는 각 1회로 correctness를 보고, 성능 결정을 할 때 각 조건 3회 이상 반복하여 개별값과 median/range를 남긴다. 작은 표본으로 유의미한 백분위/보편적 speedup을 주장하지 않는다.

측정값은 success/failure, time-to-first-useful-action, total wall time, tool calls, serialized input/output/schema/context/source bytes, capability summary/descriptor bytes와 lazy-load 횟수, duplicate blob/range reads, process/provider-session starts, Git/provider requests, validations/retries, peak actual parallel executions, held slots, user interventions다. billing data가 없으면 provider busy duration을 달러로 변환하지 않는다. token 사용량이 없으면 byte proxy라고 표시한다.

현재 static 53,706-byte navigation과 새 mandatory startup bytes를 따로 비교한다. source reads까지 혼합하지 않는다. 기존 비용 진단의 6/8과 tmcp local 3/8은 동일 성공 조건이 아니므로 baseline speedup을 계산하지 않는다. 비교 runtime을 재구동하는 비용이 크면 새 core의 absolute measurements부터 보고한다.

합격 조건은 모든 workload의 exact postcondition과 security/correctness checks, 같은 ref composition 1회 최종 mandatory validation, duplicate canonical effect 0, unrelated workspace overwrite 0, missed output 재관측 가능, 두 repository를 위해 deployment 0, disposable capability install/disable 동안 public tool-list 변화 0, capability descriptor mismatch/unauthorized invoke effect 0이다. wall time의 임의 절대 목표는 현재 근거가 없어 정하지 않는다. task success를 희생한 tool-call 감소는 최적화로 인정하지 않는다.

## 32. Targeted verification tasks, only if genuinely necessary

architecture를 결정하기 위한 별도 prototype/worker 실험은 **현재 0건**이다. 기존 source/evidence로 target을 선택할 수 있었다. 구현 단계의 acceptance 중 다음 한 가지 host-dependent 확인만 따로 식별한다.

**QUESTION**
실제 연결된 ChatGPT host가 선택한 **ten-tool stable surface**의 discriminated variants와 bounded batch 결과를 올바르게 discovery/호출/표시하고, extension 설치 후 별도 client Refresh 없이 기존 `tdev_capability`를 통해 새 descriptor/action을 사용할 수 있는가?

**WHY IT MATTERS**
MCP 표준의 JSON Schema 지원과 특정 host의 실제 schema 취급은 다르다. 결과에 따라 wire schema의 표현 방식이 달라질 수 있지만 권한이나 runtime architecture는 바뀌지 않는다.

**MINIMUM CHECK**
단계 1에서 구현한 동일 adapter의 10개 public descriptor를 한 번 Refresh한 뒤 one two-query read와 disposable workspace의 two-file patch를 호출하고 result를 재관측한다. 이어 synthetic capability를 admin install/enable하고 **tools/list를 바꾸지 않은 채** `tdev_capability describe → invoke → observe`를 한 번 수행한 뒤 disable한다. 대규모 benchmark, 별도 agent loop, safety 우회 실험은 하지 않는다.

**RESULT A**
현재 tagged union schema와 typed result, stable capability gateway를 그대로 사용한다. extension 설치/제거는 client tool Refresh를 요구하지 않는다.

**RESULT B**
host가 정상 schema를 처리하지 못하는 것이 확인되면 **10개 tool 수/효과와 stable gateway 선택을 바꾸지 않고**, 해당 tool의 properties를 flat object+required discriminator로 advertise하며 server에서 원래 union과 capability action schema를 엄격 검증한다. schema/result의 작은 변환만 다시 확인한다. mutation을 read-only로 속이거나 다른 tool로 policy block을 우회하지 않는다.

이 확인이 실패할 수도 있다는 점은 미구현 제품의 host acceptance 미완료이지, target architecture 선택 보류가 아니다. PTY packaging·provider capacity·Android restart는 §30의 구현 acceptance이며 별도 architecture research program으로 만들지 않는다.

## 33. Remaining unknowns and risks

**NEEDS TARGETED VERIFICATION:** 실제 host의 schema 표현/Refresh 동작은 §32로 남는다. 현재 source/evidence로 actual live production executable/provider inventory, 미래 provider quota/가격, 새 workload의 speedup을 확정할 수 없다. 이들을 현재 완료로 보고하지 않는다.

**ENGINEERING INFERENCE:** 가장 큰 잔여 성능 위험은 remote cold start와 validation 비용이다. warm provider reuse/explicit composition/중복 ref 읽기 제거로 줄일 수 있는 부분과 provider floor를 분리해 측정해야 한다. 새 surface가 간결해도 모델의 tool-selection 향상을 실측 없이 보장하지 않는다.

가장 큰 구현 위험은 generic exec의 source checkpoint 수집과 stdin crash gap이다. 이를 감추지 않고 exact last checkpoint, whole-container termination, hash/path verification, unknown delivery, no automatic arbitrary replay로 한정했다. uncheckpointed interactive changes의 runner loss는 실제로 유실될 수 있다. Git/DB 손상은 backup과 수동 복구를 필요로 한다.

초기 built-in capability 제한은 unresolved submodule/LFS materialization, arbitrary private-package credential provisioning, local hostile-code execution이다. browser/desktop/device adapters, Blender 같은 application bridge, 새로운 executor, JEV/다른 advisor 모델 등은 **core 미지원 기능이 아니라 설치되지 않은 optional extension**으로 취급한다. 필요 시 새 public tool이나 core workflow를 추가하지 않고 stable capability gateway에 adapter를 붙인다.

open extension plane의 잔여 위험은 gateway가 다시 거대한 generic registry가 되거나 trusted adapter가 controller trust domain을 불필요하게 넓히는 것이다. 이를 bounded summary/lazy descriptor, immutable descriptor digest, namespaced grant, existing operation/observe 재사용, admin-only install, explicit execution boundary로 제한한다. 실제 host가 no-refresh dynamic descriptor 사용을 안정적으로 처리하는지는 §32에서 확인한다.

**최종 판단:** 처음부터 다시 만든다면 ChatGPT의 지능을 다시 구현하지 않고, 자연스러운 batch read·atomic edit·generic sandbox process를 직접 제공하며, immutable workspace와 exact validation/integration에만 필요한 durable correctness를 둔다. 동시에 아직 존재하지 않는 future capability도 core를 다시 설계하지 않고 붙일 수 있도록 9개 core tool + 하나의 stable lazy capability gateway를 둔다. 기능은 extension으로 열어 두되 authority와 correctness boundary는 core에 닫아 둔다. 기존 구현에서 비싸게 얻은 경계는 보존하되, 그 경계를 이해하거나 새 기능을 쓰기 위해 모델이 authority graph 전체를 매번 읽도록 만들지는 않는다.

### Evidence index (분석용 링크, 별도 authority hierarchy 아님)

링크는 mutable branch가 아니라 읽은 source revision에 고정한다. 해당 파일의 모든 line을 조사했다는 의미는 아니며 본문에서 언급한 구현/section을 대상으로 했다. tmcp 링크는 저장소 접근권한이 필요할 수 있다.

[T1]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/AGENTS.md
[T2]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/docs/design/D0002-repository-context-candidates.md
[T3]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/src/storage/ledger.mjs
[T4]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/docs/design/D0003-validation-exact-integration.md
[T5]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/docs/design/D0005-security-execution-boundaries.md
[T6]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/docs/design/D0006-runtime-release-activation.md
[T7]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/src/integration/git-ref.mjs
[T8]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/src/candidate/tree.mjs
[T9]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/docs/evidence/cost-efficiency-diagnostic-20260914/README.md
[T10]: https://github.com/humtr/tdev/blob/05e5ae681c846ac77457dc0bbeb15f67f3a29688/docs/evidence/post-h2-cost-falsifier-20260915/README.md
[H1]: https://github.com/humtr/tdev/blob/afd28533f2ac0edb64639dc637ca8f0600f3ac9e/src/mcp-development-adapter.mjs
[H2]: https://github.com/humtr/tdev/blob/afd28533f2ac0edb64639dc637ca8f0600f3ac9e/src/development-runtime.mjs
[H3]: https://github.com/humtr/tdev/blob/afd28533f2ac0edb64639dc637ca8f0600f3ac9e/src/d1-case-placement.mjs
[M1]: https://github.com/humtr/tmcp/blob/ce3f2a78c98853fba06e4ec1a3b21955283ca4b9/src/process-runner.ts
[M2]: https://github.com/humtr/tmcp/blob/ce3f2a78c98853fba06e4ec1a3b21955283ca4b9/src/execution-plan.ts
[M3]: https://github.com/humtr/tmcp/blob/ce3f2a78c98853fba06e4ec1a3b21955283ca4b9/src/store.ts
[M4]: https://github.com/humtr/tmcp/blob/ce3f2a78c98853fba06e4ec1a3b21955283ca4b9/src/git.ts
[E1]: https://github.com/Waishnav/devspace/tree/531d3f973f09f7b6b4993c9ff58f80a4514b9ba2/src
[E2]: https://github.com/uvwt/agentdock/tree/ad51001515a2b1b82baa31281970e0b9f67f28e9/internal
[E3]: https://github.com/totec448-spec/chat-on-steroids/tree/8f76ccc790917b01ee758da6687a1cf9b576ba8a/src/main
[E4]: https://github.com/Nhahan/WebGPT/tree/a2a4c4f15b62813cc87700b15b34480146775b04/skills/webgpt/scripts
[P1]: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
[P2]: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
[P3]: https://git-scm.com/docs/git-push
[P4]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[P5]: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
[P6]: https://developers.openai.com/api/docs/guides/tools-connectors-mcp

추가 직접 조사 경로: dev-2 `DIRECTIVE.md`, `RULE.md`, `WORKBOARD.md`, `docs/campaign/route-map.md`, `C2-final-tdev-convergence.md`, `docs/ARCHITECTURE.md`, D0001/D0004, `github-boundary.mjs`, `config/validation-profiles.json`, `test/core/cost-efficient-group-recovery.test.mjs`, `test/core/hard-cutover-recovery.test.mjs`, `test/integration/action-deadline.test.mjs`. DevSpace `tool-surfaces/codex.ts`, `process-sessions.ts`, `roots.ts`, `db/schema.ts`, `workspaces.ts`, `local-agent-codex.ts`, `package.json`. AgentDock `app/specs_file.go`, `tool/file/contract.go`, `patch_transaction.go`, `tool/command/contract.go`, `session/runner.go`, `mcp/server.go`, `auth/bearer.go`, `acp/process.go`. CoS `codex/unified-exec.ts`, `apply-patch/index.ts`, `read-backend.ts`, `tool-specs.ts`, `mcp/tools-core.ts`, `mcp/surfaces.ts`, `mcp/inbound.ts`, `sandbox.ts`, `SECURITY.md`, Codex attribution. WebGPT `worker.mjs`, `terminal.mjs`, `browser.mjs`.

[E1-process]: https://github.com/Waishnav/devspace/blob/531d3f973f09f7b6b4993c9ff58f80a4514b9ba2/src/process-sessions.ts
[E1-codex]: https://github.com/Waishnav/devspace/blob/531d3f973f09f7b6b4993c9ff58f80a4514b9ba2/src/local-agent-codex.ts
[E2-command]: https://github.com/uvwt/agentdock/blob/ad51001515a2b1b82baa31281970e0b9f67f28e9/internal/tool/command/contract.go
[E2-patch]: https://github.com/uvwt/agentdock/blob/ad51001515a2b1b82baa31281970e0b9f67f28e9/internal/tool/file/patch_transaction.go
[E3-port]: https://github.com/totec448-spec/chat-on-steroids/blob/8f76ccc790917b01ee758da6687a1cf9b576ba8a/src/main/codex/unified-exec.ts
[E3-security]: https://github.com/totec448-spec/chat-on-steroids/blob/8f76ccc790917b01ee758da6687a1cf9b576ba8a/SECURITY.md
[E3-patch]: https://github.com/totec448-spec/chat-on-steroids/blob/8f76ccc790917b01ee758da6687a1cf9b576ba8a/src/main/codex/apply-patch/index.ts
[E4-worker]: https://github.com/Nhahan/WebGPT/blob/a2a4c4f15b62813cc87700b15b34480146775b04/skills/webgpt/scripts/worker.mjs
[E4-terminal]: https://github.com/Nhahan/WebGPT/blob/a2a4c4f15b62813cc87700b15b34480146775b04/skills/webgpt/scripts/terminal.mjs
