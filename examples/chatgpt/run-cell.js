// Paste this function into each fresh Code Mode cell; no imports or server dependency.
// Every tools invocation in that physical cell must pass through this runner.
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
      const reply = await invoke(witness.tool, args);
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
