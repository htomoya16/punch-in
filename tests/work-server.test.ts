import assert from "node:assert/strict";
import test from "node:test";
import { calculateAllocatedDurationsByCategory } from "../src/domain/tracking/duration-allocation";
import { getWorkEntryTimeRange } from "../src/domain/tracking/work-entry-intervals";
import { writeSessionMemo } from "../src/infrastructure/persistence/d1/work-entry-memo-repository";
import { fixture } from "./d1-fixture";
import {
  mapTrackingSessionRow,
  persistPunch,
  persistTrackingCommand,
} from "./support/tracking-usecases";
const at = Date.parse("2026-11-01T01:00:00Z"),
  user = "owner";
async function setup() {
  const f = fixture();
  f.sqlite.exec(
    "INSERT INTO preferences(user_id,seeded)VALUES('owner',2);INSERT INTO categories(user_id,id,name,color)VALUES('owner','a','A','#000000'),('owner','b','B','#000000')",
  );
  const first = await persistPunch(
    f.db,
    user,
    { payload: { categoryId: "a" }, expectedRevision: 0, mutationId: crypto.randomUUID() },
    at,
  );
  return { ...f, id: first!.sessions[0].id };
}
async function work(
  f: Awaited<ReturnType<typeof setup>>,
  control: string,
  categoryId?: string,
  extra = {},
) {
  const revision = Number(f.sqlite.prepare("SELECT revision FROM preferences").get()!.revision);
  return persistTrackingCommand(
    f.db,
    user,
    {
      payload: { id: f.id, control, categoryId, ...extra },
      expectedRevision: revision,
      mutationId: crypto.randomUUID(),
    },
    at + 60000 * 20,
  );
}
test("並行追加・メモ・一時停止は永続化し所有者だけ操作できる", async () => {
  const f = await setup();
  try {
    await work(f, "join", "b");
    await writeSessionMemo(f.db, user, {
      id: f.id,
      categoryId: "b",
      memo: "B note",
      expectedMemo: "",
    });
    await work(f, "pause", "a");
    const s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(s.work!.members[1].memo, "B note");
    assert.equal(s.work!.members[0].state, "paused");
    assert.equal(s.endedAt, null);
    await assert.rejects(
      () =>
        persistTrackingCommand(
          f.db,
          "other",
          {
            payload: { id: f.id, control: "end" },
            expectedRevision: 0,
            mutationId: crypto.randomUUID(),
          },
          at,
        ),
      /別の画面/,
    );
  } finally {
    f.sqlite.close();
  }
});
test("構造更新の直前に保存された作業メモも原子的に保持する", async () => {
  const f = await setup();
  try {
    await work(f, "join", "b");
    let n = 0;
    f.onBatch(() => {
      if (++n === 2)
        f.sqlite
          .prepare("UPDATE sessions SET work=json_set(work,'$.members[1].memo','concurrent')")
          .run();
    });
    await work(f, "pause", "a");
    assert.equal(
      mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!).work!.members[1]
        .memo,
      "concurrent",
    );
  } finally {
    f.sqlite.close();
  }
});
test("作業メモCAS競合は他の作業メモを上書きしない", async () => {
  const f = await setup();
  try {
    await work(f, "join", "b");
    await writeSessionMemo(f.db, user, {
      id: f.id,
      categoryId: "a",
      memo: "A note",
      expectedMemo: "",
    });
    await writeSessionMemo(f.db, user, {
      id: f.id,
      categoryId: "b",
      memo: "B note",
      expectedMemo: "",
    });
    await assert.rejects(
      () =>
        writeSessionMemo(f.db, user, {
          id: f.id,
          categoryId: "b",
          memo: "stale",
          expectedMemo: "",
        }),
      /別の画面/,
    );
    const s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.deepEqual(
      s.work!.members.map((m) => m.memo),
      ["A note", "B note"],
    );
    assert.equal(s.memo, "A note");
  } finally {
    f.sqlite.close();
  }
});
test("手動時間は独立して保存し共通の開始終了を変えない", async () => {
  const f = await setup();
  try {
    await work(f, "join", "b");
    await work(f, "end");
    await work(f, "allocate", undefined, { mode: "manual", values: { a: 3600000, b: 2700000 } });
    const s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(s.startedAt, at);
    assert.equal(s.endedAt, at + 1200000);
    assert.deepEqual([...calculateAllocatedDurationsByCategory(s, 0).values()], [3600000, 2700000]);
  } finally {
    f.sqlite.close();
  }
});
test("並行記録の通常打刻は対象だけ終了し、最後で親を終了", async () => {
  const f = await setup();
  try {
    await work(f, "join", "b");
    await persistPunch(
      f.db,
      user,
      { payload: { categoryId: "a" }, expectedRevision: 2, mutationId: crypto.randomUUID() },
      at + 1300000,
    );
    assert.equal(f.sqlite.prepare("SELECT ended_at FROM sessions").get()!.ended_at, null);
    await persistPunch(
      f.db,
      user,
      { payload: { categoryId: "b" }, expectedRevision: 3, mutationId: crypto.randomUUID() },
      at + 1400000,
    );
    assert.equal(f.sqlite.prepare("SELECT ended_at FROM sessions").get()!.ended_at, at + 1400000);
  } finally {
    f.sqlite.close();
  }
});

test("先頭作業だけ削除しても残るメモと主カテゴリを保持し再配分する", async () => {
  const f = await setup();
  try {
    await work(f, "join", "b");
    await writeSessionMemo(f.db, user, {
      id: f.id,
      categoryId: "b",
      memo: "keep",
      expectedMemo: "",
    });
    await work(f, "end");
    await work(f, "remove", "a");
    let s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(s.categoryId, "b");
    assert.equal(s.memo, "keep");
    assert.equal(s.work!.members.length, 1);
    assert.equal(calculateAllocatedDurationsByCategory(s, 0).get("b"), 0);
    await writeSessionMemo(f.db, user, {
      id: f.id,
      categoryId: "b",
      memo: "after shift",
      expectedMemo: "keep",
    });
    s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(s.work!.members[0].memo, "after shift");
    assert.equal(s.memo, "after shift");
  } finally {
    f.sqlite.close();
  }
});
test("削除直前に別端末が保存した残るメモを巻き戻さない", async () => {
  const f = await setup();
  try {
    await work(f, "join", "b");
    let n = 0;
    f.onBatch(() => {
      if (++n === 2)
        f.sqlite
          .prepare("UPDATE sessions SET work=json_set(work,'$.members[1].memo','fresh')")
          .run();
    });
    await work(f, "remove", "a");
    const s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(s.memo, "fresh");
    assert.equal(s.work!.members[0].memo, "fresh");
  } finally {
    f.sqlite.close();
  }
});
test("一時停止後の終了時刻は最後の計測区間の終端にそろえる", async () => {
  const f = await setup();
  try {
    await work(f, "pause", "a");
    await persistTrackingCommand(
      f.db,
      user,
      {
        payload: { id: f.id, control: "finish", categoryId: "a" },
        expectedRevision: 2,
        mutationId: crypto.randomUUID(),
      },
      at + 3600000,
    );
    const s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(getWorkEntryTimeRange(s, "a").end, at + 1200000);
    assert.equal(s.endedAt, at + 1200000);
    assert.equal(s.work!.intervals[0].end, at + 1200000);
  } finally {
    f.sqlite.close();
  }
});
