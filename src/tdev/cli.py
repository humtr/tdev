"""Human local CLI and authenticated MCP client. Secrets never enter argv or JSON receipts."""
import argparse
import hmac
import json
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

from .common import Fault, atomic_write, canonical, digest, private_file, require
from .installer import default_root
from .installer_setup import answer, interactive


ALL_HELP = '''tdev — local development and connection management

  tdev                         interactive menu (help when not a terminal)
  tdev connection|diagnostics|observer|work|maintenance   category menus
  tdev status                  controller and connection status
  tdev install                 guided installation; optionally add first Tunnel
  tdev update [SOURCE]          install a qualified local source checkout; optional --allow-unknown-publish OPERATION_ID
  tdev check | recover | rollback | uninstall
  tdev connection list
  tdev connection add           prompt for name, Tunnel ID, hidden runtime key, mode
  tdev connection inspect NAME
  tdev connection mode NAME [bearer|no-auth]
  tdev connection token NAME    copy existing token; never silently rotate
  tdev connection enable|disable|rotate|revoke|remove NAME
  tdev connection rename NAME NEW_NAME
  tdev connection migrate      preserve existing Tunnel as default
  tdev tools                   list actual server tools
  tdev task|project|workspace list
  tdev operation status ID
  tdev diagnostics inspect
  tdev call TOOL --input FILE   any existing MCP tool, JSON arguments; '-' reads stdin
  tdev schema TOOL             exact local tool input schema
  tdev observer status|start|stop
  tdev admin ...               existing local grants/configuration commands
  tdev link                    install tdev shortcut in Termux bin (or ~/.local/bin)

Use --root PATH before the command to select an installation, or set TDEV_ROOT.
Use --connection NAME (or stable ID) for MCP calls with that connection's local credential.
This selects authentication to localhost, not a Tunnel route. No credential fallback/retry.
Modes: bearer requires a host token; no-auth permits No auth using local injection
and also accepts a valid host Bearer. Invalid Bearer is always rejected.
'''


HELP = """tdev — 번호로 선택하는 interactive menu

  tdev                 전체 메뉴
  tdev connection      연결 / 인증 / 토큰
  tdev diagnostics     진단 / 옵저버
  tdev work            작업 / 프로젝트 / 실행 조회
  tdev maintenance     설치 / 업데이트 / 복구
  tdev status          전체 상태 바로 조회

주요 메뉴만 입력하면 선택 목록이 열립니다. 0: 뒤로, q: 종료.
tdev help all: 전체 명령. tdev help connection: 연결 메뉴.
기존 직접 명령과 --root PATH, --json은 그대로 사용할 수 있습니다.
MCP 인증 연결 지정: tdev --connection NAME workspace list
"""


def source_root():
    return Path(__file__).resolve().parents[2]


def installer(root, action, source=None, controller_only=False, allow_unknown_publish=None):
    source = Path(source).resolve() if source else source_root()
    require((source/'src/tdev/installer.py').is_file(), 'SOURCE_REQUIRED')
    argv = ([shutil_shell(),str(source/'install.sh')] if (source/'install.sh').is_file()
            else [sys.executable,'-m','tdev.installer']) + ['--root',str(root)]
    if action in ('check','recover','rollback','uninstall'): argv.append('--'+action)
    if controller_only: argv.append('--controller-only')
    if allow_unknown_publish: argv.extend(['--allow-unknown-publish', allow_unknown_publish])
    env = {**os.environ,'PYTHONPATH':str(source/'src')+':'+str(source/'.tdev-deps')}
    completed = subprocess.run(argv,env=env)
    require(completed.returncode == 0,'INSTALLER_FAILED','See installer error above; no automatic retry')


def add_connection(manager):
    name = answer('Connection name: ')
    tunnel = answer('OpenAI Tunnel ID: ')
    key = answer('Tunnel runtime API key (hidden): ',secret=True)
    mode = choose_mode()
    with tempfile.TemporaryDirectory(prefix='tdev-key-') as tmp:
        file = Path(tmp)/'runtime.secret'
        atomic_write(file,key.encode())
        return manager.change('add',name,tunnel_id=tunnel,key_file=file,mode=mode)


def choose_mode():
    while True:
        value = answer('Authentication: 1) Bearer required  2) No-auth compatible [1]: ') or '1'
        if value in ('1','bearer'): return 'bearer'
        if value in ('2','tunnel'): return 'tunnel'
        print('Choose 1 or 2.',file=sys.stderr)


def pick_connection(root):
    from .connections import Connections
    from .cli_menu import connection
    return connection(Connections(root), answer)


def menu(root, group='main'):
    from .cli_menu import navigate
    return navigate(group, answer, lambda: pick_connection(root))


def bridge(root, connection=None):
    from .codex_bridge import Bridge
    from .connections import Connections
    from .connection_model import select
    from .cli_menu import ExitMenu
    settings = json.loads(private_file(root/'resident.json'))
    path = root/'connector.secret'
    if connection is None:
        # Only an absent legacy file offers a choice. Bad permissions/symlinks/auth do not.
        try: path.lstat()
        except FileNotFoundError:
            require(interactive(), 'CLI_CREDENTIAL_REQUIRED',
                    'connector.secret is missing; use tdev --connection NAME <command>. List names with tdev connection list')
            print('로컬 기본 인증 파일이 없습니다. 이번 호출에 사용할 연결을 선택하세요.', file=sys.stderr)
            connection = pick_connection(root)
            if connection is None: raise ExitMenu
    if connection is not None:
        selected = select(settings, connection)
        require(selected['enabled'], 'CLI_CONNECTION_DISABLED', 'Select an enabled connection explicitly')
        path = Connections(root).credential_file(selected)
        config = json.loads(private_file(root/'config.json'))
        ident = selected['credentialId']
        if ident is None:
            expected = [p['tokenHash'] for p in config['principals'].values()]
        else:
            credential = config.get('credentials', {}).get(ident)
            require(credential and credential['state']=='active'
                    and credential['principal'] in config['principals'], 'CLI_CREDENTIAL_INACTIVE',
                    'Selected connection credential is unavailable, disabled or revoked')
            expected = [credential['tokenHash']]
    try: token = private_file(path).strip()
    except FileNotFoundError:
        raise Fault('CLI_CREDENTIAL_MISSING', 'Selected credential file is missing; choose another connection explicitly or restore it') from None
    if connection is not None:
        require(any(hmac.compare_digest(digest(token), value) for value in expected),
                'CLI_CREDENTIAL_MISMATCH', 'Selected credential file does not match current configuration')
    return Bridge(f"http://127.0.0.1:{settings['port']}/mcp",token.decode())


def forward(root, connection, method, params):
    from .cli_menu import ExitMenu
    try: client = bridge(root, connection)
    except ExitMenu: return None
    # No retry, credential fallback or second dispatch after any response/transport error.
    return client.forward(1, method, params)


def tool_schema(tool):
    contract = json.loads((source_root()/'contracts/tools.schema.json').read_bytes())
    for entry in contract['x-tools']:
        if entry['name'] == tool:
            from .server import expanded
            return expanded(contract, entry['inputSchema'])
    raise Fault('TOOL_NOT_FOUND')


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--root')
    parser.add_argument('--connection')
    parser.add_argument('--help',action='store_true')
    parser.add_argument('--json',action='store_true')
    options, args = parser.parse_known_args(args)
    from .cli_menu import MENUS, ExitMenu, show
    if options.help or args[:1] == ['help']:
        topic = args[1] if args[:1] == ['help'] and len(args)>1 else (args[0] if args else 'main')
        if topic in MENUS and topic != 'main':
            show(topic)
        else:
            print(ALL_HELP if topic == 'all' else HELP)
        return 0
    group = 'main' if not args else args[0] if len(args)==1 and args[0] in MENUS else None
    if group is not None and not interactive():
        if group == 'main': print(HELP)
        else:
            show(group)
            print('번호 선택은 터미널에서 가능합니다. 자동화에서는 위의 직접 명령을 사용하세요.')
        return 0
    root = Path(options.root).absolute() if options.root else default_root()
    if group is not None:
        try: args = menu(root, group)
        except ExitMenu: return 0
    if not args: return 0
    command, *rest = args
    result = None
    if options.connection is not None:
        require(command not in ('link','install','update','check','recover','rollback','uninstall',
                                'status','connection','observer','admin','schema'),
                'CLI_ARGUMENT', '--connection selects credentials for MCP calls only; use a positional name for connection management')
    if command == 'link':
        directory = Path(os.environ.get('PREFIX','/nonexistent'))/'bin'
        if not directory.is_dir() or str(directory) not in os.environ.get('PATH','').split(os.pathsep):
            directory = Path.home()/'.local/bin'
        target = directory/'tdev'
        source = source_root()
        content = '#!'+(shutil_shell())+'\nexport PYTHONPATH='+shlex.quote(str(source/'src')+':'+str(source/'.tdev-deps'))+'\nexec '+shlex.quote(sys.executable)+' -m tdev.cli "$@"\n'
        if target.exists():
            require(target.is_file() and not target.is_symlink() and ' -m tdev.cli ' in target.read_text(), 'CLI_PATH_OCCUPIED')
        atomic_write(target,content.encode(),0o700)
        result = {'command':str(target),'pathReady':str(target.parent) in os.environ.get('PATH','').split(os.pathsep)}
    elif command in ('install','update','check','recover','rollback','uninstall'):
        fresh = not (root/'resident.json').exists()
        source, allow_unknown_publish = (rest[0] if rest else None), None
        if command == 'update':
            p = argparse.ArgumentParser(prog='tdev update')
            p.add_argument('source', nargs='?')
            p.add_argument('--allow-unknown-publish', metavar='OPERATION_ID')
            a = p.parse_args(rest)
            source, allow_unknown_publish = a.source, a.allow_unknown_publish
        installer(root,command,source,controller_only=command=='install' and fresh,
                  allow_unknown_publish=allow_unknown_publish)
        if command=='install' and fresh and interactive() and (answer('Add an OpenAI Tunnel connection now? [Y/n]: ') or 'y').lower() in ('y','yes'):
            from .connections import Connections
            result = add_connection(Connections(root))
    elif command == 'status':
        from .resident import get_health
        from .connections import Connections
        s = json.loads(private_file(root/'resident.json'))
        manager = Connections(root)
        try:
            manager.installation.owned(manager.installation.svdir/'tdev', s)
            health = get_health(s['port'])
            manager.installation.backend.controller_ready(root,s,(root/'active').resolve().name)
        except (OSError, Fault, ValueError) as e:
            health = {'status':'unavailable','error':e.value['code'] if isinstance(e,Fault) else type(e).__name__}
        result = {'controller':health,**manager.observe()}
    elif command == 'connection':
        from .connections import Connections
        manager = Connections(root)
        require(rest,'CLI_ARGUMENT','Use tdev connection list|add|mode|token|enable|disable|rotate|revoke|remove')
        action = rest[0]
        if action == 'list': result = manager.observe()
        elif action == 'add':
            p = argparse.ArgumentParser(prog='tdev connection add')
            p.add_argument('name',nargs='?'); p.add_argument('--tunnel-id'); p.add_argument('--runtime-key-file')
            p.add_argument('--mode',choices=('bearer','no-auth','tunnel'),default='bearer')
            a = p.parse_args(rest[1:])
            if a.name:
                require(a.tunnel_id and a.runtime_key_file,'CLI_ARGUMENT','Provide Tunnel ID and private key file, or omit arguments for guided setup')
                result = manager.change('add',a.name,tunnel_id=a.tunnel_id,key_file=a.runtime_key_file,mode='tunnel' if a.mode=='no-auth' else a.mode)
            else: result = add_connection(manager)
        elif action == 'migrate': result = manager.change('migrate')
        else:
            if len(rest)>1:
                name = rest[1]
            else:
                require(interactive(), 'CLI_ARGUMENT', 'Provide a connection name, or run tdev connection in a terminal')
                try: name = pick_connection(root)
                except ExitMenu: return 0
                if name is None: return 0
            if action == 'inspect': result = manager.observe(name)
            elif action == 'token': result = manager.token(name)
            elif action == 'mode':
                mode = rest[2] if len(rest)>2 else choose_mode()
                result = manager.change('mode',name,mode='tunnel' if mode=='no-auth' else mode)
            elif action == 'rename': result = manager.change('rename',name,new_name=rest[2] if len(rest)>2 else answer('New name: '))
            else: result = manager.change(action,name)
    elif command == 'observer':
        source = source_root()/'scripts/tdev-observe'
        require(source.is_file(),'OBSERVER_COMMAND','Run from the source CLI checkout')
        return subprocess.call([sys.executable,str(source),*rest],env={**os.environ,'TDEV_OBSERVE_ROOT':str(root)})
    elif command == 'admin':
        return subprocess.call([sys.executable,'-m','tdev.admin',*rest,'--root',str(root)],env={**os.environ,'PYTHONPATH':str(source_root()/'src')+':'+str(source_root()/'.tdev-deps')})
    elif command == 'schema':
        require(len(rest)==1,'CLI_ARGUMENT'); result = tool_schema(rest[0] if rest[0].startswith('tdev_') else 'tdev_'+rest[0])
    elif command == 'tools': result = forward(root,options.connection,'tools/list',{})
    else:
        p = argparse.ArgumentParser(prog='tdev '+command)
        p.add_argument('action',nargs='?'); p.add_argument('identity',nargs='?'); p.add_argument('--input')
        a = p.parse_args(rest)
        values = json.loads(sys.stdin.read() if a.input=='-' else Path(a.input).read_text()) if a.input else {}
        require(isinstance(values,dict),'CLI_ARGUMENT')
        if command == 'call':
            require(a.action,'CLI_ARGUMENT'); tool = a.action if a.action.startswith('tdev_') else 'tdev_'+a.action
        else:
            tool = 'tdev_'+command
            if a.action: values['action'] = a.action
            if a.identity:
                field = {'operation':'operationId','task':'taskId','workspace':'workspaceId','project':'repo'}.get(command)
                require(field,'CLI_ARGUMENT','Use --input for this tool'); values[field] = a.identity
        tool_schema(tool)  # Reject typos before reading a credential or calling HTTP.
        result = forward(root,options.connection,'tools/call',{'name':tool,'arguments':values if command == 'call' else {'request':values}})
    if result is not None:
        if not options.json and 'connections' in result:
            if 'controller' in result:
                h = result['controller']
                print('Controller: ' + h.get('status','unknown') + '  ' + h.get('version',''))
            print('NAME                 MODE       DESIRED    HEALTH     PROCESS')
            for c in result['connections']:
                print(f"{c['name']:<20} {'no-auth' if c['authMode']=='tunnel' else 'bearer':<10} {'enabled' if c['enabled'] else 'disabled':<10} {'healthy' if c['healthy'] else 'unavailable':<10} {c['process']}")
                if c.get('error'): print('  ' + c['error'])
            if not result['connections']: print('(no Tunnel connections)')
            if result.get('recoveryPending'): print('Recovery pending: tdev recover')
        else:
            print(json.dumps(result,indent=2))
        if result.get('error') or result.get('result',{}).get('isError'): return 1
    return 0


def shutil_shell():
    import shutil
    return shutil.which('sh') or '/bin/sh'


def entry():
    try: return main()
    except (Fault,OSError,ValueError,KeyboardInterrupt) as e:
        error = e.value if isinstance(e,Fault) else {'code':type(e).__name__}
        print(json.dumps({'ok':False,'error':error}),file=sys.stderr)
        return 1


if __name__ == '__main__': sys.exit(entry())
