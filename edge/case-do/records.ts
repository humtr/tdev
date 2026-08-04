import { createHash } from "node:crypto";
import {
  CANONICAL_SCHEMA_DIGEST,
  type AttemptRecord,
  type CaseContract,
  type CaseEvent,
  type CaseState,
  type CaseTargetGrant,
  type EvidenceSet,
  type MutationReceiptV1,
  type TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { canonicalize } from "../../protocol/runtime/typescript/canonical.ts";
import { parseRawIngress } from "../../protocol/runtime/typescript/ingress.ts";
import { SchemaValidator, type ValidationProofV1 } from "../../protocol/runtime/typescript/schema.ts";
import { StorageError } from "./schema.ts";

const encoder = new TextEncoder();

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function canonicalJsonDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function encodeCanonicalJson(value: unknown): Uint8Array {
  try {
    return encoder.encode(canonicalize(value));
  } catch (error) {
    throw new StorageError("STORAGE_INPUT_INVALID", "CANONICAL_JSON", "value cannot be encoded as canonical JSON", { cause: error });
  }
}

export function decodeCanonicalJson(bytes: Uint8Array): unknown {
  let value: unknown;
  try {
    value = parseRawIngress(bytes);
  } catch (error) {
    throw new StorageError("STORAGE_CORRUPT", "INVALID_CANONICAL_JSON", "stored JSON bytes failed lossless ingress validation", { cause: error });
  }
  const canonicalBytes = encodeCanonicalJson(value);
  if (!equalBytes(bytes, canonicalBytes)) {
    throw new StorageError("STORAGE_CORRUPT", "NON_CANONICAL_JSON", "stored JSON bytes are not the exact canonical encoding");
  }
  return value;
}

export type StoredCanonicalRecord<T> = Readonly<{
  value: T;
  proof: ValidationProofV1;
  bytes: Uint8Array;
  digest: string;
}>;

export class StoredRecordCodec<T> {
  readonly definition: string;
  readonly validator: SchemaValidator;

  constructor(validator: SchemaValidator, definition: string) {
    this.validator = validator;
    this.definition = definition;
    if (validator.schemaDigest !== CANONICAL_SCHEMA_DIGEST) {
      throw new StorageError(
        "STORAGE_VERSION_MISMATCH",
        "CANONICAL_SCHEMA_DIGEST",
        "storage codec schema digest does not match the generated canonical schema",
      );
    }
  }

  encode(value: unknown): StoredCanonicalRecord<T> {
    const { proof, errors } = this.validator.validateDefinitionWithProof(this.definition, value);
    if (proof === null || errors.length !== 0) {
      throw new StorageError(
        "STORAGE_INPUT_INVALID",
        "SCHEMA_INVALID",
        `${this.definition} failed canonical schema validation`,
      );
    }
    if (proof.schemaDigest !== CANONICAL_SCHEMA_DIGEST || proof.rootDefinition !== this.definition) {
      throw new StorageError("STORAGE_INPUT_INVALID", "PROOF_BINDING", "canonical validation proof is not bound to the storage definition");
    }
    const bytes = encodeCanonicalJson(value);
    return Object.freeze({ value: value as T, proof, bytes, digest: canonicalJsonDigest(bytes) });
  }

  decode(bytes: Uint8Array, expectedDigest: string): StoredCanonicalRecord<T> {
    const value = decodeCanonicalJson(bytes);
    const actualDigest = canonicalJsonDigest(bytes);
    if (actualDigest !== expectedDigest) {
      throw new StorageError("STORAGE_CORRUPT", "DIGEST_MISMATCH", `${this.definition} stored digest does not match canonical bytes`);
    }
    const { proof, errors } = this.validator.validateDefinitionWithProof(this.definition, value);
    if (proof === null || errors.length !== 0) {
      throw new StorageError("STORAGE_CORRUPT", "SCHEMA_INVALID", `${this.definition} stored value failed canonical schema validation`);
    }
    if (proof.schemaDigest !== CANONICAL_SCHEMA_DIGEST || proof.rootDefinition !== this.definition) {
      throw new StorageError("STORAGE_CORRUPT", "PROOF_BINDING", "stored value proof is not bound to the canonical storage definition");
    }
    return Object.freeze({ value: value as T, proof, bytes, digest: actualDigest });
  }
}

export type CaseDoRecordCodecs = Readonly<{
  caseContract: StoredRecordCodec<CaseContract>;
  caseState: StoredRecordCodec<CaseState>;
  caseTargetGrant: StoredRecordCodec<CaseTargetGrant>;
  taskRecord: StoredRecordCodec<TaskRecord>;
  attemptRecord: StoredRecordCodec<AttemptRecord>;
  caseEvent: StoredRecordCodec<CaseEvent>;
  evidenceSet: StoredRecordCodec<EvidenceSet>;
  mutationReceipt: StoredRecordCodec<MutationReceiptV1>;
}>;

export function createCaseDoRecordCodecs(validator: SchemaValidator): CaseDoRecordCodecs {
  return Object.freeze({
    caseContract: new StoredRecordCodec<CaseContract>(validator, "CaseContract"),
    caseState: new StoredRecordCodec<CaseState>(validator, "CaseState"),
    caseTargetGrant: new StoredRecordCodec<CaseTargetGrant>(validator, "CaseTargetGrant"),
    taskRecord: new StoredRecordCodec<TaskRecord>(validator, "TaskRecord"),
    attemptRecord: new StoredRecordCodec<AttemptRecord>(validator, "AttemptRecord"),
    caseEvent: new StoredRecordCodec<CaseEvent>(validator, "CaseEvent"),
    evidenceSet: new StoredRecordCodec<EvidenceSet>(validator, "EvidenceSet"),
    mutationReceipt: new StoredRecordCodec<MutationReceiptV1>(validator, "MutationReceiptV1"),
  });
}
