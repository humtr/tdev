export type SqlValue = null | string | number | bigint | Uint8Array;

export type SqlRow = Readonly<Record<string, SqlValue>>;

export type SqlRunResult = Readonly<{
  changes: number;
  lastInsertRowid?: number | bigint;
}>;

export interface SqlDatabase {
  exec(sql: string): void;
  all<T extends SqlRow = SqlRow>(sql: string, ...bindings: readonly SqlValue[]): readonly T[];
  get<T extends SqlRow = SqlRow>(sql: string, ...bindings: readonly SqlValue[]): T | undefined;
  run(sql: string, ...bindings: readonly SqlValue[]): SqlRunResult;
}

export type SqlStoreErrorCode = "NESTED_TRANSACTION" | "ROLLBACK_FAILED";

export class SqlStoreError extends Error {
  readonly code: SqlStoreErrorCode;
  readonly rollbackCause: unknown;

  constructor(
    code: SqlStoreErrorCode,
    message: string,
    options?: Readonly<{ cause?: unknown; rollbackCause?: unknown }>,
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SqlStoreError";
    this.code = code;
    this.rollbackCause = options?.rollbackCause;
  }
}

export interface SqlStore extends SqlDatabase {
  transactionSync<T>(callback: () => T): T;
}
