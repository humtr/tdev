#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const moduleState = { count: 0, cases: [] };
const GLOBAL_KEY = '__tdevD0018GlobalSentinel';
const PROTOTYPE_KEY = '__tdevD0018PrototypeSentinel';
const TIMER_KEY = '__tdevD0018TimerFired';
const ASYNC_KEY = '__tdevD0018AsyncAfterReturnFired';
const ENV_KEY = 'TDEV_D0018_ATTEMPT_SENTINEL';
const CALLER_SECRET_KEY = 'TDEV_D0018_CALLER_SECRET';
const CONFIGURED_KEY = 'TDEV_D0018_CONFIGURED';
const SIGNAL_NAME = 'SIGUSR2';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nullable(value) {
  return value === undefined ? null : value;
}

function inspectAndMutate(caseId) {
  const before = {
    pid: process.pid,
    globalSentinel: nullable(globalThis[GLOBAL_KEY]),
    moduleCount: moduleState.count,
    moduleCases: [...moduleState.cases],
    prototypeSentinel: nullable(Object.prototype[PROTOTYPE_KEY]),
    environmentSentinel: nullable(process.env[ENV_KEY]),
    cwd: process.cwd(),
    signalListenerCount: process.listenerCount(SIGNAL_NAME),
    timerFired: Boolean(globalThis[TIMER_KEY]),
    asyncAfterReturnFired: Boolean(globalThis[ASYNC_KEY]),
    callerSecret: nullable(process.env[CALLER_SECRET_KEY]),
    configuredEnvironment: nullable(process.env[CONFIGURED_KEY]),
  };

  globalThis[GLOBAL_KEY] = caseId;
  moduleState.count += 1;
  moduleState.cases.push(caseId);
  Object.defineProperty(Object.prototype, PROTOTYPE_KEY, {
    value: caseId,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  process.env[ENV_KEY] = caseId;
  const listener = () => {};
  process.on(SIGNAL_NAME, listener);
  try { process.chdir('/'); } catch {}
  const timer = setTimeout(() => { globalThis[TIMER_KEY] = true; }, 5);
  timer.unref();
  const delayed = setTimeout(() => { globalThis[ASYNC_KEY] = true; }, 7);
  delayed.unref();

  return before;
}

function observationResult(value) {
  return {
    kind: 'observation',
    subject: 'd0018-warm-runtime-worker',
    value,
    evidence: null,
  };
}

async function runModelRequest(request) {
  const instruction = request?.invocation?.task?.input?.instruction ?? 'success';
  const attemptOrdinal = request?.invocation?.attempt?.ordinal ?? 1;
  const caseId = request?.invocation?.caseId ?? 'unknown-case';

  if (instruction === 'crash') process.exit(7);
  if (instruction === 'fail-first' && attemptOrdinal === 1) process.exit(7);
  if (instruction === 'sleep') await wait(5_000);
  if (instruction === 'sleep-short') await wait(80);

  const before = inspectAndMutate(caseId);
  return {
    schemaVersion: 1,
    profile: 'tdev.model.subprocess-json.v1',
    requestDigest: request.requestDigest,
    result: observationResult({
      caseId,
      attemptId: request?.invocation?.attempt?.id ?? null,
      before,
    }),
  };
}

async function persistentMode() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const command = JSON.parse(line);
    const before = inspectAndMutate(command.caseId ?? command.requestId ?? 'persistent');
    process.stdout.write(`${JSON.stringify({
      type: 'response',
      requestId: command.requestId,
      before,
    })}\n`);
    if (command.lateFrame === true) {
      const late = setTimeout(() => {
        process.stdout.write(`${JSON.stringify({
          type: 'late',
          requestId: command.requestId,
          caseId: command.caseId,
        })}\n`);
      }, 15);
      late.unref();
    }
  }
}

async function singleMode() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const response = await runModelRequest(request);
  process.stdout.write(JSON.stringify(response));
}

if (process.argv.includes('--persistent')) {
  await persistentMode();
} else {
  await singleMode();
}
