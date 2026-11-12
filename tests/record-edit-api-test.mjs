import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:8812";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Local only");
const user = process.argv.includes("--seed-ui") ? "local_seedy" : `record-edit-${randomUUID()}`;
const headers = {
  "Content-Type": "application/json",
  Origin: base,
  "oai-authenticated-user-id": user,
  "oai-authenticated-user-email": `${user}@example.test`,
};
let state = await (await fetch(base + "/api/state", { headers })).json();
const minute = 60000,
  at = Math.floor(state.serverNow / minute) * minute - 240 * minute,
  time = (n) => at + n * minute;
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(at - 300 * minute);
const record = {
  id: randomUUID(),
  categoryId: "punch",
  startedAt: at,
  endedAt: time(180),
  businessDay: day,
  timezone: "Asia/Tokyo",
  dayStart: 300,
  memo: "作業Aのメモ",
  createdAt: at,
  updatedAt: time(180),
  work: {
    version: 1,
    mode: "auto",
    members: [
      {
        id: "a1",
        categoryId: "punch",
        memo: "作業Aのメモ",
        state: "finished",
        weight: 1,
        startedAt: at,
        endedAt: time(120),
      },
      {
        id: "b1",
        categoryId: "editor-b",
        memo: "作業Bのメモ",
        state: "finished",
        weight: 1,
        startedAt: time(15),
        endedAt: time(90),
      },
      {
        id: "a2",
        categoryId: "punch",
        memo: "再開後の別メモ",
        state: "finished",
        weight: 1,
        startedAt: time(150),
        endedAt: time(180),
      },
    ],
    intervals: [
      { start: at, end: time(15), categoryIds: ["punch"], memberIds: ["a1"] },
      {
        start: time(15),
        end: time(30),
        categoryIds: ["punch", "editor-b"],
        memberIds: ["a1", "b1"],
      },
      { start: time(30), end: time(60), categoryIds: ["editor-b"], memberIds: ["b1"] },
      {
        start: time(60),
        end: time(90),
        categoryIds: ["punch", "editor-b"],
        memberIds: ["a1", "b1"],
      },
      { start: time(90), end: time(120), categoryIds: ["punch"], memberIds: ["a1"] },
      { start: time(150), end: time(180), categoryIds: ["punch"], memberIds: ["a2"] },
    ],
  },
};
async function action(action, payload, extra = {}) {
  const response = await fetch(base + "/api/action", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action,
      payload,
      expectedRevision: state.revision,
      mutationId: randomUUID(),
      responseMode: "delta",
      ...extra,
    }),
  });
  return { status: response.status, body: await response.json() };
}
const backup = {
  format: "punch-in",
  version: 2,
  exportedAt: new Date().toISOString(),
  preferences: state.preferences,
  categories: [
    ...state.categories,
    {
      id: "editor-b",
      name: "作業B",
      color: "#10a79d",
      position: 1,
      hidden: false,
      archived: false,
    },
  ],
  sessions: [record],
  dailyNotes: [],
};
let result = await action("import", { backup, includePreferences: false });
assert.equal(result.status, 200, JSON.stringify(result.body));
state = result.body.state;
if (process.argv.includes("--seed-ui")) {
  const { profile } = await (await fetch(base + "/api/profile", { headers })).json();
  await fetch(base + "/api/profile", {
    method: "PUT",
    headers,
    body: JSON.stringify({ displayName: "Demo", expectedVersion: profile.version }),
  });
  console.log(JSON.stringify({ recordId: record.id, day }));
} else {
  const structure = (s) =>
    JSON.stringify([
      s.startedAt,
      s.endedAt,
      s.work?.mode,
      s.work?.batchPausedCategoryIds,
      s.work.members.map((m) => [
        m.id ?? m.categoryId,
        m.categoryId,
        m.state,
        m.weight,
        m.manualMs,
        m.startedAt,
        m.endedAt,
      ]),
      s.work.intervals.map((i) => [i.start, i.end, i.categoryIds, i.memberIds]),
    ]);
  const edits = (s) => ({
    id: s.id,
    control: "edit",
    edit: {
      mode: s.work.mode,
      expectedStructure: structure(s),
      expectedMemos: Object.fromEntries(s.work.members.map((m) => [m.id ?? m.categoryId, m.memo])),
      entries: s.work.members.map((m) => {
        const periods = [];
        for (const i of s.work.intervals) {
          if (!(i.memberIds ?? i.categoryIds).includes(m.id ?? m.categoryId)) continue;
          const last = periods.at(-1);
          if (last?.end === i.start) last.end = i.end;
          else periods.push({ start: i.start, end: i.end });
        }
        return { id: m.id ?? m.categoryId, memo: m.memo, weight: m.weight, intervals: periods };
      }),
    },
  });
  let s = state.sessions.find((s) => s.id === record.id),
    payload = edits(s);
  payload.edit.entries[0].intervals.shift();
  payload.edit.entries[0].memo = "区間を整理したメモ";
  const token = randomUUID();
  result = await action("work", payload, { mutationId: token });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(result.body.state);
  assert.equal(result.body.punchDelta, undefined);
  state = result.body.state;
  s = state.sessions.find((s) => s.id === record.id);
  assert.equal(s.memo, "区間を整理したメモ");
  assert.equal(s.work.members[1].memo, "作業Bのメモ");
  assert.equal(s.work.members[2].memo, "再開後の別メモ");
  console.log("ok - 区間・メモの一括保存は最新のstateを返し、他の作業を保持");
  result = await action("work", payload, { mutationId: token });
  assert.equal(result.status, 200);
  assert.equal(result.body.state.revision, state.revision);
  console.log("ok - 応答欠落時の再試行は二重保存しない");
  payload = edits(s);
  payload.edit.entries[0].intervals[0].end = nowBeyond();
  result = await action("work", payload);
  assert.equal(result.status, 400);
  console.log("ok - 未来の区間を拒否");
  payload = edits(s);
  payload.edit.entries.shift();
  result = await action("work", payload);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  state = result.body.state;
  s = state.sessions.find((s) => s.id === record.id);
  assert.equal(s.categoryId, "editor-b");
  assert.equal(s.memo, "作業Bのメモ");
  assert.equal(s.work.members[1].id, "a2");
  console.log("ok - 主作業の削除でも繰り返し打刻と別メモを保持");
  payload = edits(s);
  payload.edit.entries = [];
  result = await action("work", payload);
  assert.equal(result.status, 200);
  assert.ok(!result.body.state.sessions.some((s) => s.id === record.id));
  console.log("ok - 全区間の削除で親記録を削除");
  const otherHeaders = { ...headers, "oai-authenticated-user-id": user + "-other" };
  const response = await fetch(base + "/api/action", {
    method: "POST",
    headers: otherHeaders,
    body: JSON.stringify({
      action: "work",
      payload,
      expectedRevision: 0,
      mutationId: randomUUID(),
    }),
  });
  assert.notEqual(response.status, 200);
  console.log("ok - 他人の記録を編集しない");
}
function nowBeyond() {
  return state.serverNow + 86400000;
}
