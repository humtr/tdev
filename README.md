# tdev
ChatGPT가 repository와 필요한 외부 capability를 빠르고 정확하게 조합해 개발하도록 돕는 model-led MCP harness.

## 제품 목적
개발 성능을 총비용(context·tool 왕복·runtime·engineering·coordination·실패 비용)으로 나눈 값을 높인다. 모델은 탐색·command·수정·진단뿐 아니라 설치된 capability 중 무엇을 언제 사용할지도 결정하고, harness는 repository/ref identity, workspace 격리, credential containment, exact capability/action authorization, mandatory validation과 exact integration을 기계적으로 강제한다. 별도 planner나 semantic safety classifier가 모델의 개발 전략을 대신하지 않는다.

Android/Termux에 하나의 trusted controller를 두고 안정된 Cloudflare MCP ingress와 credential-free managed execution을 사용한다. local root/systemd/Docker와 별도 모델 API는 요구하지 않는다. multi-repository/ref/principal은 binding/workspace/operation의 반복으로 지원한다.

미래의 CLI·MCP·device/API·executor·artifact source·advisor/model을 core 재설계 없이 붙일 수 있어야 한다. 공개 MCP surface는 **9개 core tool + 하나의 stable `tdev_capability` gateway**로 고정한다. extension은 immutable descriptor+adapter binding으로 설치하고, context에는 작은 authorized summary만 노출하며 필요할 때 descriptor를 lazy-load한다. 기능은 확장 가능하지만 extension이 스스로 grant, mandatory validation PASS, canonical integration authority를 만들 수는 없다.

## 현재 작업
- clean-root architecture 선택과 declarative tool contract 작성 완료. 새 runtime은 아직 구현하지 않았다.
- 선택: **model-led hybrid typed harness + open capability extension plane**, public tools 10개. 원격 `tdev`의 빈 root에서 시작했으며 dev-2/main history를 승계하지 않는다.
- extension tool 호출 방식은 **stable capability gateway**로 확정했다. extension 설치/제거는 public `tools/list`를 바꾸지 않고 `tdev_capability list/describe/invoke`를 사용한다.
- 다음 작업: [ARCHITECTURE §30](ARCHITECTURE.md#30-implementation-sequence)의 단계 1부터 구현한다. 단계 1에서 workspace vertical slice와 함께 capability registry/gateway를 synthetic fixture adapter로 고정한다. 새 설계 연구나 governance 계층부터 만들지 않는다.
- 현재 architecture를 막는 미해결 결정은 없다. 실제 host schema acceptance와 no-refresh capability discovery는 단계 1의 작은 확인, 성능 평가는 단계 3의 최초 완전 경로 직후다.
- 기존 production/dev-2, provider, public endpoint는 이 설계 publication으로 변경하지 않는다.

## 필요한 내용만 읽기
전체 근거와 33개 보고 항목은 [ARCHITECTURE.md](ARCHITECTURE.md)에 있다. 구현 대상 component와 관련된 section만 읽는다. core wire field/type/required/limit와 capability gateway/descriptor shape는 [contracts/tools.schema.json](contracts/tools.schema.json)의 해당 `$defs`/`x-tools`가 소유한다. 단계별 구현·acceptance 순서는 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)를 사용한다. 설계 배경, 사용자 우선순위, 비교 레퍼런스나 미래 확장 의도가 필요할 때만 [IMPLEMENTER_REFERENCE.md](IMPLEMENTER_REFERENCE.md)를 참고한다. 두 보조 문서는 ARCHITECTURE/contract의 authority를 대체하지 않는다. 이 JSON은 실행 프로그램이나 배포된 MCP가 아니다.

새로운 source/test가 생기면 이 현재 작업을 실제 상태로 갱신한다. 완료하지 않은 검사·성능·배포를 완료로 기록하지 않는다. 과거 진행 내역은 Git history에 남기며 별도 WORKBOARD/campaign/route-map에 중복 기록하지 않는다.
