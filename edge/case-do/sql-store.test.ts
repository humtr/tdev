import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { CloudflareSqliteStore, type CloudflareSqlCursor, type CloudflareDurableObjectStorageLike } from "./cloudflare-sqlite.ts";
import { NodeSqliteDatabase } from "./node-sqlite.test-support.ts";
import { CASE_DO_LOGICAL_MIGRATION_BYTES } from "./schema.ts";
import { SqlStoreError, type SqlRow, type SqlValue } from "./sql.ts";

test("Node SqlStore rolls back the callback and rejects nesting", () => {
  const db = new NodeSqliteDatabase();
  try {
    db.exec("CREATE TABLE values_table (value INTEGER NOT NULL) STRICT");
    const sentinel = new Error("sentinel");
    assert.throws(
      () => db.transactionSync(() => {
        db.run("INSERT INTO values_table(value) VALUES(?)", 1);
        throw sentinel;
      }),
      (error: unknown) => error === sentinel,
    );
    assert.equal(db.get<{ count: number } & SqlRow>("SELECT COUNT(*) AS count FROM values_table")?.count, 0);
    assert.throws(
      () => db.transactionSync(() => db.transactionSync(() => undefined)),
      (error: unknown) => error instanceof SqlStoreError && error.code === "NESTED_TRANSACTION",
    );
  } finally {
    db.close();
  }
});

class FakeCursor<T extends SqlRow> implements CloudflareSqlCursor<T> {
  readonly rowsWritten: number;
  readonly values: readonly T[];
  consumed = 0;

  constructor(values: readonly T[], rowsWritten = 0) {
    this.values = values;
    this.rowsWritten = rowsWritten;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (const value of this.values) {
      this.consumed += 1;
      yield value;
    }
  }
}

test("Cloudflare SqlStore owns callback transactions and eagerly consumes cursors", () => {
  const cursors: FakeCursor<SqlRow>[] = [];
  let begins = 0;
  let commits = 0;
  let rollbacks = 0;
  const storage: CloudflareDurableObjectStorageLike = {
    sql: {
      exec<T extends SqlRow = SqlRow>(sql: string, ..._bindings: readonly SqlValue[]): CloudflareSqlCursor<T> {
        const cursor = sql === "SELECT values"
          ? new FakeCursor<SqlRow>([{ value: 1 }, { value: 2 }])
          : new FakeCursor<SqlRow>([], 3);
        cursors.push(cursor);
        return cursor as unknown as CloudflareSqlCursor<T>;
      },
    },
    transactionSync<T>(callback: () => T): T {
      begins += 1;
      try {
        const value = callback();
        commits += 1;
        return value;
      } catch (error) {
        rollbacks += 1;
        throw error;
      }
    },
  };
  const store = new CloudflareSqliteStore(storage);
  const rows = store.all<{ value: number } & SqlRow>("SELECT values");
  assert.deepEqual(rows.map((row) => row.value), [1, 2]);
  assert.equal(cursors[0].consumed, 2);
  assert.equal(store.run("UPDATE values").changes, 3);
  assert.equal(cursors[1].consumed, 0);

  const sentinel = new Error("rollback");
  assert.throws(() => store.transactionSync(() => { throw sentinel; }), (error: unknown) => error === sentinel);
  assert.deepEqual({ begins, commits, rollbacks }, { begins: 1, commits: 0, rollbacks: 1 });
  assert.throws(
    () => store.transactionSync(() => store.transactionSync(() => undefined)),
    (error: unknown) => error instanceof SqlStoreError && error.code === "NESTED_TRANSACTION",
  );
  assert.deepEqual({ begins, commits, rollbacks }, { begins: 2, commits: 0, rollbacks: 2 });
});


test("only the Node adapter owns SQL transaction-control calls", () => {
  const directTransactionSql = /\.(?:exec|run|all|get)\s*\(\s*["'`](?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i;
  const files = readdirSync(new URL(".", import.meta.url))
    .filter((file) => file.endsWith(".ts") && file !== "node-sqlite.test-support.ts");
  for (const file of files) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, directTransactionSql, file);
  }
  assert.doesNotMatch(CASE_DO_LOGICAL_MIGRATION_BYTES, /(?:^|\n)\s*(?:BEGIN(?:\s+IMMEDIATE)?|COMMIT|ROLLBACK|SAVEPOINT(?:\s+\S+)?)\s*;?\s*(?:\n|$)/i);
  const nodeAdapter = readFileSync(new URL("./node-sqlite.test-support.ts", import.meta.url), "utf8");
  assert.match(nodeAdapter, /BEGIN IMMEDIATE/);
  assert.match(nodeAdapter, /COMMIT/);
  assert.match(nodeAdapter, /ROLLBACK/);
});
