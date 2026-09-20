# 작업 진입

먼저 README의 제품 목적과 현재 작업을 읽는다. 수정할 component의 ARCHITECTURE
section과 contracts/tools.schema.json definition만 추가로 읽는다. 실행 순서는
IMPLEMENTATION_PLAN.md를 따른다. 현재 사용자 지시와 실제 권한이 작업 범위를 정한다.

README는 현재 상태, ARCHITECTURE는 설계 의미, contract는 wire type을 한 번만
소유한다. AGENTS는 navigation이다. 과거 dev-2/tmcp 구현은 evidence이지 authority가
아니다. 작은 변경마다 campaign/Design/새 authority owner를 만들지 않는다.

invariant는 tests로 고정한다. focused/affected test 후 scripts/check.sh를 실행한다.
실행하지 않은 검사를 PASS라고 쓰지 않는다. 생산 runtime/provider 변경은 구현·검증·
명시적 권한 없이 수행하지 않는다. user change와 unrelated dirty state를 보존한다.
