import { DatabaseSync } from "node:sqlite";
import type { SqlDatabase, SqlRow, SqlRunResult, SqlValue } from "./sql.ts";

export class NodeSqliteDatabase implements SqlDatabase {
  readonly raw: DatabaseSync;

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

  close(): void {
    this.raw.close();
  }
}
