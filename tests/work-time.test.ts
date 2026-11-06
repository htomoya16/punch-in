import assert from "node:assert/strict";
import test from "node:test";
import { sessionSchema } from "../src/application/validation/backup-schema";
import {
  calculateAllocatedDurationsByCategory,
  calculateRecordedDuration,
} from "../src/domain/tracking/duration-allocation";
import { editWorkTime } from "../src/domain/tracking/edit-work-entry-time";
import type { TrackingSession } from "../src/domain/tracking/tracking-session";
import { applyTrackingCommand } from "../src/domain/tracking/tracking-transitions";
import {
  getWorkEntryIntervals,
  getWorkEntryTimeRange,
} from "../src/domain/tracking/work-entry-intervals";
import { fixture } from "./d1-fixture";
import {
  mapTrackingSessionRow,
  persistPunch,
  persistTrackingCommand,
} from "./support/tracking-usecases";
const at = Date.parse("2026-11-03T01:00:00Z"),
  minute = 60000;
const base: TrackingSession = {
  id: "parent",
  categoryId: "a",
  memo: "first",
  startedAt: at,
  endedAt: null,
  businessDay: "2026-11-03",
  dayStart: 300,
  timezone: "Asia/Tokyo",
  createdAt: at,
  updatedAt: at,
};
function ended() {
  return applyTrackingCommand(
    applyTrackingCommand(base, "join", "b", at),
    "end",
    "",
    at + 60 * minute,
  );
}
test("並行した一つの日時だけ変更し、他の時刻とメモを保持して再配分する", () => {
  const s = editWorkTime(ended(), "a", at + 20 * minute, at + 40 * minute, at + 120 * minute);
  assert.equal(getWorkEntryTimeRange(s, "a").start, at + 20 * minute);
  assert.equal(getWorkEntryTimeRange(s, "a").end, at + 40 * minute);
  assert.equal(getWorkEntryTimeRange(s, "b").start, at);
  assert.equal(getWorkEntryTimeRange(s, "b").end, at + 60 * minute);
  assert.equal(s.work!.members[0].memo, "first");
  assert.equal(calculateRecordedDuration(s, 0), 60 * minute);
  assert.equal(calculateAllocatedDurationsByCategory(s, 0).get("a"), 10 * minute);
  assert.ok(sessionSchema.safeParse(s).success);
});
test("一時停止の隙間を保って両端だけ調整する", () => {
  let s = applyTrackingCommand(base, "pause", "a", at + 10 * minute);
  s = applyTrackingCommand(s, "resume", "a", at + 20 * minute);
  s = applyTrackingCommand(s, "end", "", at + 30 * minute);
  s = editWorkTime(s, "a", at - 5 * minute, at + 35 * minute, at + 60 * minute);
  assert.deepEqual(getWorkEntryIntervals(s, "a"), [
    { start: at - 5 * minute, end: at + 10 * minute },
    { start: at + 20 * minute, end: at + 35 * minute },
  ]);
  assert.equal(calculateRecordedDuration(s, 0), 30 * minute);
});
test("内部の一時停止区間の前後が逆になる変更を拒否する", () => {
  let s = applyTrackingCommand(base, "pause", "a", at + 10 * minute);
  s = applyTrackingCommand(s, "resume", "a", at + 20 * minute);
  s = applyTrackingCommand(s, "end", "", at + 30 * minute);
  assert.throws(
    () => editWorkTime(s, "a", at + 15 * minute, at + 30 * minute, at + 60 * minute),
    /一時停止/,
  );
});
test("同じカテゴリの前後の記録を重ねる変更を拒否する", () => {
  let s = applyTrackingCommand(base, "join", "b", at);
  s = applyTrackingCommand(s, "finish", "a", at + 20 * minute);
  s = applyTrackingCommand(s, "join", "a", at + 40 * minute, "second");
  s = applyTrackingCommand(s, "end", "", at + 60 * minute);
  assert.throws(
    () => editWorkTime(s, "second", at + 10 * minute, at + 60 * minute, at + 120 * minute),
    /同じ作業/,
  );
});
test("開始が記録日の境界をまたぐと親の記録日を再計算する", () => {
  let s = applyTrackingCommand(base, "end", "", at + 60 * minute);
  const start = Date.parse("2026-11-03T04:00:00+09:00");
  s = editWorkTime(s, "a", start, at + 60 * minute, at + 120 * minute);
  assert.equal(s.businessDay, "2026-11-02");
  assert.equal(s.startedAt, start);
  assert.ok(sessionSchema.safeParse(s).success);
});
test("手動の作業時間と未変更の日時は保持する", () => {
  const s = ended();
  s.work!.mode = "manual";
  s.work!.members.forEach((m) => {
    m.manualMs = 90 * minute;
  });
  assert.equal(editWorkTime(s, "a", at, at + 60 * minute, at + 120 * minute), s);
  const next = editWorkTime(s, "a", at + minute, at + 59 * minute, at + 120 * minute);
  assert.equal(calculateAllocatedDurationsByCategory(next, 0).get("a"), 90 * minute);
});
test("日時変更だけで計測中の記録を終了・再開しない", () => {
  const s = applyTrackingCommand(base, "join", "b", at);
  const next = editWorkTime(s, "a", at + minute, null, at + 10 * minute);
  assert.equal(next.endedAt, null);
  assert.equal(next.work!.members[0].state, "active");
  assert.throws(() => editWorkTime(s, "a", at, at + minute, at + 10 * minute), /終了時刻/);
  assert.throws(() => editWorkTime(ended(), "a", at, null, at + 120 * minute), /終了時刻/);
});
test("日時編集のAPIも他人の記録・他の親記録との重複を拒否する", async () => {
  const f = fixture();
  try {
    f.sqlite.exec(
      "INSERT INTO preferences(user_id,seeded)VALUES('u',2);INSERT INTO categories(user_id,id,name,color)VALUES('u','a','A','#168ab5')",
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
        at,
      ),
      id = first!.sessions[0].id;
    await persistTrackingCommand(
      f.db,
      "u",
      {
        payload: { id, control: "pause", categoryId: "a" },
        expectedRevision: revision++,
        mutationId: crypto.randomUUID(),
      },
      at + 10 * minute,
    );
    await persistTrackingCommand(
      f.db,
      "u",
      {
        payload: { id, control: "end" },
        expectedRevision: revision++,
        mutationId: crypto.randomUUID(),
      },
      at + 20 * minute,
    );
    await persistTrackingCommand(
      f.db,
      "u",
      {
        payload: {
          id,
          control: "timing",
          memberId: "a",
          startedAt: at + minute,
          endedAt: at + 9 * minute,
        },
        expectedRevision: revision++,
        mutationId: crypto.randomUUID(),
      },
      at + 60 * minute,
    );
    const s = mapTrackingSessionRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.equal(s.startedAt, at + minute);
    assert.equal(s.endedAt, at + 9 * minute);
    assert.ok(sessionSchema.safeParse(s).success);
    await assert.rejects(
      () =>
        persistTrackingCommand(
          f.db,
          "other",
          {
            payload: { id, control: "timing", memberId: "a", startedAt: at, endedAt: at + minute },
            expectedRevision: 0,
            mutationId: crypto.randomUUID(),
          },
          at + 60 * minute,
        ),
      /別の画面/,
    );
    await persistPunch(
      f.db,
      "u",
      {
        payload: { categoryId: "a" },
        expectedRevision: revision++,
        mutationId: crypto.randomUUID(),
      },
      at + 30 * minute,
    );
    await assert.rejects(
      () =>
        persistTrackingCommand(
          f.db,
          "u",
          {
            payload: {
              id,
              control: "timing",
              memberId: "a",
              startedAt: at,
              endedAt: at + 40 * minute,
            },
            expectedRevision: revision,
            mutationId: crypto.randomUUID(),
          },
          at + 60 * minute,
        ),
      /重なって/,
    );
  } finally {
    f.sqlite.close();
  }
});
