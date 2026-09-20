# 작업 진입
먼저 README의 제품 목적과 현재 작업을 읽는다. 수정할 component에 관련된 ARCHITECTURE section과 contract definition만 추가로 읽는다. 단계별 실행 세부가 필요하면 IMPLEMENTATION_PLAN.md, 사용자 의도·비교 레퍼런스·미래 확장 배경이 실제 판단에 필요할 때만 IMPLEMENTER_REFERENCE.md를 읽는다. 두 파일은 보조자료이며 현재 README/ARCHITECTURE/contract를 대체하지 않는다. 매 세션 전체 evidence/history를 읽지 않는다.

새 tdev는 clean-root 설계다. dev-2의 AGENTS/DIRECTIVE/RULE/Design hierarchy는 분석 근거이지 이 branch의 자동 authority가 아니다. 현재 사용자의 승인 범위와 실제 저장소/권한을 확인하고 그 범위에서 작업한다.

wire field/type은 contracts/tools.schema.json, 설계 의미는 ARCHITECTURE.md, 현재 작업은 README.md에 한 번만 기록한다. 코드로 강제할 invariant는 tests로 검증한다. 작은 변경마다 새 campaign/Design/authority owner를 만들지 않는다.

지금은 design-only 결과다. 구현은 ARCHITECTURE §30 순서를 따른다. 생산 runtime/provider 변경은 구현·검증·명시적 권한 없이 수행하지 않는다. 결과는 해당 변경의 가장 작은 충분한 검증으로 확인하고 실행하지 않은 검사를 PASS라고 쓰지 않는다.
