# Installed ChatGPT development journey

Use after local installed packaging acceptance. This is a workload/acceptance guide, not a
new tool contract or a claim that ChatGPT has already passed it. Read current repository
instructions and discovered tools; current user intent and actual grants bound every effect.
The local CLI's --connection selector is not needed inside a connected ChatGPT session.

## Fresh-session continuation check

Run this small read-only check after refreshing the installed connector and opening a new
ChatGPT conversation. It verifies the human-name path without repeating the completed package
journey. Local MCP readback is already recorded; actual model selection and visible delivery
still need the connected host.

```text
현재 연결된 tdev로 pkg-chatgpt-20260930-a1의 작업 상태를 재발견해라.
내부 ID는 내가 제공하지 않는다. 새 작업·빌드·게시·배포를 시작하지 마라.
실제 주입 도구에서 request envelope와 tdev_find를 확인한 뒤,
프로젝트 이름으로 state:all 검색해 두 작업의 label을 보여라.
임의로 최신 작업을 선택하지 마라. a1-source label로 좁혀 원본 source 작업을
조회하고, 반환된 원본 publication receipt만 관찰해 완료 상태를 인정해라.
닫힌 task, 정리된 ref, 완료 receipt와 실행 가능한 artifact를 구별해라.
기존 완료 효과를 재실행하지 마라. 호출 수와 실제 응답, 선언 가시성,
화면 진행 여부와 관측 불가 항목을 구분해서 보고해라.
```

The user-reported 2026-09-30 run passed this bounded check in three read calls with no user-supplied
internal IDs; local installed state independently matched. See
[the dated report](../../LOCAL_VALIDATION.md#actual-fresh-chatgpt-material-recovery-report--2026-09-30).
This is a recorded result for that run, not automatic acceptance of future conversations.

Expected material readback: the project-only query is ambiguous between source and failed-switch
work; `label:"a1-source"` resolves the closed published predecessor, with no outstanding operation.
Its managed ref is cleaned and retained artifacts are pruned. Receipt success does not mean its
payload still exists. The historical unknown publication in the tdev project is unrelated and
must remain unresolved. This check does not by itself close the two-project workload below.

## Prompt for the working ChatGPT session

```text
현재 연결된 tdev로 실제 개발·패키징·배포 전체 흐름을 검증한다.
현재 humtr/tdev의 README, AGENTS, 관련 ARCHITECTURE/contract와
examples/chatgpt/CONTROLLER.md를 읽고 현재 도구를 재확인한다.
Local Codex의 설치본 검증 결과를 이 ChatGPT 세션의 성공으로 대체하지 않는다.

먼저 tdev_find로 이름/목표에 맞는 기존 작업과 완료된 predecessor를 확인한다.
이미 완료된 packaging acceptance를 재실행해서 측정을 채우지 않는다. 아래 전체
실험은 새로운 one-/two-project 목적이며, 기존 효과의 replay가 아니다.
기존 사용자 프로젝트와 분리된, 현재 위임된 local project 범위의 시험 프로젝트를
만든다. 프로젝트 이름에는 새 run 식별자를 사용하고 소유한 작업·서비스·결과물 ID를
기록한다. 현재 권한으로 가능한 시험만 수행한다. 권한이 부족하면 해당 지점만 보고하고
독립적으로 가능한 작업을 계속한다. private config나 credentials를 변경하지 않는다.

1. 단일 프로젝트로 먼저 실제 흐름을 끝낸다.
   작은 Python HTTP 앱에 고정된 pure-Python 의존성과 생성 파일을 포함한다.
   examples/python-package와 scripts/rehearse_artifact_deployments.py의 앱·패키지
   구조를 참고하되, fixture 내부 Controller나 FakeRunit을 실행한 결과로 대체하지 않는다.
   현재 위임된 validation 명령을 유지하고 소스와 패키지에서 실제 검사를 수행한다.
   소스 수정 → 실행/디버그 → 검증 → 위임된 시험 저장소에 게시/읽기 확인 →
   패키지 준비 → 보관된 결과물 검증 → 시험 서비스 배포 → 실제 release 식별자 확인.
   소스 게시에는 소스 validation receipt, 배포에는 artifact validation receipt를 쓴다.
   원본 task가 게시로 닫혀도 기존 validation과 artifact의 정당한 수명주기를 따른다.

2. 독립성을 확인한다.
   정상 API로 증명된 stopped 작업의 임시 공간과 시험용 의존성 공간을 정리한 후에도
   패키지가 실행되는지 확인한다. 업데이트·롤백·중지·재시작·제거와 앱 데이터 보존,
   파일 내보내기·해시 확인·prune 보호를 검증한다. 실패 복구는 기존 Local Codex
   증거를 먼저 참고하고, 추가 장애 주입이 꼭 필요한 이유가 없으면 반복하지 않는다.
   controller/Tunnel/observer를 재시작하거나 기존 사용자 데이터를 지우지 않는다.

3. 두 번째 독립 local project를 같은 시험 workspace에 붙인다.
   첫 프로젝트가 만드는 명시적인 버전/데이터 계약을 두 번째 프로젝트가 소비하는
   작은 변경을 만든다. 양쪽을 각각 검증·게시하고 조합 결과를 확인한다.
   두 저장소의 게시나 배포를 원자적이라고 주장하지 않는다. 한쪽이 실패하면
   이미 완료한 쪽을 중복 실행하지 않고 현재 durable 상태에 따라 진행한다.

작업 도중 실제 결과와 다음 행동을 짧게 사용자에게 알린다. 짧은 physical cell,
전체 nested attempt 예산, sparse witness 예약은 CONTROLLER.md를 따른다.
예산을 채우기 위한 polling을 하지 않는다. return을 받은 assistant가 다음 cell을
발행하는 것이며 tdev가 host scheduling을 보장하는 것은 아니다.

기존 diagnostic inspect에서 instance/coverage를 확인한 후 marker가 실제 사용
가능할 때만 cell_enter/tool_return/cell_exit를 남긴다. marker 오류로 development
작업을 재시도·취소하지 않는다. response metadata가 없으면 afterRequest를 추측하지 않는다.
새 observer를 띄우거나 기존 관측 설정을 바꾸지 않는다. 육안 화면 상태는 사용자가
보고한 사실로만 기록한다. backend COMPLETE는 visible success가 아니다.

결과가 불명확하면 original requestId/operationId를 조회한다. 새 requestId로
같은 효과를 재시도하지 않는다. 새 세션에서는 프로젝트·workspace·task·operation의
현재 상태를 확인한 뒤 이어간다. 추가 resume-note 기능 없이 기준선을 측정한다.
사용자 Stop 또는 새 지시가 있으면 이를 존중한다. 별도 Stop 실험은 수행하지 않는다.

마지막에 자신이 만든 시험 서비스를 제거하고 task/environment/managed ref와
prune 가능한 artifact를 정상 API로 정리한다. 앱 데이터·역사 기록은 보존하고
남은 자원의 위치와 이유를 보고한다. 불명확한 효과는 정리했다고 주장하지 않는다.

보고: 실제 성공/실패 단계, 원본 operation과 source/artifact/release 식별자,
새 세션에서 첫 올바른 작업까지의 호출 수, 수동 ID/config 개입, 관측 가능한 응답량과
진행 간격, 사용자-visible 사실, 현재 남은 자원과 문제를 각각 구분한다.
측정할 수 없거나 실제 재접속이 없었다면 해당 항목은 미검증으로 남긴다.
```

## Observation and completion

The existing independent local observer is a server-side witness. Before the actual host run,
Local Codex can record its current availability/coverage and retain the matching time window;
if it is stopped or stale, record the coverage gap and arrange an explicitly selected local
observer start before claiming independent live capture. A path containing old samples is not
evidence of a running observer. Useful development may proceed with that limitation explicit;
it does not create the ChatGPT host witness or infer the UI. An optional second ChatGPT session
may inspect the recorded operation IDs without messaging the working session. Its status reads
can reconcile state and do not prove that the first session is live.

Keep one packet with four separate timelines: server/operation, caller markers, independent
observer, and user-visible observations. Record real refresh/reconnect only if it happens; do
not invent success or induce Stop trials. A visible stall leaves that acceptance dimension open
even if every backend effect succeeds. Local work may continue from retained state, but actual
ChatGPT execution and visible observations require the real connected host and user.

Completion requires both project results, exact publication readback, packaged runtime identity,
resource cleanup accounting, and an honest client/visible-continuity assessment. The baseline
may reveal a specific blocking defect; retain that result rather than adding unrelated features.
