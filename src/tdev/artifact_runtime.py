"""Native retained-service launch inputs. No activation, dependency install or rebuild.

The caller owns process supervision and must recheck these inputs before each launch.
"""
import shutil
from pathlib import Path

from .artifact_build import file_info, host_platform, verify_storage
from .common import Fault, path, require
from .native import environment


def verify_runtime(service, search_path):
    runtime = service['runtime']
    require(runtime['platform'] == host_platform(), 'ARTIFACT_RUNTIME_PLATFORM')
    require(any(t['name'] == 'sh' for t in runtime['tools']), 'ARTIFACT_RUNTIME_SHELL')
    resolved = {}
    for tool in runtime['tools']:
        filename = shutil.which(tool['name'], path=search_path)
        require(filename, 'ARTIFACT_RUNTIME_TOOL_MISSING', tool['name'])
        try:
            filename = Path(filename).resolve(strict=True)
            actual = file_info(filename, 256 * 1024 * 1024)
        except OSError:
            raise Fault('ARTIFACT_RUNTIME_TOOL_MISSING', tool['name']) from None
        require(actual['sha256'] == tool['sha256'], 'ARTIFACT_RUNTIME_TOOL_CHANGED', tool['name'])
        resolved[tool['name']] = str(filename)
    for entry in runtime.get('files', []):
        # Host paths are recipe requirements, never package/export paths. Observe only.
        try:
            filename = Path(entry['path']).resolve(strict=True)
            actual = file_info(filename, 256 * 1024 * 1024)
        except OSError:
            raise Fault('ARTIFACT_RUNTIME_FILE_MISSING', entry['path']) from None
        require(actual['sha256'] == entry['sha256'], 'ARTIFACT_RUNTIME_FILE_CHANGED', entry['path'])
    return resolved


def compatibility(service, scratch):
    try:
        verify_runtime(service, environment(scratch)['PATH'])
        return {'compatible': True, 'platform': host_platform()}
    except Fault as error:
        return {'compatible': False, 'platform': host_platform(), 'error': error.value}


def service_launch(directory, content_digest, scratch):
    """Use a controller-verified content identity; return launch inputs, never spawn."""
    directory, scratch = Path(directory).absolute(), Path(scratch).absolute()
    manifest = verify_storage(directory, content_digest)
    require(manifest['recipe']['kind'] == 'service', 'ARTIFACT_SERVICE_REQUIRED')
    service = manifest['recipe']['service']
    env = environment(scratch)
    resolved = verify_runtime(service, env['PATH'])
    source = (directory / 'files').resolve(strict=True)
    require(not scratch.is_symlink(), 'ARTIFACT_RUNTIME_SCRATCH')
    scratch = scratch.resolve()
    require(scratch != directory.resolve() and directory.resolve() not in scratch.parents
            and scratch not in directory.resolve().parents, 'ARTIFACT_RUNTIME_SCRATCH')
    for name in ('home', 'tmp', 'data'):
        target = scratch / name
        require(not target.is_symlink(), 'ARTIFACT_RUNTIME_SCRATCH')
        target.mkdir(parents=True, exist_ok=True, mode=0o700)
    cwd = (source / path(service['cwd'], dot=True)).resolve(strict=True)
    require(cwd == source or source in cwd.parents, 'ARTIFACT_SERVICE_CWD')
    require(cwd.is_dir(), 'ARTIFACT_SERVICE_CWD')
    env.update(service['environment'])
    env.update(TDEV_ARTIFACT_DIR=str(source), TDEV_DATA_DIR=str(scratch / 'data'),
               PYTHONDONTWRITEBYTECODE='1')
    # Python recipes use -I -S and an artifact-relative launcher. Shell launch is
    # deliberately generic; this helper does not promise import isolation for any command.
    return {'argv': [resolved['sh'], '-c', service['command']], 'cwd': str(cwd), 'env': env}
