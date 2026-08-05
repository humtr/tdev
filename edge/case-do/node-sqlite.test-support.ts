import { DatabaseSync } from "node:sqlite";
import {
  SqlStoreError,
  type SqlRow,
  type SqlRunResult,
  type SqlStore,
  type SqlValue,
} from "./sql.ts";

export class NodeSqliteDatabase implements SqlStore {
  readonly raw: DatabaseSync;
  private transactionOpen = false;

  constructor(path: string = ":memory:") {
    this.raw = new DatabaseSync(path);
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  all<T extends SqlRow = SqlRow>(sql: string, ...bindings: readonly SqlValue[]): readonly T[] {
    return this.raw.prepare(sql).all(...bindings) as T[];
  }

  get<T extends SqlRow = SqlRow>(sql: string, ...bindings: readonly SqlValue[]): T | undefined {
    return this.raw.prepare(sql).get(...bindings) as T | undefined;
  }

  run(sql: string, ...bindings: readonly SqlValue[]): SqlRunResult {
    const result = this.raw.prepare(sql).run(...bindings);
    return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  }

  transactionSync<T>(callback: () => T): T {
    if (this.transactionOpen) {
      throw new SqlStoreError("NESTED_TRANSACTION", "nested SQLite transactions are not supported");
    }
    this.raw.exec("BEGIN IMMEDIATE");
    this.transactionOpen = true;
    try {
      const result = callback();
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.raw.exec("ROLLBACK");
      } catch (rollbackError) {
        throw new SqlStoreError(
          "ROLLBACK_FAILED",
          "SQLite transaction failed and rollback also failed",
          { cause: error, rollbackCause: rollbackError },
        );
      }
      throw error;
    } finally {
      this.transactionOpen = false;
    }
  }

  close(): void {
    this.raw.close();
  }
}
