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
