import assert from "node:assert/strict";
import test from "node:test";
import { sessionSchema } from "../src/application/validation/backup-schema";
import {
  calculateAllocatedDurationsByCategory,
  calculateAllocatedDurationsByEntry,
  calculateRecordedDuration,
} from "../src/domain/tracking/duration-allocation";
import type { TrackingSession } from "../src/domain/tracking/tracking-session";
import { applyTrackingCommand, removeWorkEntry } from "../src/domain/tracking/tracking-transitions";
import { getWorkEntries, getWorkEntryId } from "../src/domain/tracking/work-entry";
import { getWorkEntryTimeRange } from "../src/domain/tracking/work-entry-intervals";
import {
  getWorkEntryMemoKey,
  preserveWorkEntryMemos,
  updateWorkEntryMemo,
} from "../src/domain/tracking/work-entry-memo";
import { writeSessionMemo } from "../src/infrastructure/persistence/d1/work-entry-memo-repository";
import { fixture } from "./d1-fixture";
import {
  mapTrackingSessionRow,
  persistPunch,
  persistTrackingCommand,
} from "./support/tracking-usecases";
const start = Date.parse("2026-11-03T01:00:00Z"),
  minute = 60000;
const base: TrackingSession = {
  id: "parent",
  categoryId: "a",
  startedAt: start,
  endedAt: null,
  businessDay: "2026-11-03",
  dayStart: 300,
  timezone: "Asia/Tokyo",
  memo: "A first",
  createdAt: start,
  updatedAt: start,
};
function repeat() {
  let s = applyTrackingCommand(base, "join", "b", start);
  s = applyTrackingCommand(s, "finish", "a", start + 20 * minute);
  s = applyTrackingCommand(s, "join", "a", start + 40 * minute, "a-second");
  return s;
}
test("同じ親内の終了・再打刻は別ID・別メモでA1/A2/Bを保持しカテゴリでは合算する", () => {
  const s = applyTrackingCommand(repeat(), "end", "", start + 60 * minute);
  assert.equal(getWorkEntries(s).length, 3);
  assert.equal(getWorkEntries(s)[0].memo, "A first");
  assert.equal(getWorkEntries(s)[2].memo, "");
  assert.deepEqual(
    [...calculateAllocatedDurationsByEntry(s, 0)],
    [
      ["a", 10 * minute],
      ["b", 40 * minute],
      ["a-second", 10 * minute],
    ],
  );
  assert.deepEqual(
    [...calculateAllocatedDurationsByCategory(s, 0)],
    [
      ["a", 20 * minute],
      ["b", 40 * minute],
    ],
  );
  assert.equal(getWorkEntryTimeRange(s, "a").end, start + 20 * minute);
  assert.equal(getWorkEntryTimeRange(s, "a-second").start, start + 40 * minute);
  assert.equal(calculateRecordedDuration(s, 0), 60 * minute);
  assert.ok(sessionSchema.safeParse(s).success);
});
test("一時停止・再開では同じ記録IDとメモのまま継続する", () => {
  let s = applyTrackingCommand(base, "pause", "a", start + minute);
  s = applyTrackingCommand(s, "resume", "a", start + 2 * minute);
  assert.equal(getWorkEntries(s).length, 1);
  assert.equal(getWorkEntries(s)[0].memo, "A first");
  assert.equal(getWorkEntryTimeRange(s, "a").start, start);
});
test("一括終了は各自の停止時刻を使い、親は最も遅い終了時刻にする", () => {
  let s = applyTrackingCommand(base, "join", "b", start);
  s = applyTrackingCommand(s, "pause", "a", start + 10 * minute);
  s = applyTrackingCommand(s, "pause", "b", start + 20 * minute);
  s = applyTrackingCommand(s, "end", "", start + 60 * minute);
  assert.equal(getWorkEntryTimeRange(s, "a").end, start + 10 * minute);
  assert.equal(getWorkEntryTimeRange(s, "b").end, start + 20 * minute);
  assert.equal(s.endedAt, start + 20 * minute);
  assert.equal(s.updatedAt, start + 60 * minute);
  assert.ok(sessionSchema.safeParse(s).success);
});
test("再開直後に停止したゼロ秒の記録も開始時刻で終了できる", () => {
  let s = applyTrackingCommand(repeat(), "pause", "a", start + 40 * minute);
  s = applyTrackingCommand(s, "finish", "a", start + 50 * minute);
  assert.equal(getWorkEntryTimeRange(s, "a-second").end, start + 40 * minute);
  assert.ok(sessionSchema.safeParse(s).success);
});
test("後から追加した記録の差分に古い同カテゴリのメモをコピーしない", () => {
  const s = repeat(),
    old = updateWorkEntryMemo(s, getWorkEntryMemoKey(s, "a"), "fresh first");
  const changed = preserveWorkEntryMemos(
    applyTrackingCommand(s, "pause", "b", start + 50 * minute),
    old,
  );
  assert.equal(getWorkEntries(changed)[0].memo, "fresh first");
  assert.equal(getWorkEntries(changed)[2].memo, "");
});
test("A1だけの削除はA2とBの時刻・メモを保ち、共有区間を再配分する", () => {
  let s = applyTrackingCommand(repeat(), "end", "", start + 60 * minute);
  s = updateWorkEntryMemo(s, getWorkEntryMemoKey(s, "a-second"), "second memo");
  s = removeWorkEntry(s, "a", start + 61 * minute);
  assert.deepEqual(getWorkEntries(s).map(getWorkEntryId), ["b", "a-second"]);
  assert.equal(getWorkEntries(s)[1].memo, "second memo");
  assert.equal(calculateAllocatedDurationsByEntry(s, 0).get("a-second"), 10 * minute);
  assert.equal(calculateRecordedDuration(s, 0), 60 * minute);
  assert.ok(sessionSchema.safeParse(s).success);
});
test("同じカテゴリを同時に二重起動する不正なバックアップを拒否する", () => {
  const s = repeat();
  s.work!.members[0].state = "active";
  assert.equal(sessionSchema.safeParse(s).success, false);
});
test("同じカテゴリの別記録へ区間IDを付け替えたバックアップを拒否する", () => {
  const s = applyTrackingCommand(repeat(), "end", "", start + 60 * minute);
  s.work!.intervals[0].memberIds = ["a-second", "b"];
  assert.equal(sessionSchema.safeParse(s).success, false);
});
test("再打刻IDは押下時刻が補正されても同じ操作IDを保つ", () => {
  const before = applyTrackingCommand(
      applyTrackingCommand(base, "join", "b", start),
      "finish",
      "a",
      start + minute,
    ),
    first = applyTrackingCommand(before, "join", "a", start + 2 * minute, "mutation-id"),
    corrected = applyTrackingCommand(before, "join", "a", start + 2 * minute + 100, "mutation-id");
  assert.equal(
    getWorkEntryId(getWorkEntries(first).at(-1)!),
    getWorkEntryId(getWorkEntries(corrected).at(-1)!),
  );
  assert.equal(getWorkEntries(first)[0].memo, "A first");
});
test("DBでもA1/A2のメモを原子的に保存・保持し、削除後も取り違えない", async () => {
  const f = fixture();
  try {
    f.sqlite.exec(
      "INSERT INTO preferences(user_id,seeded)VALUES('u',2);INSERT INTO categories(user_id,id,name,color)VALUES('u','a','A','#168ab5'),('u','b','B','#12a89a')",
    );
    let revision = 0;
    const first = await persistPunch(
        f.db,
        "u",
        {
          payload: { categoryId: "a" },
          expectedRevision: revision++,
          mutationId: crypto.randomUUID(),
        },
        start,
      ),
      id = first!.sessions[0].id;
    const punch = async (categoryId: string, at: number, mutationId = crypto.randomUUID()) =>
      persistPunch(
        f.db,
        "u",
        { payload: { categoryId }, expectedRevision: revision++, mutationId },
        at,
      );
    await punch("b", start);
    await writeSessionMemo(f.db, "u", { id, categoryId: "a", memo: "first", expectedMemo: "" });
    await punch("a", start + 20 * minute);
    const token = crypto.randomUUID();
    await punch("a", start + 40 * minute, token);
    await writeSessionMemo(f.db, "u", {
      id,
      categoryId: "a",
      memberId: token,
      memo: "second",
      expectedMemo: "",
    });
    let batches = 0;
    f.onBatch(() => {
      if (++batches === 2)
        f.sqlite
          .prepare(
            "UPDATE sessions SET work=json_set(work,'$.members[0].memo','concurrent first','$.members[2].memo','concurrent second'),memo='concurrent first'",
          )
          .run();
    });
    await persistTrackingCommand(
      f.db,
      "u",
      {
        payload: { id, control: "end" },
        expectedRevision: revision++,
        mutationId: crypto.randomUUID(),
      },
      start + 60 * minute,
    );
    f.onBatch(() => {});
    let s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.deepEqual(
      getWorkEntries(s).map((m) => m.memo),
      ["concurrent first", "", "concurrent second"],
    );
    assert.equal(s.memo, "concurrent first");
    assert.ok(sessionSchema.safeParse(s).success);
    await persistTrackingCommand(
      f.db,
      "u",
      {
        payload: { id, control: "remove", memberId: "a" },
        expectedRevision: revision++,
        mutationId: crypto.randomUUID(),
      },
      start + 61 * minute,
    );
    await writeSessionMemo(f.db, "u", {
      id,
      categoryId: "a",
      memberId: token,
      memo: "after deletion",
      expectedMemo: "concurrent second",
    });
    s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(getWorkEntries(s)[1].memo, "after deletion");
    assert.equal(s.memo, "");
    await assert.rejects(
      () =>
        writeSessionMemo(f.db, "other", {
          id,
          categoryId: "a",
          memberId: token,
          memo: "foreign",
          expectedMemo: "after deletion",
        }),
      /見つかりません/,
    );
  } finally {
    f.sqlite.close();
  }
});
