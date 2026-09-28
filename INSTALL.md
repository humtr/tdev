# 처음 설치하기 — Android + Termux

Termux 앱을 설치하고 터미널을 연 상태에서 시작합니다. 별도 Python, Git, 서버 또는
Docker는 준비하지 않아도 됩니다. 인터넷 연결과 패키지·Go 빌드용 여유 공간이 필요합니다.
Termux 자체나 Android 앱을 설치하는 명령은 아니며, Linux 배포판용 설치기도 아닙니다.

## 1. 한 줄로 설치 시작

```bash
bash -c 'set -e; command -v curl >/dev/null || pkg install -y curl; b=$(curl -fsSL --proto "=https" https://raw.githubusercontent.com/humtr/tdev/install/termux-bootstrap/bootstrap.sh); exec bash -c "$b" -- --repo "$1" --ref install/termux-bootstrap' -- https://github.com/humtr/tdev.git
```

이 명령은 지정한 설치 브랜치에서 스크립트를 다운로드한 후 실행합니다. 다운로드가
실패하면 실행하지 않습니다. `curl ... | bash`로 바꾸지 마세요. 설치 질문에 답할 터미널
입력을 유지하기 위해 `bash -c`를 사용합니다. 실행 코드는 먼저
[bootstrap.sh](bootstrap.sh)에서 확인할 수 있습니다.

자동으로 진행되는 순서:

1. Termux 패키지 목록 갱신과 Git, Python/pip, python-rpds-py, Go, clang, make,
   pkg-config, termux-services 설치. 패키지 관리자에 따라 관련 패키지가 갱신될 수 있습니다.
2. `$HOME/.local/share/tdev-source`에 선택한 소스 내려받기와 정확한 커밋 표시.
3. 고정 버전 Python 의존성을 준비·검증하고, 공유 service-daemon이 없으면 시작.
4. 기존 설치기의 설정 질문을 진행한 뒤 Termux용 Tunnel 실행 파일 빌드.
5. tdev 서비스 설치·상태 확인과 `tdev` 명령 등록.

Go 빌드와 패키지 다운로드는 기기·네트워크에 따라 시간이 걸립니다. 소스 폴더는
명령 바로가기가 사용하므로 설치 후에도 유지합니다. 실행 상태와 인증 파일은 소스와
별도로 보관됩니다. 새 설치의 기본 위치는 `$HOME/.local/share/tdev`입니다.

## 2. Tunnel 연결 정보 입력

ChatGPT에서 사용할 OpenAI Tunnel과 runtime API key를 준비합니다. 이 설치기는
원격 Tunnel이나 계정을 만들지 않습니다. 질문에 차례대로 입력합니다.

- **Tunnel ID**: 준비한 `tunnel_...` 식별자.
- **Runtime API key**: 숨김 입력. 채팅이나 명령 인자에 붙여 넣지 않습니다.
- **인증 방식**: 처음 설치할 때 기본인 Tunnel 인증을 선택하면, ChatGPT 연결에서는
  사용자 지정 인증을 `None`으로 선택합니다. Bearer 방식을 선택한 경우 설치 안내를 따릅니다.

Tunnel 없이 로컬부터 시작하려면 이미 받은 소스에서 다음을 실행할 수도 있습니다.

```bash
bash "$HOME/.local/share/tdev-source/bootstrap.sh" --ref install/termux-bootstrap -- --controller-only
```

로컬 설치 후 `tdev connection add`에서 연결을 추가합니다. 이 옵션은 새 설치용입니다.
기존 연결의 인증 방식이나 자격 증명을 재설치로 변경하지 않습니다.

## 3. 설치 확인과 첫 프로젝트 권한

```bash
tdev status
tdev check
tdev
```

상태에서 controller와 사용할 연결을 확인합니다. ChatGPT에서 해당 Tunnel을 연결한 후
도구 목록을 새로 불러옵니다. 로컬 정상 상태와 실제 ChatGPT 호출 성공은 따로 확인합니다.

새 설치는 프로젝트 접근 권한이 없습니다. 예를 들어 `$HOME/projects` 아래의 프로젝트
생성·개발만 허용하려면 다음을 한 번 실행합니다.

```bash
mkdir -p "$HOME/projects"
tdev admin delegate-projects --policy local-projects --local-root "$HOME/projects" --validation 'sh scripts/check.sh' --allow-create
```

이 예제의 프로젝트에는 실제 검사를 실행하는 `scripts/check.sh`가 필요합니다. 다른
프로젝트 종류라면 검증 명령을 정해서 별도 정책을 만드세요. 위 명령은 기존 정책을
덮어쓰지 않습니다. 전체 HOME이나 저장소를 자동으로 위임하지 않습니다.

프로젝트 서비스 배포도 허용하려면 별도로 실행합니다.

```bash
tdev admin delegate-deployments
```

그다음 ChatGPT에 “tdev의 local-projects 범위에 시험 프로젝트를 만들고 검사까지 진행해 줘”라고
요청하면 됩니다. GitHub 저장소를 사용할 때의 인증·위임은
[프로젝트 운영 안내](OPERATIONS.md#project-management-from-chatgpt)를 참고하세요.

## 재실행·문제 해결

같은 한 줄을 다시 실행하면 같은 origin과 선택한 로컬 branch/tag의 깨끗한 소스를
재사용합니다. 원격 최신 커밋으로 자동 pull/reset하지 않습니다. 설치 질문 중 취소하면
준비된 패키지와 소스는 남고, 같은 명령으로 다시 시작할 수 있습니다. 이미 저장된
인증 정보는 기존 설치기가 보존합니다.
이미 소유권 표시가 있는 tdev 서비스가 있으면 시스템 패키지 준비를 건너뜁니다.
기존 실행 환경을 변경해야 하는 경우에는 작업을 정리하고 별도로 패키지를 관리합니다.

| 상황 | 다음 행동 |
|---|---|
| 패키지 저장소 오류 | Termux의 패키지 저장소/인터넷 연결을 확인하고 다시 실행합니다. 필요하면 `termux-change-repo`를 사용합니다. |
| `DEPENDENCY_NATIVE_VERSION` | `pkg update && pkg install python-rpds-py` 후 재시도합니다. requirements.txt와 Termux 패키지 버전이 여전히 다르면 지원 버전 조합을 맞춰야 합니다. 버전 검사를 삭제하지 않습니다. |
| 소스 폴더에 수정·다른 저장소가 있음 | 기존 파일을 보존한 채 중단합니다. 변경을 정리하거나 아래처럼 다른 소스 경로를 지정합니다. |
| 여러 runsvdir 또는 서비스 소유권 충돌 | 기존 Termux 서비스 상태를 확인합니다. 설치기는 기존 서비스를 강제로 정리하지 않습니다. |
| 설치 중단 뒤 복구가 필요함 | `tdev recover` 또는 해당 소스의 `bash install.sh --recover`로 기존 설치 의도를 복구합니다. |
| 인증은 됐지만 프로젝트가 안 보임 | 위의 프로젝트 권한 설정과 현재 연결의 사용 권한을 확인합니다. |

소스 경로·설치 경로·자동화 입력은 아래처럼 분리해서 지정할 수 있습니다. 런타임 키 파일은
사용자만 읽을 수 있는 파일이어야 합니다.

```bash
bash bootstrap.sh --repo https://github.com/humtr/tdev.git --ref install/termux-bootstrap \
  --source-dir "$HOME/tdev-source-other" -- \
  --root "$HOME/.local/share/tdev-other" \
  --tunnel-id tunnel_YOUR_ID --runtime-key-file /private/runtime-key --connector-auth tunnel
```

다른 root를 지정해도 같은 이름의 운영 서비스를 동시에 두 벌 설치하지는 않습니다.
새 branch/tag를 사용할 때는 별도 소스 경로를 사용하거나, 기존 checkout을 직접 검토해
갱신한 뒤 `tdev update`로 설치합니다. 재부팅 후 Termux 세션 시작은 Termux의 서비스
설정을 따릅니다. Termux:Boot 설치·Android 배터리 설정 변경은 자동 수행하지 않습니다.

`uninstall`은 설정·인증·데이터를 보존합니다. 모두 삭제한 후 이 명령을 실행하는 것은
새 설치이며, 이전 작업·배포 데이터 복원은 별도 백업이 필요합니다.

## 배포 전 검증 절차

개발자는 `test_bootstrap`과 영향받는 설치/CLI 검사를 먼저 실행하고 `scripts/check.sh`를
실행합니다. 모의 패키지 관리자와 임시 Git 저장소로 다운로드 실패, 깨끗한 재실행,
수정된 소스 보존, 터미널 입력 유지, 실패한 의존성 준비, 기존 서비스 보존을 확인합니다.
실제 Android native 패키지를 격리된 디렉터리에 준비해 import도 확인합니다.

새 기기/새 Termux 데이터에서의 수용 검증은 위 한 줄 → 숨김 키 입력 → `tdev check` →
프로젝트 위임 → ChatGPT 실제 호출 순서로 수행합니다. 취소 후 재실행, 앱 재시작,
동일 명령 재실행 시 인증 보존도 확인하고 버전·커밋·결과를 기록합니다. 현재 운영
Termux를 지우는 방식으로 검증하지 않습니다. 자동화 검사나 기존 설치본의 정상 상태를
새 기기 수용 성공으로 대신하지 않습니다. 실제 결과는 [검증 기록](LOCAL_VALIDATION.md)에 둡니다.

참고: [Termux 서비스 사용법](https://github.com/termux/termux-services/blob/master/README.md),
[Termux native rpds 패키지](https://github.com/termux/termux-packages/blob/master/packages/python-rpds-py/build.sh).
