import test from "node:test";
import assert from "node:assert/strict";
import type { AppState, Session } from "../lib/model";
import { allocations, controlWork, realTime, removeWork } from "../lib/work";
import { sessionSchema } from "../lib/validation";
import { fixture } from "./d1-fixture";
import { performPunch, sessionFromRow } from "../lib/punch-server";
import { performWork } from "../lib/work-server";
import { projectPunch } from "../lib/punch-state";

const start = Date.parse("2026-11-03T01:00:00Z"),
  minute = 60000;
const base: Session = {
  id: "one",
  categoryId: "a",
  memo: "",
  startedAt: start,
  endedAt: null,
  businessDay: "2026-11-03",
  dayStart: 300,
  timezone: "Asia/Tokyo",
  createdAt: start,
  updatedAt: start,
};
const parallel = () => controlWork(base, "join", "b", start);

test("一括停止は同じ時刻で区間を閉じ、実時間と自動配分が増えない", () => {
  const paused = controlWork(parallel(), "pauseAll", "", start + 10 * minute);
  assert.equal(paused.endedAt, null);
  assert.deepEqual(paused.work!.batchPausedCategoryIds, ["a", "b"]);
  assert.equal(realTime(paused, start + 60 * minute), 10 * minute);
  assert.deepEqual(
    [...allocations(paused, start + 60 * minute).values()],
    [5 * minute, 5 * minute],
  );
  assert.ok(sessionSchema.safeParse(paused).success);
  assert.equal(parallel().work!.members[0].state, "active");
});

test("一括再開は先に個別停止していた作業を再開しない", () => {
  let session = controlWork(parallel(), "pause", "a", start + 10 * minute);
  session = controlWork(session, "pauseAll", "", start + 20 * minute);
  session = sessionSchema.parse(JSON.parse(JSON.stringify(session)));
  session = controlWork(session, "resumeAll", "", start + 40 * minute);
  assert.deepEqual(
    session.work!.members.map((member) => member.state),
    ["paused", "active"],
  );
  assert.equal(session.work!.batchPausedCategoryIds, undefined);
  session = controlWork(session, "end", "", start + 60 * minute);
  assert.equal(realTime(session, 0), 40 * minute);
  assert.deepEqual([...allocations(session, 0).values()], [5 * minute, 35 * minute]);
});

test("個別に再開してから再停止した作業は一括再開の対象を外れる", () => {
  let session = controlWork(parallel(), "pauseAll", "", start + minute);
  session = controlWork(session, "resume", "a", start + 2 * minute);
  session = controlWork(session, "pause", "a", start + 3 * minute);
  session = controlWork(session, "resumeAll", "", start + 4 * minute);
  assert.deepEqual(
    session.work!.members.map((member) => member.state),
    ["paused", "active"],
  );
});

test("一括停止中に終了・削除した作業は復活しない", () => {
  let session = controlWork(
    controlWork(parallel(), "join", "c", start),
    "pauseAll",
    "",
    start + minute,
  );
  session = controlWork(session, "finish", "a", start + 2 * minute);
  session = removeWork(session, "b", start + 3 * minute);
  assert.deepEqual(session.work!.batchPausedCategoryIds, ["c"]);
  session = controlWork(session, "resumeAll", "", start + 4 * minute);
  assert.deepEqual(
    session.work!.members.map((member) => [member.categoryId, member.state]),
    [
      ["a", "finished"],
      ["c", "active"],
    ],
  );
  assert.ok(sessionSchema.safeParse(session).success);
});

test("一括停止中の新規追加は再開対象に混ざらず、次の一括停止で取り込む", () => {
  let session = controlWork(parallel(), "pauseAll", "", start + minute);
  session = controlWork(session, "join", "c", start + 2 * minute);
  assert.deepEqual(session.work!.batchPausedCategoryIds, ["a", "b"]);
  session = controlWork(session, "pauseAll", "", start + 3 * minute);
  assert.deepEqual(session.work!.batchPausedCategoryIds, ["a", "b", "c"]);
  session = controlWork(session, "end", "", start + 4 * minute);
  assert.equal(session.work!.batchPausedCategoryIds, undefined);
  assert.ok(sessionSchema.safeParse(session).success);
});

test("空・重複・存在しない・停止していない一括再開対象を取り込まない", () => {
  const paused = controlWork(parallel(), "pauseAll", "", start + minute);
  for (const ids of [[], ["a", "a"], ["missing"]]) {
    assert.equal(
      sessionSchema.safeParse({ ...paused, work: { ...paused.work, batchPausedCategoryIds: ids } })
        .success,
      false,
    );
  }
  assert.equal(
    sessionSchema.safeParse({
      ...parallel(),
      work: { ...parallel().work, batchPausedCategoryIds: ["a"] },
    }).success,
    false,
  );
  assert.throws(() => controlWork(parallel(), "resumeAll", "", start), /まとめて再開/);
  assert.throws(() => controlWork(paused, "pauseAll", "", start + minute), /計測中/);
});

test("一括停止は2回のDBバッチで永続化し、再試行で時間や版を二重更新しない", async () => {
  const f = fixture();
  try {
    f.sqlite.exec(
      "INSERT INTO preferences(user_id,seeded)VALUES('owner',2);INSERT INTO categories(user_id,id,name,color)VALUES('owner','a','A','#000000'),('owner','b','B','#000000')",
    );
    const first = await performPunch(
      f.db,
      "owner",
      { payload: { categoryId: "a" }, expectedRevision: 0, mutationId: crypto.randomUUID() },
      start,
    );
    const id = first!.sessions[0].id;
    await performWork(
      f.db,
      "owner",
      {
        payload: { id, control: "join", categoryId: "b" },
        expectedRevision: 1,
        mutationId: crypto.randomUUID(),
      },
      start,
    );
    const mutationId = crypto.randomUUID(),
      input = {
        payload: { id, control: "pauseAll" },
        expectedRevision: 2,
        mutationId,
        pressedAt: start + 10 * minute,
      };
    let batches = 0;
    f.onBatch(() => {
      batches++;
    });
    await performWork(f.db, "owner", input, start + 10 * minute + 50);
    assert.equal(batches, 2);
    assert.equal(await performWork(f.db, "owner", input, start + 11 * minute), null);
    const paused = sessionFromRow(f.sqlite.prepare("SELECT * FROM sessions").get()!);
    assert.deepEqual(paused.work!.batchPausedCategoryIds, ["a", "b"]);
    assert.equal(realTime(paused, start + 50 * minute), 10 * minute);
    await performWork(
      f.db,
      "owner",
      {
        payload: { id, control: "resumeAll" },
        expectedRevision: 3,
        mutationId: crypto.randomUUID(),
      },
      start + 20 * minute,
    );
    assert.equal(
      sessionFromRow(f.sqlite.prepare("SELECT * FROM sessions").get()!).work!.members.every(
        (member) => member.state === "active",
      ),
      true,
    );
    await assert.rejects(
      () =>
        performWork(
          f.db,
          "other",
          {
            payload: { id, control: "pauseAll" },
            expectedRevision: 4,
            mutationId: crypto.randomUUID(),
          },
          start + 30 * minute,
        ),
      /別の画面/,
    );
  } finally {
    f.sqlite.close();
  }
});

test("一括停止の仮表示は応答前に時計を止め、確定データを変更しない", () => {
  const state: AppState = {
    preferences: {
      timezone: "Asia/Tokyo",
      dayStart: 300,
      accent: "#168ab5",
      sidebar: "#000000",
      reminderEnabled: false,
      reminderMinutes: 360,
    },
    categories: [],
    sessions: [parallel()],
    revision: 2,
    serverNow: start,
  };
  const projected = projectPunch(state, {
    categoryId: "",
    workId: "one",
    control: "pauseAll",
    mutationId: "batch",
    baseRevision: 2,
    at: start + minute,
  });
  assert.equal(realTime(projected.sessions[0], start + 10 * minute), minute);
  assert.equal(state.sessions[0].work!.members[0].state, "active");
  assert.equal(projected.revision, 2);
});
