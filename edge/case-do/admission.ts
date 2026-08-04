import { createHash } from "node:crypto";
import type {
  CaseContract,
  CaseState,
  JsonValue,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { StorageError } from "./schema.ts";

export const NEW_CASE_ROUTE_DOMAIN = "tdev.new-case-route.v1";

export type CaseSummaryV1 = Readonly<{
  caseId: string;
  caseRevision: number;
  status: CaseState["status"];
  eventSequence: number;
  contractDigest: string;
}>;

export type SubmitOperationResultV1 = Readonly<{
  accepted: true;
  deduplicated: boolean;
  case: CaseSummaryV1;
  task: TaskRecord;
  continuing: true;
}>;

function storedInvalid(message: string): never {
  throw new StorageError("STORAGE_CORRUPT", "STORED_ADMISSION_RESPONSE", message);
}

function record(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    storedInvalid(`${path} must be a JSON object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    storedInvalid(`${path} has unexpected or missing keys`);
  }
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    storedInvalid(`${path} must be a positive safe integer`);
  }
  return value as number;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    storedInvalid(`${path} must be a non-empty string`);
  }
  return value;
}

function digest(value: unknown, path: string): string {
  const result = nonEmptyString(value, path);
  if (!/^[0-9a-f]{64}$/.test(result)) {
    storedInvalid(`${path} must be a lowercase SHA-256 digest`);
  }
  return result;
}

export function deriveNewCaseId(m1DeploymentId: string, requestId: string): string {
  if (m1DeploymentId.length === 0 || requestId.length === 0 || m1DeploymentId.includes("\0") || requestId.includes("\0")) {
    throw new StorageError("STORAGE_INPUT_INVALID", "NEW_CASE_ROUTE_INPUT", "deployment ID and request ID must be non-empty and must not contain NUL");
  }
  const routeBytes = `${NEW_CASE_ROUTE_DOMAIN}\0${m1DeploymentId}\0${requestId}`;
  return `case_${createHash("sha256").update(routeBytes, "utf8").digest("hex")}`;
}

export function buildSubmitOperationResult(
  contract: CaseContract,
  state: CaseState,
  task: TaskRecord,
  deduplicated: boolean,
): SubmitOperationResultV1 {
  return Object.freeze({
    accepted: true,
    deduplicated,
    case: Object.freeze({
      caseId: contract.caseId,
      caseRevision: state.caseRevision,
      status: state.status,
      eventSequence: state.eventSequence,
      contractDigest: contract.contractDigest,
    }),
    task,
    continuing: true,
  });
}

export function parseStoredSubmitOperationResult(value: JsonValue): SubmitOperationResultV1 {
  const root = record(value, "$response");
  exactKeys(root, ["accepted", "deduplicated", "case", "task", "continuing"], "$response");
  if (root.accepted !== true || root.deduplicated !== false || root.continuing !== true) {
    storedInvalid("stored admission response has invalid fixed fields");
  }
  const caseValue = record(root.case, "$response.case");
  exactKeys(caseValue, ["caseId", "caseRevision", "status", "eventSequence", "contractDigest"], "$response.case");
  const status = record(caseValue.status, "$response.case.status") as CaseState["status"];
  const task = record(root.task, "$response.task") as TaskRecord;
  return Object.freeze({
    accepted: true,
    deduplicated: false,
    case: Object.freeze({
      caseId: nonEmptyString(caseValue.caseId, "$response.case.caseId"),
      caseRevision: positiveInteger(caseValue.caseRevision, "$response.case.caseRevision"),
      status,
      eventSequence: positiveInteger(caseValue.eventSequence, "$response.case.eventSequence"),
      contractDigest: digest(caseValue.contractDigest, "$response.case.contractDigest"),
    }),
    task,
    continuing: true,
  });
}

export function admissionResultJson(result: SubmitOperationResultV1): JsonValue {
  return result as unknown as JsonValue;
}
