import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:8787";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("local only");
const actor = "parallel-" + randomUUID(),
  other = "parallel-other-" + randomUUID();
async function req(path, body, method = "POST", user = actor) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : method,
    headers: {
      "oai-authenticated-user-id": user,
      "oai-authenticated-user-email": user + "@example.test",
      "Content-Type": "application/json",
      Origin: base,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: r.status === 304 ? null : await r.json() };
}
let n = 0;
const check = (name) => console.log("ok", ++n, "-", name);
let state = (await req("/api/state")).data;
async function action(action, payload, extra = {}) {
  const r = await req("/api/action", {
    action,
    payload,
    expectedRevision: state.revision,
    mutationId: randomUUID(),
    responseMode: "delta",
    ...extra,
  });
  if (r.status === 200) state = (await req("/api/state")).data;
  return r;
}
const b = randomUUID();
assert.equal(
  (
    await action("category", {
      id: b,
      name: "B",
      color: "#12a89a",
      hidden: false,
      archived: false,
      position: 1,
    })
  ).status,
  200,
);
assert.equal(
  (await action("punch", { categoryId: "punch" }, { pressedAt: Date.now() - 50000 })).status,
  200,
);
const id = state.sessions[0].id;
assert.equal(
  (await action("work", { id, control: "join", categoryId: b }, { pressedAt: Date.now() - 30000 }))
    .status,
  200,
);
assert.equal(state.sessions.length, 1);
assert.equal(state.sessions[0].work.members.length, 2);
check("parallel work keeps one parent with distinct participants");
assert.equal(
  (
    await req(
      "/api/session-memo",
      { id, categoryId: "punch", memo: "A memo", expectedMemo: "" },
      "PUT",
    )
  ).status,
  200,
);
assert.equal(
  (await req("/api/session-memo", { id, categoryId: b, memo: "B memo", expectedMemo: "" }, "PUT"))
    .status,
  200,
);
check("per-work memo saves are independent");
assert.equal((await action("work", { id, control: "pause", categoryId: "punch" })).status, 200);
const pauseJob = {
  action: "work",
  payload: { id, control: "pauseAll" },
  expectedRevision: state.revision,
  mutationId: randomUUID(),
  responseMode: "delta",
};
assert.equal((await req("/api/action", pauseJob)).status, 200);
state = (await req("/api/state")).data;
assert.deepEqual(state.sessions[0].work.batchPausedCategoryIds, [b]);
assert.equal(
  state.sessions[0].work.intervals.some((i) => i.end === null),
  false,
);
check("batch pause stores only previously active participants");
const pausedRevision = state.revision;
assert.equal((await req("/api/action", pauseJob)).status, 200);
state = (await req("/api/state")).data;
assert.equal(state.revision, pausedRevision);
check("batch pause retry is idempotent");
const pausedBackup = (await req("/api/export")).data,
  restoreActor = actor + "-restore";
const restoreState = (await req("/api/state", undefined, "GET", restoreActor)).data;
const restored = await req(
  "/api/action",
  {
    action: "import",
    payload: { backup: pausedBackup, includePreferences: true },
    expectedRevision: restoreState.revision,
    mutationId: randomUUID(),
  },
  "POST",
  restoreActor,
);
assert.equal(restored.status, 200);
assert.deepEqual(restored.data.state.sessions[0].work.batchPausedCategoryIds, [b]);
check("paused batch survives backup and restore");
assert.equal((await action("work", { id, control: "resumeAll" })).status, 200);
assert.deepEqual(
  state.sessions[0].work.members.map((m) => m.state),
  ["paused", "active"],
);
assert.equal(state.sessions[0].work.batchPausedCategoryIds, undefined);
check("batch resume leaves individually paused participant untouched");
assert.equal((await action("work", { id, control: "resume", categoryId: "punch" })).status, 200);
assert.equal((await action("work", { id, control: "pause", categoryId: "punch" })).status, 200);
assert.equal(state.sessions[0].work.members[0].state, "paused");
assert.equal((await action("work", { id, control: "pause", categoryId: b })).status, 200);
assert.equal(state.sessions[0].work.intervals.filter((i) => i.end === null).length, 0);
assert.equal(state.sessions[0].endedAt, null);
check("all-paused group stays open with no running interval");
assert.equal((await action("work", { id, control: "resume", categoryId: b })).status, 200);
assert.equal(state.sessions[0].work.members[1].memo, "B memo");
check("resume retains memo");
assert.equal(
  (
    await action("work", {
      id,
      control: "allocate",
      mode: "manual",
      values: { punch: 3600000, [b]: 2700000 },
    })
  ).status,
  400,
);
check("allocation edit waits until finish");
assert.equal((await action("work", { id, control: "end" })).status, 200);
const stamps = [state.sessions[0].startedAt, state.sessions[0].endedAt];
assert.equal(
  (
    await action("work", {
      id,
      control: "allocate",
      mode: "manual",
      values: { punch: 3600000, [b]: 2700000 },
    })
  ).status,
  200,
);
assert.deepEqual([state.sessions[0].startedAt, state.sessions[0].endedAt], stamps);
check("independent credits preserve shared timestamps");
assert.equal(
  (
    await req(
      "/api/action",
      {
        action: "work",
        payload: { id, control: "allocate", mode: "auto" },
        expectedRevision: 0,
        mutationId: randomUUID(),
      },
      "POST",
      other,
    )
  ).status,
  409,
);
check("foreign group cannot be edited");
const templateId = randomUUID(),
  document = {
    format: "blocknote",
    version: 1,
    blocks: [
      {
        id: "seed",
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: "Daily", styles: {} }],
        children: [],
      },
    ],
  };
let templates = await req(
  "/api/note-templates",
  {
    action: "save",
    id: templateId,
    name: "Daily",
    markdown: "# Daily",
    document,
    expectedVersion: 0,
    mutationId: randomUUID(),
  },
  "PUT",
);
assert.equal(templates.status, 200);
templates = await req(
  "/api/note-templates",
  { action: "default", id: templateId, expectedVersion: 0, mutationId: randomUUID() },
  "PUT",
);
assert.equal(templates.status, 200);
check("template create and default selection");
const day = "2026-11-01";
const auto = await req("/api/daily-note", { day });
assert.equal(auto.status, 200);
assert.equal(auto.data.note.markdown, "# Daily");
assert.notEqual(auto.data.note.document.blocks[0].id, "seed");
assert.deepEqual((await req("/api/daily-note", { day })).data.note, auto.data.note);
check("default inserted once with independent IDs");
assert.equal(
  (
    await req(
      "/api/daily-note",
      {
        day,
        markdown: "",
        document: {
          format: "blocknote",
          version: 1,
          blocks: [{ id: "clear", type: "paragraph", content: [], children: [] }],
        },
        expectedVersion: 1,
        mutationId: randomUUID(),
      },
      "PUT",
    )
  ).status,
  200,
);
assert.equal((await req("/api/daily-note", { day })).data.note.markdown, "");
check("cleared note never repopulates");
assert.equal((await req("/api/note-templates", undefined, "GET", other)).data.templates.length, 0);
check("template list is private per user");
const backup = (await req("/api/export")).data;
assert.equal(backup.version, 4);
assert.equal(backup.templates.length, 1);
assert.equal(backup.sessions[0].work.members[1].memo, "B memo");
assert.equal(backup.defaultTemplateId, templateId);
check("v4 backup contains work, templates and default");
let otherState = (await req("/api/state", undefined, "GET", other)).data;
const imported = await req(
  "/api/action",
  {
    action: "import",
    payload: { backup, includePreferences: true },
    expectedRevision: otherState.revision,
    mutationId: randomUUID(),
  },
  "POST",
  other,
);
assert.equal(imported.status, 200, JSON.stringify(imported.data));
assert.deepEqual(imported.data.state.sessions[0].work, backup.sessions[0].work);
assert.equal(
  (await req("/api/note-templates", undefined, "GET", other)).data.defaultId,
  templateId,
);
check("v4 import restores allocation and template preference");
console.log(`Parallel/template API checks passed: ${n}`);
assert.equal((await action("work", { id, control: "allocate", mode: "auto" })).status, 200);
assert.equal((await action("work", { id, control: "remove", categoryId: b })).status, 200);
let one = state.sessions.find((s) => s.id === id);
assert.equal(one.work.members.length, 1);
assert.equal(one.work.members[0].memo, "A memo");
assert.ok(
  one.work.intervals.every((i) => i.categoryIds.length === 1 && i.categoryIds[0] === "punch"),
);
check("individual deletion preserves the remaining memo and reallocates automatic intervals");
otherState = (await req("/api/state", undefined, "GET", other)).data;
const removePrimary = await req(
  "/api/action",
  {
    action: "work",
    payload: { id, control: "remove", categoryId: "punch" },
    expectedRevision: otherState.revision,
    mutationId: randomUUID(),
  },
  "POST",
  other,
);
assert.equal(removePrimary.status, 200);
const afterPrimary = (await req("/api/state", undefined, "GET", other)).data.sessions.find(
  (s) => s.id === id,
);
assert.equal(afterPrimary.categoryId, b);
assert.equal(afterPrimary.memo, "B memo");
assert.equal(afterPrimary.work.members[0].manualMs, 2700000);
check("removing the primary work preserves independent manual time");
assert.equal(
  (
    await req(
      "/api/session-memo",
      { id, categoryId: b, memo: "after deletion", expectedMemo: "B memo" },
      "PUT",
      other,
    )
  ).status,
  200,
);
assert.equal(
  (await req("/api/state", undefined, "GET", other)).data.sessions[0].memo,
  "after deletion",
);
check("memo writes target the right work after index changes");
assert.equal((await action("work", { id, control: "remove", categoryId: "punch" })).status, 400);
check("last participant uses whole-record deletion");
assert.equal((await action("deleteSession", { id })).status, 200);
assert.equal(
  state.sessions.some((s) => s.id === id),
  false,
);
check("whole-record deletion removes all participants");
console.log(`Final parallel/template API checks passed: ${n}`);
