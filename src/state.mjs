import { ContractError, deepFreeze } from './canonical.mjs';

export const CASE_STATES = deepFreeze(['active', 'reconciling', 'succeeded', 'failed', 'cancelled', 'unverified']);
export const TASK_STATES = deepFreeze([
  'pending', 'running', 'reconciling', 'succeeded', 'failed', 'cancelled', 'denied', 'unverified', 'blocked',
]);
export const ATTEMPT_STATES = deepFreeze([
  'dispatch_pending', 'queued', 'running', 'reconciling', 'cancel_requested',
  'succeeded', 'failed', 'cancelled', 'interrupted', 'rejected', 'unverified',
]);

export const TERMINAL_CASE_STATES = new Set(['succeeded', 'failed', 'cancelled', 'unverified']);
export const TERMINAL_TASK_STATES = new Set(['succeeded', 'failed', 'cancelled', 'denied', 'unverified', 'blocked']);
export const TERMINAL_ATTEMPT_STATES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted', 'rejected', 'unverified']);
export const NONTERMINAL_ATTEMPT_STATES = new Set(['dispatch_pending', 'queued', 'running', 'reconciling', 'cancel_requested']);

const ATTEMPT_TRANSITIONS = new Set([
  'dispatch_pending>queued',
  'dispatch_pending>running',
  'dispatch_pending>reconciling',
  'dispatch_pending>cancel_requested',
  'queued>running',
  'queued>reconciling',
  'queued>cancel_requested',
  'running>reconciling',
  'running>cancel_requested',
  'reconciling>queued',
  'reconciling>running',
  'reconciling>cancel_requested',
  'cancel_requested>reconciling',
  ...['dispatch_pending', 'queued', 'running', 'reconciling', 'cancel_requested'].flatMap((from) =>
    ['succeeded', 'failed', 'cancelled', 'interrupted', 'rejected', 'unverified'].map((to) => `${from}>${to}`)),
]);

export function assertAttemptTransition(from, to) {
  if (!ATTEMPT_STATES.includes(from) || !ATTEMPT_STATES.includes(to) || !ATTEMPT_TRANSITIONS.has(`${from}>${to}`)) {
    throw new ContractError('invalid_attempt_transition', `Attempt transition rejected: ${from} -> ${to}`);
  }
}
