import { spawn } from 'node:child_process';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const requestText = Buffer.concat(chunks).toString('utf8');
const behavior = process.argv[2] ?? 'changeset';

if (behavior === 'invalid-json') {
  process.stdout.write('{not-json');
  process.exit(0);
}
if (behavior === 'nonzero') {
  process.stderr.write('fixture-secret-diagnostic');
  process.exit(7);
}
if (behavior === 'sleep') {
  setTimeout(() => process.stdout.write('{}'), 5_000);
} else if (behavior === 'spawn-grandchild-timeout') {
  const marker = process.argv[3];
  const grandchild = spawn(process.execPath, [
    '-e',
    `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'survived'), 300)`,
  ], { stdio: 'ignore' });
  grandchild.unref();
  setTimeout(() => {}, 5_000);
} else if (behavior === 'spawn-grandchild-return') {
  const marker = process.argv[3];
  const grandchild = spawn(process.execPath, [
    '-e',
    `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'survived'), 300)`,
  ], { stdio: 'ignore' });
  grandchild.unref();
  const request = JSON.parse(requestText);
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    profile: 'tdev.model.subprocess-json.v1',
    requestDigest: request.requestDigest,
    result: {
      kind: 'changeset',
      baseDigest: request.invocation.baseDigest,
      writes: [],
    },
  }));
} else if (behavior === 'spawn-grandchild-inherit-return') {
  const marker = process.argv[3];
  const grandchild = spawn(process.execPath, [
    '-e',
    `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'survived'), 500); setTimeout(() => {}, 5_000)`,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
  grandchild.unref();
  const request = JSON.parse(requestText);
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    profile: 'tdev.model.subprocess-json.v1',
    requestDigest: request.requestDigest,
    result: {
      kind: 'changeset',
      baseDigest: request.invocation.baseDigest,
      writes: [],
    },
  }));
} else if (behavior === 'oversize') {
  process.stdout.write('x'.repeat(16 * 1024));
} else {
  const request = JSON.parse(requestText);
  const requestDigest = behavior === 'wrong-digest'
    ? 'sha256:' + '0'.repeat(64)
    : request.requestDigest;
  const content = behavior === 'envcheck'
    ? (process.env.TDEV_SHOULD_NOT_LEAK ?? 'absent')
    : request.invocation.task.input.instruction;
  const response = {
    schemaVersion: 1,
    profile: 'tdev.model.subprocess-json.v1',
    requestDigest,
    result: {
      kind: 'changeset',
      baseDigest: request.invocation.baseDigest,
      writes: [{ path: 'model-output.txt', content }],
    },
  };
  process.stdout.write(JSON.stringify(response));
}
