import {
  SqlStoreError,
  type SqlRow,
  type SqlRunResult,
  type SqlStore,
  type SqlValue,
} from "./sql.ts";

export interface CloudflareSqlCursor<T extends SqlRow = SqlRow> extends Iterable<T> {
  readonly rowsRead?: number;
  readonly rowsWritten?: number;
}

export interface CloudflareSqlExecutor {
  exec<T extends SqlRow = SqlRow>(sql: string, ...bindings: readonly SqlValue[]): CloudflareSqlCursor<T>;
}

export interface CloudflareDurableObjectStorageLike {
  readonly sql: CloudflareSqlExecutor;
  transactionSync<T>(callback: () => T): T;
}

function consume<T extends SqlRow>(cursor: CloudflareSqlCursor<T>): readonly T[] {
  return Object.freeze(Array.from(cursor));
}

export class CloudflareSqliteStore implements SqlStore {
  readonly storage: CloudflareDurableObjectStorageLike;
  private transactionOpen = false;

  constructor(storage: CloudflareDurableObjectStorageLike) {
    this.storage = storage;
  }

  exec(sql: string): void {
    consume(this.storage.sql.exec(sql));
  }

  all<T extends SqlRow = SqlRow>(sql: string, ...bindings: readonly SqlValue[]): readonly T[] {
    return consume(this.storage.sql.exec<T>(sql, ...bindings));
  }

  get<T extends SqlRow = SqlRow>(sql: string, ...bindings: readonly SqlValue[]): T | undefined {
    return this.all<T>(sql, ...bindings)[0];
  }

  run(sql: string, ...bindings: readonly SqlValue[]): SqlRunResult {
    const cursor = this.storage.sql.exec(sql, ...bindings);
    consume(cursor);
    return Object.freeze({ changes: Number(cursor.rowsWritten ?? 0) });
  }

  transactionSync<T>(callback: () => T): T {
    if (this.transactionOpen) {
      throw new SqlStoreError("NESTED_TRANSACTION", "nested Durable Object transactions are not supported");
    }
    this.transactionOpen = true;
    try {
      return this.storage.transactionSync(callback);
    } finally {
      this.transactionOpen = false;
    }
  }
}
