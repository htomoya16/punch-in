import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
export function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("drizzle/" + file, "utf8"));
  let beforeBatch: undefined | (() => void);
  function prepare(sql: string) {
    let args: (string | number | null)[] = [];
    const execute = () => {
      const stmt = sqlite.prepare(sql);
      const rows = /^\s*SELECT|\bRETURNING\b/i.test(sql) ? stmt.all(...args) : [];
      const changes =
        rows.length ||
        (!/^\s*SELECT|\bRETURNING\b/i.test(sql) ? Number(stmt.run(...args).changes) : 0);
      return { results: rows, meta: { changes }, success: true };
    };
    return {
      bind(...values: (string | number | null)[]) {
        args = values;
        return this;
      },
      async first() {
        return execute().results[0] ?? null;
      },
      async all() {
        return execute();
      },
      async run() {
        return execute();
      },
      execute,
    };
  }
  const db = {
    prepare,
    async batch(queries: ReturnType<typeof prepare>[]) {
      beforeBatch?.();
      sqlite.exec("BEGIN");
      try {
        const results = queries.map((q) => q.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  return {
    sqlite,
    db,
    onBatch(fn: () => void) {
      beforeBatch = fn;
    },
  };
}
