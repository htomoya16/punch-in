import assert from "node:assert/strict";
import test from "node:test";
import {
  editTrackingRecord,
  trackingRecordStructure,
  type WorkEntryEdit,
} from "../src/domain/tracking/edit-tracking-record";
import { getWorkEntryIntervals } from "../src/domain/tracking/work-entry-intervals";
import {
  calculateAllocatedDurationsByEntry,
  calculateRecordedDuration,
} from "../src/domain/tracking/duration-allocation";
import { getWorkEntries, getWorkEntryId } from "../src/domain/tracking/work-entry";
import type { TrackingSession } from "../src/domain/tracking/tracking-session";
import {
  recordEditsFromDraft,
  createRecordEditDraft,
} from "../src/presentation/tracking/record-edit-draft";
import { createUpdateTrackingSession } from "../src/application/usecases/tracking/update-tracking-session";
import { D1TrackingRepository } from "../src/infrastructure/persistence/d1/d1-tracking-repository";
import { mapTrackingSessionRow } from "../src/infrastructure/persistence/d1/tracking-row-mapper";
import { sessionSchema } from "../src/application/validation/backup-schema";
import { fixture } from "./d1-fixture";

const at = Date.parse("2026-11-11T09:00:00+09:00");
const minute = 60000;
const now = at + 10 * 3600000;
const time = (minutes: number) => at + minutes * minute;
function sample(): TrackingSession {
  return {
    id: "record",
    categoryId: "a",
    startedAt: at,
    endedAt: time(120),
    businessDay: "2026-11-11",
    dayStart: 300,
    timezone: "Asia/Tokyo",
    memo: "A memo",
    createdAt: at,
    updatedAt: time(120),
    work: {
      version: 1,
      mode: "auto",
      members: [
        {
          id: "a1",
          categoryId: "a",
          memo: "A memo",
          state: "finished",
          weight: 1,
          startedAt: at,
          endedAt: time(120),
        },
        {
          id: "b1",
          categoryId: "b",
          memo: "B memo",
          state: "finished",
          weight: 1,
          startedAt: time(15),
          endedAt: time(90),
        },
      ],
      intervals: [
        { start: at, end: time(15), categoryIds: ["a"], memberIds: ["a1"] },
        { start: time(15), end: time(30), categoryIds: ["a", "b"], memberIds: ["a1", "b1"] },
        { start: time(30), end: time(60), categoryIds: ["b"], memberIds: ["b1"] },
        { start: time(60), end: time(90), categoryIds: ["a", "b"], memberIds: ["a1", "b1"] },
        { start: time(90), end: time(120), categoryIds: ["a"], memberIds: ["a1"] },
      ],
    },
  };
}
function edits(session = sample()): WorkEntryEdit[] {
  return getWorkEntries(session).map((entry) => ({
    id: getWorkEntryId(entry),
    memo: entry.memo,
    weight: entry.weight,
    ...(entry.manualMs !== undefined ? { manualMs: entry.manualMs } : {}),
    intervals: getWorkEntryIntervals(session, getWorkEntryId(entry)).map((period) => ({
      ...period,
    })),
  }));
}
function payload(session: TrackingSession, entries = edits(session)) {
  return {
    id: session.id,
    control: "edit",
    edit: {
      entries,
      mode: session.work!.mode,
      expectedStructure: trackingRecordStructure(session),
      expectedMemos: Object.fromEntries(
        getWorkEntries(session).map((entry) => [getWorkEntryId(entry), entry.memo]),
      ),
    },
  };
}
function setup() {
  const f = fixture();
  const session = sample();
  f.sqlite.exec(
    "INSERT INTO preferences(user_id,seeded)VALUES('owner',2),('other',2);INSERT INTO categories(user_id,id,name,color)VALUES('owner','a','A','#2563eb'),('owner','b','B','#10a79d')",
  );
  f.sqlite
    .prepare(
      "INSERT INTO sessions(user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,work,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "owner",
      session.id,
      session.categoryId,
      session.startedAt,
      session.endedAt,
      session.businessDay,
      session.dayStart,
      session.timezone,
      session.memo,
      JSON.stringify(session.work),
      session.createdAt,
      session.updatedAt,
    );
  const read = () => {
    const row = f.sqlite.prepare("SELECT * FROM sessions WHERE user_id='owner'").get();
    return row ? mapTrackingSessionRow(row) : null;
  };
  const update = createUpdateTrackingSession({
    repository: new D1TrackingRepository(f.db),
    clock: { now: () => now },
  });
  const save = (
    body = payload(session),
    revision = 0,
    mutationId = crypto.randomUUID(),
    user = "owner",
  ) => update(user, { payload: body, expectedRevision: revision, mutationId }, now);
  return { ...f, session, read, save };
}

test("一時停止で分かれた区間だけを編集・削除し、並行した他の作業を保持する", () => {
  const changes = edits();
  changes[0].intervals = [{ start: time(5), end: time(25) }];
  const result = editTrackingRecord(sample(), changes, "auto", now)!;
  sessionSchema.parse(result);
  assert.deepEqual(getWorkEntryIntervals(result, "b1"), [{ start: time(15), end: time(90) }]);
  assert.deepEqual(getWorkEntryIntervals(result, "a1"), [{ start: time(5), end: time(25) }]);
  assert.equal(calculateRecordedDuration(result, now), 85 * minute);
  assert.equal(
    [...calculateAllocatedDurationsByEntry(result, now).values()].reduce((a, b) => a + b),
    85 * minute,
  );
});

test("先頭の作業を削除しても残るメモと主作業の互換ミラーを維持する", () => {
  const result = editTrackingRecord(sample(), edits().slice(1), "auto", now)!;
  assert.equal(result.categoryId, "b");
  assert.equal(result.memo, "B memo");
  assert.equal(result.startedAt, time(15));
  assert.equal(result.endedAt, time(90));
  assert.equal(calculateAllocatedDurationsByEntry(result, now).get("b1"), 75 * minute);
});

test("最後の区間がない作業は0時間で残さず、全作業削除なら記録全体を削除する", () => {
  assert.equal(editTrackingRecord(sample(), [], "auto", now), null);
  const changed = edits();
  changed[0].intervals = [];
  assert.throws(() => editTrackingRecord(sample(), changed, "auto", now), /区間のない作業/);
});

test("手動の計上時間は独立して保持し、比率は編集後の重複なし時間から計算する", () => {
  const session = sample();
  session.work!.mode = "manual";
  session.work!.members[0].manualMs = 123456;
  session.work!.members[1].manualMs = 987654;
  const changed = edits(session);
  changed[0].intervals.shift();
  const result = editTrackingRecord(session, changed, "manual", now)!;
  assert.deepEqual([...calculateAllocatedDurationsByEntry(result, now).values()], [123456, 987654]);
  changed[0].weight = 3;
  changed[1].weight = 1;
  const ratio = editTrackingRecord(session, changed, "ratio", now)!;
  const total = calculateRecordedDuration(ratio, now);
  assert.equal(calculateAllocatedDurationsByEntry(ratio, now).get("a1"), (total * 3) / 4);
});

test("同じ作業の区間の重複・逆転・未来と不明な作業IDを拒否する", () => {
  for (const intervals of [
    [
      { start: at, end: time(40) },
      { start: time(20), end: time(60) },
    ],
    [{ start: time(30), end: at }],
    [{ start: now + 60000, end: now + 120000 }],
  ]) {
    const changed = edits();
    changed[0].intervals = intervals;
    assert.throws(() => editTrackingRecord(sample(), changed, "auto", now));
  }
  const changed = edits();
  changed[0].id = "missing";
  assert.throws(() => editTrackingRecord(sample(), changed, "auto", now));
});

test("計測中の区間を残して過去の区間を編集でき、計測中の区間自体の削除は拒否する", () => {
  const session = sample();
  session.endedAt = null;
  session.work!.members[0].state = "active";
  session.work!.members[0].endedAt = null;
  session.work!.intervals.at(-1)!.end = null;
  const changed = edits(session);
  changed[0].intervals.shift();
  const result = editTrackingRecord(session, changed, "auto", now)!;
  sessionSchema.parse(result);
  assert.equal(result.work!.intervals.at(-1)!.end, null);
  changed[0].intervals = changed[0].intervals.filter((period) => period.end !== null);
  assert.throws(() => editTrackingRecord(session, changed, "auto", now), /計測中/);
  assert.throws(() => editTrackingRecord(session, [], "auto", now), /計測中/);
});

test("未変更の編集ではミリ秒と手動時間の端数を落とさず、削除の取り消しでも復元する", () => {
  const session = sample();
  session.work!.intervals[0].start += 123;
  session.startedAt += 123;
  session.work!.members[0].startedAt = session.startedAt;
  session.work!.mode = "manual";
  session.work!.members[0].manualMs = 123456;
  session.work!.members[1].manualMs = 987654;
  const draft = createRecordEditDraft(session, now);
  draft[0].intervals[0].removed = true;
  assert.equal(recordEditsFromDraft(session, draft, "manual")[0].intervals.length, 1);
  draft[0].intervals[0].removed = false;
  assert.equal(recordEditsFromDraft(session, draft, "manual")[0].intervals[0].start, at + 123);
  assert.equal(recordEditsFromDraft(session, draft, "manual")[0].manualMs, 123456);
});

test("区間・メモ・配分を一度に保存し、別ユーザーの記録には触れない", async () => {
  const f = setup();
  try {
    const changed = edits();
    changed[0].memo = "Updated";
    changed[0].intervals.shift();
    await f.save(payload(f.session, changed));
    assert.equal(f.read()!.memo, "Updated");
    assert.equal(f.read()!.work!.members[0].memo, "Updated");
    assert.equal(
      f.sqlite.prepare("SELECT revision FROM preferences WHERE user_id='owner'").get()!.revision,
      1,
    );
    assert.equal(
      f.sqlite.prepare("SELECT memo_revision FROM preferences WHERE user_id='owner'").get()!
        .memo_revision,
      1,
    );
    assert.equal(
      f.sqlite.prepare("SELECT revision FROM preferences WHERE user_id='other'").get()!.revision,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});

test("編集中に保存された未編集のメモを引き継ぎ、変更・削除対象のメモ競合は拒否する", async () => {
  for (const intent of ["unchanged", "change", "delete"]) {
    const f = setup();
    try {
      f.sqlite.exec(
        "UPDATE sessions SET memo='Remote',work=json_set(work,'$.members[0].memo','Remote');UPDATE preferences SET memo_revision=1 WHERE user_id='owner'",
      );
      const changed = edits();
      if (intent === "change") changed[0].memo = "Mine";
      if (intent === "delete") changed.shift();
      if (intent === "unchanged") {
        await f.save(payload(f.session, changed));
        assert.equal(f.read()!.memo, "Remote");
      } else {
        await assert.rejects(f.save(payload(f.session, changed)), { code: "conflict" });
        assert.equal(f.read()!.memo, "Remote");
      }
    } finally {
      f.sqlite.close();
    }
  }
});

test("読取後にメモが保存されても、CASで区間・版の部分更新を防ぐ", async () => {
  const f = setup();
  try {
    let calls = 0;
    f.onBatch(() => {
      if (++calls === 2)
        f.sqlite.exec(
          "UPDATE sessions SET memo='Race',work=json_set(work,'$.members[0].memo','Race');UPDATE preferences SET memo_revision=memo_revision+1 WHERE user_id='owner'",
        );
    });
    const changed = edits();
    changed[0].intervals.shift();
    await assert.rejects(f.save(payload(f.session, changed)), { code: "conflict" });
    assert.equal(f.read()!.memo, "Race");
    assert.equal(f.read()!.startedAt, at);
    assert.equal(
      f.sqlite.prepare("SELECT revision FROM preferences WHERE user_id='owner'").get()!.revision,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});

test("全区間削除は所有者の親記録ごと確定し、応答欠落後の再試行でも版を増やさない", async () => {
  const f = setup();
  try {
    const id = crypto.randomUUID();
    await f.save(payload(f.session, []), 0, id);
    assert.equal(f.read(), null);
    assert.equal(await f.save(payload(f.session, []), 0, id), null);
    assert.equal(
      f.sqlite.prepare("SELECT revision FROM preferences WHERE user_id='owner'").get()!.revision,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});

test("保存済み構造が変わった記録と他人の記録は編集しない", async () => {
  const f = setup();
  try {
    f.sqlite.exec("UPDATE sessions SET work=json_set(work,'$.members[0].weight',2)");
    await assert.rejects(f.save(), { code: "conflict" });
    await assert.rejects(f.save(payload(f.session), 0, crypto.randomUUID(), "other"), {
      code: "not_found",
    });
  } finally {
    f.sqlite.close();
  }
});

test("同じトークンの重複した保存でも、失敗したCASの後にメモを上書きしない", async () => {
  const f = setup();
  try {
    const repository = new D1TrackingRepository(f.db),
      identity = { expectedRevision: 0, mutationId: crypto.randomUUID() };
    const next = editTrackingRecord(f.session, edits(), "auto", now)!;
    assert.equal(await repository.commitRecordEdit("owner", identity, f.session, next, 0), true);
    f.sqlite.exec(
      "UPDATE sessions SET memo='After',work=json_set(work,'$.members[0].memo','After');UPDATE preferences SET memo_revision=memo_revision+1 WHERE user_id='owner'",
    );
    assert.equal(await repository.commitRecordEdit("owner", identity, f.session, next, 0), false);
    assert.equal(f.read()!.memo, "After");
    assert.equal(await repository.commitRecordEdit("owner", identity, f.session, null, 0), false);
    assert.ok(f.read());
  } finally {
    f.sqlite.close();
  }
});

test("別の親記録との重複は保存前に拒否する", async () => {
  const f = setup();
  try {
    f.sqlite
      .prepare(
        "INSERT INTO sessions(user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,created_at,updated_at) VALUES('owner','other-record','a',?,?, '2026-11-11',300,'Asia/Tokyo','',?,?)",
      )
      .run(time(130), time(160), time(130), time(160));
    const changed = edits();
    changed[0].intervals[1].end = time(140);
    await assert.rejects(f.save(payload(f.session, changed)), { code: "invalid_input" });
    assert.equal(f.read()!.endedAt, time(120));
  } finally {
    f.sqlite.close();
  }
});
