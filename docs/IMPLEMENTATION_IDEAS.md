# Terminal Developer 구현 아이디어

> 상태: 초기 구상 문서. 이 문서는 현재까지의 제품 합의를 보존하되, 확정 결정과 초기 기본값, 후속 검증 항목을 구분한다.

## 1. 제품 정의

**tdev = Terminal Developer**

> A durable development control plane for terminal-hosted agents.

`tdev`는 ChatGPT가 장기 작업의 의미와 결정을 소유하고, Cloudflare의 durable coordination 계층과 사용자의 터미널 호스트에서 실행되는 Agent가 파일·Git·빌드·테스트·설치·프로세스 작업을 안전하게 이어서 수행하도록 연결하는 개발 제어면이다.

### 확정 결정

- 기준 호스트는 **Termux / Android ARM64**이다.
- 제품 도메인과 프로토콜은 Termux의 `$PREFIX`, Android 경로, `runit`에 직접 의존하지 않는다.
- 일반 Linux와 WSL을 다음 호환 대상으로 둔다.
- macOS는 별도 host adapter로 확장한다.
- native Windows는 후속 대상이다.

### 초기 지원 등급

| 등급 | 환경 | 의도 |
| --- | --- | --- |
| Tier 1 | Termux / Android ARM64 | 기준 구현과 운영 검증 |
| Tier 2 | Linux, WSL | POSIX 실행 모델 재사용 |
| Tier 3 | macOS | 패키지·서비스 adapter 분리 |
| Later | native Windows | PowerShell·서비스 모델 별도 설계 |

## 2. 전체 구조

```text
ChatGPT
  -> Stateless Cloudflare Worker
       -> WorkDO(workId)
       -> AgentDO(agentId)
       -> D1 registry index
       -> R2 large artifacts
            |
            v
       tdev-agent on terminal host
         -> files
         -> Git
         -> build/test
         -> install/runtime
```

### 확정 결정

- `TdevDO`와 `RealmDO`는 두지 않는다.
- Workspace와 Project는 처음부터 독립적인 lifecycle authority DO로 만들지 않는다.
- Work Contract는 하나의 Project에 종속되지 않으며 여러 Workspace·Project를 대상으로 삼을 수 있다.
- 큰 로그와 Artifact는 R2에 저장한다.
- Workspace·Project·Work·Agent 위치 검색에는 작은 shared registry index를 사용한다.
- 이 index는 state machine이나 lifecycle authority가 아니다.
- 필요성이 실제로 확인될 때만 `ProjectDO` 같은 coordinator를 추가한다.

## 3. 권위 분리

### WorkDO

하나의 immutable Work Contract와 그 아래 Native MCP Tasks의 canonical authority이다.

소유 범위:

- Work Contract와 대상 identity
- Task, Attempt, Event, Input Request, Result, Artifact metadata
- request ID deduplication
- approval과 `input_required`
- cancellation과 terminal immutability
- checkpoint와 session-independent continuation
- Task revision과 canonical transition
- Agent 결과의 최종 수용 또는 거절

### AgentDO

하나의 terminal Agent 연결과 전달 상태의 authority이다.

소유 범위:

- Agent WebSocket
- lease와 connection epoch
- device execution queue
- device-wide concurrency
- dispatch·receipt relay
- fencing token
- reconnect와 stale connection 차단

AgentDO는 Task 완료 여부나 승인을 결정하지 않는다.

### tdev-agent

실제 운영체제 효과를 수행하고 evidence를 반환한다.

소유 범위:

- 파일 읽기·쓰기
- Git 관측과 변경
- bounded process 실행
- build, test, package install
- 서비스와 runtime 수렴
- 실행 receipt, 로그, 결과 digest

같은 Termux UID로 실행되는 Agent 정책은 kernel sandbox가 아니다. Workspace allowlist, typed Operation, exact precondition과 bounded execution으로 권한을 제한한다.

## 4. Native MCP Task 모델

`tdev`는 별도의 공개 Job 도메인을 만들지 않고, Operation 실행 기록 자체를 Native MCP Task로 표현하는 방향을 기본으로 한다.

```text
Work Contract
  -> Task
       -> Attempt
       -> Event
       -> Input Request
       -> Result
       -> Artifact reference
```

### 핵심 규칙

- ChatGPT는 semantic decision owner이다.
- WorkDO는 admission과 durable task transition owner이다.
- Agent는 실제 실행과 evidence producer이다.
- 연결이 끊겨도 Task handle과 상태 조회가 유지되어야 한다.
- 사용자 입력이 필요하면 `input_required` 상태로 보존한다.
- cancellation은 cooperative하되 terminal 결과는 한 번만 확정한다.
- 기존 tmcp의 승인 경계와 tool annotations를 임의로 약화하지 않는다.

## 5. DO 간 전달과 fencing

DO 간 분산 transaction을 가정하지 않는다. 명시적인 recoverable 상태기계를 사용한다.

```text
1. WorkDO가 Task/Attempt와 dispatch_pending을 commit
2. WorkDO가 attemptId 기반 idempotent dispatch를 AgentDO에 전송
3. AgentDO가 queue에 기록하고 현재 epoch의 Agent에 전달
4. Agent가 receipt와 result를 반환
5. WorkDO가 아래 값을 검증한 뒤 결과를 commit
```

수용에 필요한 최소 식별자:

```text
attemptId
agentEpoch
fencingToken
expectedTaskRevision
```

전송 결과가 불명확하면 자동으로 성공을 추정하지 않는다. `dispatch_pending`, receipt, Agent observation을 통해 reconciliation한다.

## 6. 동시성과 로컬 효율

### 확정 결정

- 한 WorkDO는 Work 내부의 transition을 직렬화한다.
- 서로 다른 WorkDO는 병렬 진행할 수 있다.
- AgentDO는 장치 전체의 실제 실행 동시성을 제한한다.
- Termux 기준 고비용 실행 동시성 기본값은 **1**이다.
- progress와 로그는 batching한다.
- 로그 한 줄마다 DO write나 WebSocket 메시지를 보내지 않는다.

### 기대 효과

폰에서 다음 상시 구성요소를 제거한다.

- 로컬 MCP server
- 로컬 durable Task/Job scheduler
- ngrok process
- tunnel supervisor
- route publication과 reconciliation

유휴 상태에는 기본적으로 `tdev-agent`의 hibernation-friendly WebSocket 연결만 유지한다.

단, build·test·package install의 peak CPU·열은 사라지지 않는다. peak 부하는 concurrency 제한, test worker cap, 좁은 검증 우선, evidence 재사용, 향후 다른 Agent 배치로 관리한다.

## 7. 배포와 공개 설치

공식 최초 진입점:

```sh
curl -fsSL \
  https://github.com/humtr/tdev/releases/latest/download/install.sh \
  | sh
```

### `install.sh` 책임

1. host와 architecture 탐지
2. 정확한 GitHub Release 선택
3. release manifest, digest, signature 검증
4. 해당 플랫폼용 `tdev` CLI 설치
5. 별도 setup 로직 없이 `exec tdev setup` 실행
6. TTY가 없으면 CLI 설치 후 `tdev setup` 안내

공개 자산 이름은 `tdev-install.sh`가 아니라 **`install.sh`**로 한다.

### `tdev setup` 책임

- 저장된 Cloudflare 인증 프로필 탐색과 검증
- 기존 tdev-managed deployment 발견과 재사용
- 필요할 때만 새 Cloudflare 자원 생성
- Worker, WorkDO, AgentDO, D1, R2, secrets 구성
- terminal host Agent 설치와 enrollment
- 초기 Workspace root 등록
- 선택적 GitHub 인증 안내
- end-to-end probe
- ChatGPT MCP 등록에 필요한 endpoint와 token 출력
- 중단 후 다시 실행 가능한 setup journal 유지

ChatGPT의 MCP 등록은 사용자가 직접 수행한다.

## 8. Wrangler 없는 Cloudflare 배포

Termux에서는 Wrangler를 요구하지 않는다. GitHub Release에 미리 빌드된 edge bundle과 deployment manifest를 포함하고 `tdev` CLI가 Cloudflare REST API를 직접 호출한다.

### 기본 `workers.dev` 배포 토큰 권한

```text
Workers Scripts — Edit
D1 — Edit
Workers R2 Storage — Edit
```

기본 배포에는 DNS, Zone, Workers Routes 권한을 요구하지 않는다. custom domain을 선택할 때만 별도 권한을 요청한다. Global API Key는 지원하지 않고 scoped API Token만 지원한다.

Termux UX:

```text
1. Account ID 확인 안내
2. 최소 권한 token template URL을 브라우저로 열기
3. 사용자가 token 생성
4. token을 hidden TTY input으로 붙여넣기
5. 권한과 account를 검증
```

## 9. 인증 프로필과 반복 설치

Cloudflare 인증은 deployment에 종속된 일회성 입력이 아니라 장기 재사용 가능한 사용자 프로필이다.

```text
Cloudflare profile
  profile name
  account ID
  scoped API token
  verified permissions
  last verification
```

### 확정 결정

- 기본적으로 Termux private home의 mode `0600` 파일에 보존한다.
- `setup`, `deploy`, `upgrade`, `destroy`에서 자동 재사용한다.
- token 부재, 폐기, 만료, 권한 부족, account 변경 때만 다시 입력한다.
- Cloudflare API Token을 Worker, DO, Agent, Task input, argv, 로그에 전달하지 않는다.
- 같은 UID 프로세스가 파일을 읽을 수 있다는 한계를 문서화한다.

고급 관리 명령 후보:

```text
tdev auth add
tdev auth list
tdev auth status
tdev auth use
tdev auth update
tdev auth forget
```

## 10. 기존 deployment 재사용

`tdev setup`의 기본 탐색 순서:

```text
1. 로컬 deployment manifest
2. Cloudflare의 tdev-managed deployment descriptor
3. 실제 Worker bindings와 resource identity 비교
4. 하나면 자동 재사용
5. 여러 개면 사용자 선택
6. 없으면 새 deployment 생성
```

단순히 `tdev-*` 이름만 같다는 이유로 자원을 채택하지 않는다. 검증 가능한 `deploymentId`, product marker, schema version, Worker·D1·R2 identity가 일치해야 한다.

기존 deployment를 재사용할 때는 MCP endpoint와 bearer token도 유지해 ChatGPT 설정 변경을 피한다.

## 11. GitHub 통합

GitHub 인증은 공개 설치와 기본 Cloudflare 배포에는 필수가 아니다.

- 공개 release 다운로드와 public clone은 인증 없이 가능하다.
- local `git` credential 또는 SSH가 있으면 fetch·push가 가능하다.
- `gh` 인증이 있으면 private repository, PR, issue, Actions, release 기능을 제공한다.
- GitHub credential은 terminal Agent만 사용한다.
- Worker와 DO에는 GitHub token을 저장하지 않는다.
- setup에서 선택적으로 `gh auth login --web`을 안내한다.

## 12. 삭제와 복구 의미

```text
tdev uninstall
  CLI, Agent binary, 서비스, 캐시 제거
  Cloudflare auth profile, deployment, MCP credential은 기본 보존

tdev destroy
  선택한 Cloudflare deployment 제거
  Cloudflare auth profile은 기본 보존

tdev auth forget / purge
  명시적으로 auth profile과 recovery 정보를 제거
```

반복 개발의 기본값은 삭제가 아니라 보존이다.

```text
CLI 재설치
  -> 기존 profile 재사용
  -> 기존 deployment 재사용
  -> 기존 Agent identity가 있으면 재사용
  -> MCP endpoint/token 유지
```

Termux 앱 데이터가 완전히 삭제된 경우를 위해 암호화된 profile export/import를 후속 기능으로 검토한다. Agent private key는 기본 export 대상에서 제외한다.

## 13. 릴리스와 공급망

하나의 release manifest가 다음을 정확히 결합한다.

```text
tdev CLI
tdev-agent
Worker bundle
WorkDO/AgentDO schema
D1 migrations
protocol compatibility metadata
checksums/signature
```

`latest`는 release 선택에만 사용한다. 선택 후 모든 자산은 immutable version URL과 manifest digest로 내려받는다.

초기 release 자산 후보:

```text
install.sh
release-manifest.json
SHA256SUMS
signature
platform-specific tdev archives
edge bundle
D1 migrations
```

사용자 호스트에서 Node.js, npm, Wrangler 또는 source build를 요구하지 않는다.

## 14. 초기 저장소 구조 제안

```text
cmd/
  tdev/
  tdev-agent/
edge/
  worker/
  work-do/
  agent-do/
agent/
  core/
  hosts/
    termux/
    linux/
    wsl/
    macos/
domain/
  work/
  task/
  attempt/
operations/
deploy/
  cloudflare-api/
  migrations/
packaging/
docs/
```

언어와 build system은 별도 결정으로 남긴다. 첫 구현에서는 domain transition을 Cloudflare와 host adapter에서 분리해 테스트 가능하게 만드는 것을 우선한다.

## 15. 초기 구현 순서

1. Work Contract와 Native MCP Task transition의 순수 domain model
2. WorkDO SQLite storage adapter와 request dedupe
3. AgentDO와 hibernatable WebSocket protocol
4. 최소 Termux Agent와 fenced read-only Operation
5. attempt receipt·result reconciliation
6. Cloudflare REST deployment client
7. `install.sh`와 재개 가능한 `tdev setup`
8. Git/file/build/test Operation 확장
9. R2 Artifact와 작은 D1 registry index
10. upgrade, rollback, Agent replacement, destroy
11. Linux/WSL host adapter

## 16. 후속 검증 항목

아직 확정하지 않은 항목:

- 구현 언어와 monorepo build tool
- D1 registry가 필요한 최소 시점과 정확한 schema
- Native MCP Task protocol의 최종 negotiation 세부사항
- WorkDO와 AgentDO의 event retention·compaction 정책
- Agent key storage와 encrypted recovery bundle 형식
- release signing 기술과 key rotation
- Cloudflare API token template의 정확한 account scoping UX
- Android background 제한과 wake-lock 기본 정책
- multi-agent scheduling과 비용·열 기반 placement

이 항목들은 구현 전 ADR 또는 검증 실험으로 확정한다.
