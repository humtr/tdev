export type CaseStateKey =
  | "active"
  | "paused"
  | "cancelling"
  | "terminal:completed"
  | "terminal:failed"
  | "terminal:cancelled"
  | "terminal:rolled_back"
  | "terminal:unverified";

export type TaskStateKey =
  | "waiting:approval"
  | "waiting:input"
  | "waiting:retry_decision"
  | "ready"
  | "active"
  | "cancelling"
  | "terminal:succeeded"
  | "terminal:failed"
  | "terminal:cancelled"
  | "terminal:denied"
  | "terminal:unverified";

export type AttemptStateKey =
  | "dispatch_pending"
  | "queued"
  | "running"
  | "reconciling"
  | "cancel_requested"
  | "terminal:succeeded"
  | "terminal:failed"
  | "terminal:cancelled"
  | "terminal:interrupted"
  | "terminal:rejected"
  | "terminal:input_required"
  | "terminal:unverified";

export const caseStates: readonly CaseStateKey[] = [
  "active", "paused", "cancelling", "terminal:completed", "terminal:failed",
  "terminal:cancelled", "terminal:rolled_back", "terminal:unverified",
];

export const taskStates: readonly TaskStateKey[] = [
  "waiting:approval", "waiting:input", "waiting:retry_decision", "ready", "active",
  "cancelling", "terminal:succeeded", "terminal:failed", "terminal:cancelled",
  "terminal:denied", "terminal:unverified",
];

export const attemptStates: readonly AttemptStateKey[] = [
  "dispatch_pending", "queued", "running", "reconciling", "cancel_requested",
  "terminal:succeeded", "terminal:failed", "terminal:cancelled", "terminal:interrupted",
  "terminal:rejected", "terminal:input_required", "terminal:unverified",
];

const caseTransitions = new Set<string>([
  "active>paused",
  "paused>active",
  "active>cancelling",
  "paused>cancelling",
  ...["active", "paused"].flatMap((from) =>
    ["completed", "failed", "rolled_back", "unverified"].map((outcome) => `${from}>terminal:${outcome}`)),
  ...["cancelled", "failed", "unverified", "rolled_back"].map((outcome) => `cancelling>terminal:${outcome}`),
]);

const taskTransitions = new Set<string>([
  "waiting:approval>ready",
  "waiting:approval>terminal:denied",
  "waiting:input>ready",
  "waiting:input>terminal:cancelled",
  "waiting:input>terminal:failed",
  "waiting:retry_decision>ready",
  "waiting:retry_decision>terminal:cancelled",
  "waiting:retry_decision>terminal:unverified",
  "ready>active",
  "ready>cancelling",
  "ready>terminal:cancelled",
  "active>waiting:input",
  "active>waiting:retry_decision",
  "active>cancelling",
  ...["succeeded", "failed", "cancelled", "denied", "unverified"].map((outcome) => `active>terminal:${outcome}`),
  ...["succeeded", "cancelled", "failed", "unverified"].map((outcome) => `cancelling>terminal:${outcome}`),
]);

const attemptTransitions = new Set<string>([
  "dispatch_pending>queued",
  "dispatch_pending>reconciling",
  "dispatch_pending>cancel_requested",
  "queued>running",
  "queued>reconciling",
  "queued>cancel_requested",
  "running>reconciling",
  "running>cancel_requested",
  "reconciling>queued",
  "reconciling>running",
  "reconciling>cancel_requested",
  ...["dispatch_pending", "queued", "running", "reconciling", "cancel_requested"].flatMap((from) =>
    ["succeeded", "failed", "cancelled", "interrupted", "rejected", "input_required", "unverified"]
      .map((outcome) => `${from}>terminal:${outcome}`)),
]);

export class TransitionError extends Error {
  readonly entity: "case" | "task" | "attempt";
  readonly from: string;
  readonly to: string;

  constructor(entity: "case" | "task" | "attempt", from: string, to: string) {
    super(`${entity} transition rejected: ${from} -> ${to}`);
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

export function canCaseTransition(from: CaseStateKey, to: CaseStateKey): boolean {
  return caseTransitions.has(`${from}>${to}`);
}

export function canTaskTransition(from: TaskStateKey, to: TaskStateKey): boolean {
  return taskTransitions.has(`${from}>${to}`);
}

export function canAttemptTransition(from: AttemptStateKey, to: AttemptStateKey): boolean {
  return attemptTransitions.has(`${from}>${to}`);
}

export function assertCaseTransition(from: CaseStateKey, to: CaseStateKey): void {
  if (!canCaseTransition(from, to)) throw new TransitionError("case", from, to);
}

export function assertTaskTransition(from: TaskStateKey, to: TaskStateKey): void {
  if (!canTaskTransition(from, to)) throw new TransitionError("task", from, to);
}

export function assertAttemptTransition(from: AttemptStateKey, to: AttemptStateKey): void {
  if (!canAttemptTransition(from, to)) throw new TransitionError("attempt", from, to);
}

export function assertOneNonterminalAttempt(states: readonly AttemptStateKey[]): void {
  const count = states.filter((state) => !state.startsWith("terminal:")).length;
  if (count > 1) throw new Error(`task has ${count} nonterminal Attempts`);
}

export type DedupeDecision = "new" | "duplicate" | "conflict";

export function decideRequestDedupe(
  existing: Readonly<{ requestId: string; semanticDigest: string }> | undefined,
  incoming: Readonly<{ requestId: string; semanticDigest: string }>,
): DedupeDecision {
  if (existing === undefined || existing.requestId !== incoming.requestId) return "new";
  return existing.semanticDigest === incoming.semanticDigest ? "duplicate" : "conflict";
}

export type CompletionMapping = Readonly<{
  criterionId: string;
  requirementIds: readonly string[];
  evidenceCount: number;
}>;

export function completionEvidenceErrors(
  mandatoryCriterionIds: readonly string[],
  requiredRequirementIds: Readonly<Record<string, readonly string[]>>,
  mappings: readonly CompletionMapping[],
): readonly string[] {
  const errors: string[] = [];
  const byCriterion = new Map<string, CompletionMapping>();
  for (const mapping of mappings) {
    if (byCriterion.has(mapping.criterionId)) {
      errors.push(`duplicate criterion mapping: ${mapping.criterionId}`);
      continue;
    }
    byCriterion.set(mapping.criterionId, mapping);
  }
  for (const criterionId of mandatoryCriterionIds) {
    const mapping = byCriterion.get(criterionId);
    if (mapping === undefined) {
      errors.push(`missing criterion evidence: ${criterionId}`);
      continue;
    }
    if (mapping.evidenceCount < 1) errors.push(`empty criterion evidence: ${criterionId}`);
    const actual = new Set(mapping.requirementIds);
    for (const requirementId of requiredRequirementIds[criterionId] ?? []) {
      if (!actual.has(requirementId)) errors.push(`missing requirement evidence: ${criterionId}/${requirementId}`);
    }
  }
  return errors.sort();
}
