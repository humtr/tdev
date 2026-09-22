"""Opt-in live public-wheel build/relocation probe; only disposable project/state."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from test_artifact_runtime import EXAMPLE, example
from test_artifacts import ArtifactTest
from tdev.artifact_runtime import service_launch
from tdev.artifact_build import verify_storage
from tdev.common import digest


def main():
    fixture = ArtifactTest('test_native_inspection_uses_frozen_source_without_build_or_deployment')
    fixture.setUp()
    try:
        recipe = example.make_recipe()
        extra = [{'action': 'put', 'path': name, 'before': None, 'content': (EXAMPLE / name).read_text()}
                 for name in ('build.py', 'launch.py', 'app.py', 'requirements.lock')]
        task, validation = fixture.validated(recipe, extra=extra)
        fixture.c.executor_override = None
        operation = fixture.call('artifact', {'action': 'prepare', 'requestId': 'public-wheel', 'validationId': validation})
        completed = fixture.wait(operation['id'])
        assert completed['status'] == 'succeeded', completed
        retained = fixture.call('artifact', {'action': 'inspect', 'artifactId': operation['id']})
        assert retained['runtimeCompatibility']['compatible'], retained
        second = fixture.call('artifact', {'action': 'prepare', 'requestId': 'public-wheel-again', 'validationId': validation})
        assert fixture.wait(second['id'])['status'] == 'succeeded'
        repeated = fixture.call('artifact', {'action': 'inspect', 'artifactId': second['id']})
        # Measure equality; a nondeterministic recipe is evidence, not a hash-check waiver.
        repeatable = retained['contentDigest'] == repeated['contentDigest']
        source = fixture.c.artifacts.objects() / retained['contentDigest']
        relocated = fixture.root / 'relocated'
        shutil.copytree(source, relocated)
        for i, op in enumerate((operation, second, {'id': validation})):
            fixture.call('operation', {'action': 'retire', 'requestId': 'retire-' + str(i), 'operationId': op['id']})
        fixture.call('task', {'action': 'close', 'requestId': 'close', 'taskId': task['taskId'], 'expected': task['checkpoint']})
        fixture.call('task', {'action': 'resetEnvironment', 'requestId': 'reset', 'taskId': task['taskId'], 'expected': task['checkpoint']})
        shutil.rmtree(fixture.repo.work)
        shutil.rmtree(fixture.c.store.root / 'native')
        launch = service_launch(relocated, retained['contentDigest'], fixture.root / 'runtime')
        # No package manager/acquirer is invoked by this launch; transport-independent
        # retained bytes suffice. This does not assert an OS-level network sandbox.
        executed = subprocess.run(launch['argv'], cwd=launch['cwd'], env=launch['env'],
                                  capture_output=True, text=True, timeout=20)
        assert executed.returncode == 0, executed.stderr
        observed = json.loads(executed.stdout)
        assert observed['dependency'] == '25.0' and observed['asset']['message'] == 'retained package', observed
        verify_storage(relocated, retained['contentDigest'])
        distribution = recipe['dependencies'][0]
        assert digest((relocated / 'inputs' / distribution['name']).read_bytes()) == distribution['sha256']
        assert not list(relocated.rglob('*.pyc'))
        print(json.dumps({'publicInput': distribution, 'artifactDigest': retained['contentDigest'],
                          'secondArtifactDigest': repeated['contentDigest'], 'independentBuildBytesEqual': repeatable,
                          'dependencyVersion': observed['dependency'], 'buildAndDevelopmentRootsRemoved': True,
                          'retainedBytesUnchangedAfterRun': True, 'runtimeFilesChecked': len(recipe['service']['runtime']['files']),
                          'productionServicesTouched': False}, indent=2))
    finally:
        fixture.tearDown()


if __name__ == '__main__':
    main()
