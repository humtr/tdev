// Paste the selected helpers into each fresh Code Mode cell; no imports or server dependency.
// Every tools invocation in that physical cell must pass through this runner.
function classifyTdevReply(reply) {
  const body = reply?.structuredContent ?? reply;
  if (reply?.isError === true || !body || body.ok !== true || !Object.hasOwn(body, 'result')) return 'review';
  const op = body.result;
  if (!op || typeof op !== 'object') return 'review';
  if (typeof op.status !== 'string') return 'continue'; // A successful domain read.
  if (op.status !== 'succeeded' || op.effect !== 'committed' || !op.result || op.error != null) return 'review';
  if (op.kind === 'exec' || op.kind === 'validate') {
    const receipt = op.result;
    if (receipt.terminal !== true || receipt.stopped !== true || receipt.exitCode !== 0 ||
        receipt.cancelled || receipt.timedOut || receipt.captureError) return 'review';
  }
  // This permits the caller's already-selected next step; it does not establish
  // the user goal, live health, authorization, or permission to rerun a failure.
  return 'continue';
}

async function runTdevCell({tools, steps, nextIndex = 0, classify, onReply,
  maxCalls = 16, maxElapsedMs = 15000, now = () => Date.now(), witness = null}) {
  if (!Array.isArray(steps) || !Number.isSafeInteger(nextIndex) || nextIndex < 0 ||
      nextIndex > steps.length || !Number.isSafeInteger(maxCalls) ||
      maxCalls < (witness ? 4 : 1) || !Number.isFinite(maxElapsedMs) || maxElapsedMs <= 0 ||
      typeof classify !== 'function' || typeof onReply !== 'function') {
    throw new Error('Invalid cell plan or policy');
  }
  const ids = new Set();
  for (const step of steps) {
    if (!step || typeof step.id !== 'string' || !step.id || ids.has(step.id) ||
        typeof tools[step.tool] !== 'function') throw new Error('Invalid step identity or tool');
    ids.add(step.id);
  }
  if (witness && (typeof tools[witness.tool] !== 'function' ||
      !/^[a-f0-9]{16}$/.test(witness.instance) || !/^[a-f0-9]{32}$/.test(witness.runId) ||
      !/^[a-f0-9]{32}$/.test(witness.cellId) || !Number.isSafeInteger(witness.sequence) ||
      witness.sequence < 0 || witness.sequence > Number.MAX_SAFE_INTEGER - 3)) {
    throw new Error('Invalid witness setup');
  }
  let attempted = 0, index = nextIndex, status = 'complete', reason = 'plan_exhausted';
  let pending = null, lastReturn = null, sequence = witness?.sequence ?? 0;
  const started = now(), witnesses = [];
  // Count before invocation, including rejected/failed calls. No detached promises/retries.
  async function invoke(tool, args) {
    attempted++;
    return await tools[tool](args);
  }
  async function mark(phase, fields = {}) {
    if (!witness) return;
    const args = {action: 'mark', instance: witness.instance, runId: witness.runId,
      cellId: witness.cellId, sequence: ++sequence, phase, ...fields};
    try {
      const reply = await invoke(witness.tool, {request: args});
      // Keep actual responses, including structured errors; fulfilled await is not mark success.
      witnesses.push({phase, sequence, reply});
    } catch {
      witnesses.push({phase, sequence, unavailable: true});
    }
  }
  if (index < steps.length) {
    await mark('cell_enter');
    while (index < steps.length) {
      // Reserve both sparse tool_return and cell_exit before starting useful work.
      if (attempted + 1 + (witness ? 2 : 0) > maxCalls || now() - started >= maxElapsedMs) {
        status = index > nextIndex ? 'rollover' : 'review';
        reason = attempted + 1 + (witness ? 2 : 0) > maxCalls ? 'call_budget' : 'elapsed_budget';
        break;
      }
      const step = steps[index];
      let reply;
      try {
        reply = await invoke(step.tool, step.args);
      } catch {
        // The request may have committed. Preserve the original plan/requestId for reconciliation.
        status = 'reconcile'; reason = 'tool_reply_unavailable';
        pending = {index, id: step.id};
        break;
      }
      lastReturn = {ordinal: index + 1, reply};
      index++;
      try {
        // Pure caller-side functions only: print/retain receipt, then explicitly decide to continue.
        await onReply(reply, step);
        if (await classify(reply, step) !== 'continue') {
          status = 'review'; reason = 'reply_requires_review';
          pending = {index: index - 1, id: step.id};
          break;
        }
      } catch {
        status = 'review'; reason = 'caller_processing_failed';
        pending = {index: index - 1, id: step.id};
        break;
      }
    }
    if (lastReturn) {
      const receipt = lastReturn.reply?._meta?.['io.tdev/diagnosticReceipt'];
      await mark('tool_return', {callOrdinal: lastReturn.ordinal,
        ...(receipt?.instance === witness?.instance && Number.isSafeInteger(receipt?.request) &&
            receipt.request > 0 ? {afterRequest: receipt.request} : {})});
    }
    await mark('cell_exit');
  }
  return {status, reason, nextIndex: index, pending, attempted,
    elapsedMs: Math.max(0, now() - started), sequence, witnesses};
}

// Monitor one already-admitted operation inside a single physical cell. This is intentionally
// It observes/reconciles the original receipt; never cancels or invents a request identity.
async function runTdevOperationCell({tools, tool, operationId = null, lookupRequestId = null,
  offset = 0, limit = 24000, onStatus = () => {}, maxCalls = 1,
  maxElapsedMs = 35000, statusWaitMs = 30000, pollAfterMs = 0, now = () => Date.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  const oneTarget = Boolean(operationId) !== Boolean(lookupRequestId);
  if (!tools || typeof tool !== 'string' || !tool || typeof tools[tool] !== 'function' ||
      !oneTarget || (operationId !== null && (typeof operationId !== 'string' || !operationId)) ||
      (lookupRequestId !== null && (typeof lookupRequestId !== 'string' || !lookupRequestId)) ||
      !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 65536 ||
      !Number.isSafeInteger(maxCalls) || maxCalls < 1 || !Number.isFinite(maxElapsedMs) || maxElapsedMs <= 0 ||
      !Number.isSafeInteger(statusWaitMs) || statusWaitMs < 0 || statusWaitMs > 30000 ||
      !Number.isFinite(pollAfterMs) || pollAfterMs < 0 || typeof onStatus !== 'function' ||
      typeof now !== 'function' || typeof sleep !== 'function') throw new Error('Invalid operation monitor policy');

  const target = operationId ? {operationId} : {lookupRequestId};
  let attempted = 0, currentOffset = offset, last = null, lastFingerprint = null;
  const started = now();
  const packet = (status, reason, operationStatus = last?.status ?? null) => ({
    status, reason, operationStatus, attempted, elapsedMs: Math.max(0, now() - started),
    nextArgs: {request: {action: 'status', ...target, offset: currentOffset, limit, waitMs: statusWaitMs}}, operation: last
  });

  while (true) {
    if (attempted >= maxCalls || now() - started >= maxElapsedMs) {
      return packet('rollover', attempted >= maxCalls ? 'call_budget' : 'elapsed_budget');
    }
    let reply;
    try {
      attempted++;
      const callWaitMs = Math.min(statusWaitMs,
        Math.max(0, Math.floor(maxElapsedMs - (now() - started))));
      reply = await tools[tool]({request: {action: 'status', ...target, offset: currentOffset, limit, waitMs: callWaitMs}});
    } catch {
      // Original-effect observation may be re-issued later; do not hammer a rejected host call.
      return packet('review', 'status_reply_unavailable');
    }
    const body = reply?.structuredContent ?? reply;
    if (reply?.isError === true || !body || body.ok !== true || !body.result || typeof body.result.status !== 'string') {
      last = body?.ok === false ? {error: body.error ?? null} : null;
      return packet('review', body?.ok === false ? 'status_error' : 'status_unreadable');
    }
    last = body.result;
    const nextOffset = last.output?.nextOffset;
    if (Number.isSafeInteger(nextOffset) && nextOffset >= currentOffset) currentOffset = nextOffset;
    const fingerprint = JSON.stringify([last.status, last.effect, last.output?.availableBytes,
      last.output?.nextOffset, last.result?.exitCode, last.result?.terminal, last.error?.code]);
    if (fingerprint !== lastFingerprint) {
      try { await onStatus(last, reply); }
      catch { return packet('review', 'caller_processing_failed'); }
      lastFingerprint = fingerprint;
    }
    if (last.status === 'succeeded' || last.status === 'failed' || last.status === 'cancelled') {
      return packet('terminal', 'operation_terminal');
    }
    if (last.status !== 'running') return packet('review', 'operation_unknown');
    if (attempted >= maxCalls || now() - started >= maxElapsedMs) {
      return packet('rollover', attempted >= maxCalls ? 'call_budget' : 'elapsed_budget');
    }
    const remaining = Math.max(0, maxElapsedMs - (now() - started));
    if (remaining <= 0) return packet('rollover', 'elapsed_budget');
    const delay = Math.min(pollAfterMs, remaining);
    if (delay > 0) {
      try { await sleep(delay); }
      catch { return packet('review', 'poll_sleep_failed'); }
    }
  }
}
