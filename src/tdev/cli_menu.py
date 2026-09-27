"""Terminal navigation only: return existing commands, never execute effects."""
import sys


# Each item is (label, existing command or submenu). Keep operator effects in cli.py.
MENUS = {
    'main': ('tdev', [
        ('전체 상태', ['status']), ('연결 / 인증', ['connection']),
        ('진단 / 옵저버', ['diagnostics']), ('작업 조회', ['work']),
        ('설치 / 관리', ['maintenance']),
    ]),
    'connection': ('연결 / 인증', [
        ('연결 목록과 상태', ['connection', 'list']),
        ('연결 추가', ['connection', 'add']),
        ('인증 방식 변경', ['connection', 'mode']),
        ('Bearer 토큰 복사', ['connection', 'token']),
        ('연결 상세', ['connection', 'inspect']),
        ('연결 활성화', ['connection', 'enable']),
        ('연결 비활성화', ['connection', 'disable']),
        ('이름 변경', ['connection', 'rename']),
        ('토큰 교체 / 폐기 / 연결 제거', ['credentials']),
    ]),
    'credentials': ('연결 자격증명 관리', [
        ('토큰 교체 — 기존 전용 토큰 폐기', ['connection', 'rotate']),
        ('토큰 폐기 및 연결 비활성화', ['connection', 'revoke']),
        ('연결 제거', ['connection', 'remove']),
    ]),
    'diagnostics': ('진단 / 옵저버', [
        ('서버 진단 조회', ['diagnostics', 'inspect']),
        ('로컬 옵저버 관리', ['observer']),
        ('상세 진단 도구 사용법', ['schema', 'diagnostics']),
    ]),
    'observer': ('독립 로컬 옵저버', [
        ('기록 상태 조회', ['observer', 'status']),
        ('연속 기록 시작', ['observer', 'start']),
        ('연속 기록 중지', ['observer', 'stop']),
    ]),
    'work': ('작업 조회', [
        ('작업', ['task']), ('프로젝트', ['project']),
        ('워크스페이스', ['workspace']), ('실행 상태', ['operation']),
    ]),
    'maintenance': ('설치 / 관리', [
        ('설치 상태 검증', ['check']), ('설치', ['install']),
        ('현재 소스로 운영본 업데이트', ['update']),
        ('중단된 설치 / 연결 변경 복구', ['recover']),
        ('이전 운영본으로 되돌리기', ['rollback']),
        ('운영 서비스 제거 — 데이터 보존', ['uninstall']),
        ('tdev 단축명령 설치', ['link']),
    ]),
    'task': ('작업', [('목록', ['task', 'list']), ('ID로 상세 조회', ['task', 'inspect'])]),
    'project': ('프로젝트', [('목록', ['project', 'list']), ('등록 저장소 ID로 상세 조회', ['project', 'inspect'])]),
    'workspace': ('워크스페이스', [('목록', ['workspace', 'list']), ('ID로 상세 조회', ['workspace', 'inspect'])]),
    'operation': ('실행', [('ID로 실행 상태 조회', ['operation', 'status'])]),
}


class ExitMenu(Exception):
    pass


def show(group, stream=None):
    title, items = MENUS[group]
    stream = stream or sys.stdout
    print(title, file=stream)
    for i, (label, command) in enumerate(items, 1):
        print(f'  {i}. {label}  (tdev {" ".join(command)})', file=stream)
    print('  0. 뒤로 / 종료    q. 종료', file=stream)


def choose(title, labels, ask):
    while True:
        print('\n' + title, file=sys.stderr)
        for i, label in enumerate(labels, 1):
            print(f'  {i}. {label}', file=sys.stderr)
        print('  0. 뒤로 / 종료    q. 종료', file=sys.stderr)
        value = ask('선택: ').strip().lower()
        if value == 'q':
            raise ExitMenu
        if value == '0':
            return None
        if value.isascii() and value.isdecimal() and 1 <= int(value) <= len(labels):
            return int(value) - 1
        print('목록의 번호를 입력하세요.', file=sys.stderr)


def connection(manager, ask):
    from .connection_model import entries
    rows = list(entries(manager.settings()).values())
    if not rows:
        print('등록된 연결이 없습니다. tdev connection add 로 추가하세요.', file=sys.stderr)
        return None
    labels = [f"{c['name']} — {'no-auth' if c['authMode']=='tunnel' else 'bearer'}, "
              f"{'활성화 설정' if c['enabled'] else '비활성화 설정'}" for c in rows]
    index = choose('연결 선택 (설정 기준)', labels, ask)
    return rows[index]['id'] if index is not None else None


def navigate(group, ask, pick_connection):
    stack = [group]
    while stack:
        title, items = MENUS[stack[-1]]
        index = choose(title, [label for label, _ in items], ask)
        if index is None:
            stack.pop()
            continue
        label, selected = items[index]
        command = list(selected)
        if len(command) == 1 and command[0] in MENUS:
            stack.append(command[0])
            continue
        if command[0] == 'connection' and command[1] not in ('list', 'add'):
            ident = pick_connection()
            if ident is None:
                continue
            command.append(ident)
        elif command[0] in ('task', 'project', 'workspace', 'operation') and command[1] != 'list':
            ident = ask('등록 저장소 ID (목록의 repo), 빈 입력은 뒤로: ' if command[0]=='project'
                        else 'ID, 빈 입력은 뒤로: ').strip()
            if not ident:
                continue
            command.append(ident)
        if command[0] in ('rollback', 'uninstall') or command[:2] in (
                ['connection', 'rotate'], ['connection', 'revoke'], ['connection', 'remove']):
            if (ask(f'{label} 실행? [y/N]: ') or 'n').lower() not in ('y', 'yes'):
                continue
        return command
    return []
