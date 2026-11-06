import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { performPunch } from "../lib/punch-server";
import { applyPunchDelta, completedTotal, projectPunch } from "../lib/punch-state";
import type { AppState, PendingPunch, PunchDelta, Session } from "../lib/model";
const user = "fast-punch-test",
  at = Date.parse("2026-11-01T03:00:00Z");
const state: AppState = {
  preferences: {
    timezone: "Asia/Tokyo",
    dayStart: 300,
    accent: "#168ab5",
    sidebar: "#000000",
    reminderEnabled: false,
    reminderMinutes: 360,
  },
  categories: [
    { id: "punch", name: "打刻", color: "#168ab5", hidden: false, archived: false, position: 0 },
  ],
  sessions: [],
  revision: 0,
  serverNow: at,
};
const pending: PendingPunch = { categoryId: "punch", mutationId: "test", baseRevision: 0, at };
function record(id: string, startedAt = at, endedAt: number | null = null): Session {
  return {
    id,
    categoryId: "punch",
    startedAt,
    endedAt,
    businessDay: "2026-11-01",
    dayStart: 300,
    timezone: "Asia/Tokyo",
    memo: "",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}
function database(beforeBatch?: (d: DatabaseSync, n: number) => void) {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("drizzle/" + file, "utf8"));
  sqlite.prepare("INSERT INTO preferences (user_id,seeded) VALUES (?,2)").run(user);
  sqlite
    .prepare(
      "INSERT INTO categories (user_id,id,name,color,position) VALUES (?,'punch','打刻','#168ab5',0),(?,'other','別の作業','#12a89a',1)",
    )
    .run(user, user);
  let calls = 0;
  const queries: string[] = [];
  const fake = {
    prepare(sql: string) {
      return {
        bind(...values: (string | number | null)[]) {
          return { sql, values };
        },
      };
    },
    async batch(list: { sql: string; values: (string | number | null)[] }[]) {
      calls++;
      beforeBatch?.(sqlite, calls);
      sqlite.exec("BEGIN");
      try {
        const out = list.map((q) => {
          queries.push(q.sql);
          const stmt = sqlite.prepare(q.sql);
          if (q.sql.trim().toUpperCase().startsWith("SELECT"))
            return { results: stmt.all(...q.values), meta: { changes: 0 }, success: true };
          const result = stmt.run(...q.values);
          return { results: [], meta: { changes: Number(result.changes) }, success: true };
        });
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return {
    sqlite,
    d: fake as unknown as D1Database,
    queries,
    get calls() {
      return calls;
    },
  };
}
function input(revision = 0, categoryId = "punch", mutationId = crypto.randomUUID()) {
  return { payload: { categoryId }, expectedRevision: revision, mutationId };
}

test("即時表示は確定データとrevisionを変更しない", () => {
  const projected = projectPunch(state, pending);
  assert.equal(projected.sessions.length, 1);
  assert.equal(projected.sessions[0].startedAt, at);
  assert.equal(projected.revision, 0);
  assert.equal(state.sessions.length, 0);
  assert.ok(projected.sessions[0].id.startsWith("pending:"));
});
test("通信失敗後は確定データだけで元の表示に戻せる", () => {
  const source = { ...state, sessions: [record("running", at - 10000)] };
  const provisional = projectPunch(source, pending);
  assert.equal(provisional.sessions[0].endedAt, at);
  assert.equal(source.sessions[0].endedAt, null);
});
test("先に別端末の更新を受け取ったら仮表示を再適用しない", () => {
  const next = { ...state, revision: 1, sessions: [record("saved")] };
  assert.equal(projectPunch(next, pending), next);
});
test("差分反映は既存履歴を保持し、仮IDを残さない", () => {
  const source = { ...state, sessions: [record("old", at - 2000, at - 1000)] };
  const delta: PunchDelta = {
    baseRevision: 0,
    revision: 1,
    serverNow: at + 10,
    sessions: [record("new")],
  };
  const merged = applyPunchDelta(source, delta)!;
  assert.deepEqual(
    merged.sessions.map((s) => s.id),
    ["new", "old"],
  );
  assert.equal(merged.sessions[1], source.sessions[0]);
  assert.equal(source.revision, 0);
});
test("古い差分は無視し、欠けたrevisionは全体取得を要求", () => {
  const delta: PunchDelta = {
    baseRevision: 1,
    revision: 2,
    serverNow: at,
    sessions: [record("new")],
  };
  assert.equal(applyPunchDelta(state, delta), null);
  const newer = { ...state, revision: 3 };
  assert.equal(applyPunchDelta(newer, delta), newer);
});
test("確定時間の集計に計測中の時間を二重加算しない", () => {
  assert.equal(completedTotal([record("old", at - 2000, at - 1000), record("running")]), 1000);
});
test("打刻は履歴全体を読まず2回のDBバッチで確定し、受信時刻を使う", async () => {
  const f = database();
  try {
    const result = await performPunch(f.d, user, input(), at);
    assert.ok(result);
    assert.equal(result.sessions[0].startedAt, at);
    assert.equal(result.revision, 1);
    assert.equal(f.calls, 2);
    assert.ok(
      f.queries
        .filter((s) => s.startsWith("SELECT") && s.includes("FROM sessions"))
        .every((s) => s.includes("ended_at IS NULL") || s.includes("LIMIT 1")),
    );
  } finally {
    f.sqlite.close();
  }
});
test("開始・ボタンによる並行追加・個別終了と再試行の冪等性", async () => {
  const f = database();
  try {
    const first = await performPunch(f.d, user, input(), at);
    assert.ok(first);
    const nextInput = input(1, "other");
    const next = await performPunch(f.d, user, nextInput, at + 1000);
    assert.ok(next);
    assert.equal(next.sessions.length, 1);
    assert.equal(next.sessions[0].id, first.sessions[0].id);
    assert.equal(next.sessions[0].endedAt, null);
    assert.deepEqual(
      next.sessions[0].work!.members.map((m) => m.categoryId),
      ["punch", "other"],
    );
    assert.equal(await performPunch(f.d, user, nextInput, at + 2000), null);
    const stop = await performPunch(f.d, user, input(2, "other"), at + 3000);
    assert.ok(stop);
    assert.equal(stop.sessions[0].endedAt, null);
    assert.equal(stop.sessions[0].work!.members[1].endedAt, at + 3000);
    await performPunch(f.d, user, input(3), at + 4000);
    assert.equal(
      f.sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE ended_at IS NULL").get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});
test("途中で競合しても打刻を部分保存しない", async () => {
  const f = database((d, n) => {
    if (n === 2) d.exec("UPDATE preferences SET revision=1,mutation_token='other-device'");
  });
  try {
    await assert.rejects(() => performPunch(f.d, user, input(), at), /別の画面/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get()?.n, 0);
  } finally {
    f.sqlite.close();
  }
});
test("アーカイブした項目・他人の項目には打刻できない", async () => {
  const f = database();
  try {
    f.sqlite.exec("UPDATE categories SET archived=1 WHERE id='punch'");
    await assert.rejects(() => performPunch(f.d, user, input(), at), /見つかりません/);
    await assert.rejects(() => performPunch(f.d, "unknown", input(), at), /再読み込み/);
  } finally {
    f.sqlite.close();
  }
});
test("サーバー時刻のずれがあっても既存区間に重ねない", async () => {
  const f = database();
  try {
    await performPunch(f.d, user, input(), at);
    const result = await performPunch(f.d, user, input(1), at - 1000);
    assert.ok(result);
    assert.equal(result.sessions[0].endedAt, at);
  } finally {
    f.sqlite.close();
  }
});

test("通信が遅れても調整済みの押下時刻を記録する", async () => {
  const f = database();
  try {
    const result = await performPunch(f.d, user, { ...input(), pressedAt: at - 1500 }, at);
    assert.equal(result?.sessions[0].startedAt, at - 1500);
  } finally {
    f.sqlite.close();
  }
});
test("不正・古すぎる端末時刻にはサーバー受信時刻を使う", async () => {
  for (const pressedAt of [at - 60001, at + 2001]) {
    const f = database();
    try {
      const result = await performPunch(f.d, user, { ...input(), pressedAt }, at);
      assert.equal(result?.sessions[0].startedAt, at);
    } finally {
      f.sqlite.close();
    }
  }
});
test("日の区切りをまたいで届いても押下した日へ計上する", async () => {
  const f = database();
  try {
    const pressedAt = Date.parse("2026-11-02T04:59:59+09:00"),
      receivedAt = Date.parse("2026-11-02T05:00:01+09:00");
    const result = await performPunch(f.d, user, { ...input(), pressedAt }, receivedAt);
    assert.equal(result?.sessions[0].businessDay, "2026-11-01");
  } finally {
    f.sqlite.close();
  }
});

test("打刻差分が遅れても先に保存したメモを巻き戻さない", () => {
  const source = { ...state, sessions: [{ ...record("running"), memo: "保存済みのメモ" }] };
  const next = applyPunchDelta(source, {
    baseRevision: 0,
    revision: 1,
    serverNow: at + 1000,
    sessions: [record("running", at, at + 1000)],
  });
  assert.equal(next?.sessions[0].memo, "保存済みのメモ");
  assert.equal(next?.sessions[0].endedAt, at + 1000);
});

test("並行数の上限を超えても仮表示で画面を壊さず確定状態を保つ", () => {
  const ids = Array.from({ length: 50 }, (_, i) => (i ? "work-" + i : "punch"));
  const s: Session = {
    ...record("running"),
    work: {
      version: 1,
      mode: "auto",
      members: ids.map((categoryId) => ({ categoryId, memo: "", state: "active", weight: 1 })),
      intervals: [{ start: at, end: null, categoryIds: ids }],
    },
  };
  const source = { ...state, sessions: [s] };
  assert.equal(projectPunch(source, { ...pending, categoryId: "other" }), source);
  assert.equal(s.work!.members.length, 50);
});
