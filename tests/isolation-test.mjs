// Run against the locally built Worker (npm start), which has no mock-auth middleware.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Isolation tests are local-only");
const actors = ["isolation-a-" + randomUUID(), "isolation-b-" + randomUUID()];
function headers(actor) {
  return {
    "oai-authenticated-user-id": actor,
    "oai-authenticated-user-email": actor + "@example.test",
    "Content-Type": "application/json",
    Origin: base,
  };
}
async function state(actor) {
  const r = await fetch(base + "/api/state", { headers: headers(actor) });
  assert.equal(r.status, 200);
  return await r.json();
}
async function post(actor, s, action, payload) {
  const r = await fetch(base + "/api/action", {
    method: "POST",
    headers: headers(actor),
    body: JSON.stringify({
      action,
      payload,
      expectedRevision: s.revision,
      mutationId: randomUUID(),
    }),
  });
  const data = await r.json();
  return { status: r.status, data };
}
assert.equal((await fetch(base + "/api/state")).status, 401);
const [a, b] = actors;
let sa = await state(a);
let sb = await state(b);
assert.deepEqual(
  sa.categories.map((c) => c.name),
  ["打刻"],
);
assert.equal(sa.preferences.sidebar, "#000000");
const id = randomUUID(),
  startedAt = Date.parse("2020-01-01T00:00:00Z");
let r = await post(a, sa, "session", {
  id,
  categoryId: "punch",
  startedAt,
  endedAt: startedAt + 3600000,
  memo: "User A only",
});
assert.equal(r.status, 200);
sa = r.data.state;
assert.equal((await state(b)).sessions.length, 0);
r = await post(b, sb, "deleteSession", { id });
assert.equal(r.status, 404);
assert.equal((await state(a)).sessions[0].id, id);
r = await post(b, sb, "preferences", { ...sb.preferences, dayStart: 480, accent: "#ffffff" });
assert.equal(r.status, 200);
sb = r.data.state;
assert.equal((await state(a)).preferences.dayStart, 300);
assert.equal((await state(a)).preferences.accent, "#168ab5");
// Equal record IDs are scoped to the owner rather than globally overwriting a record.
r = await post(b, sb, "session", {
  id,
  categoryId: "punch",
  startedAt,
  endedAt: startedAt + 7200000,
  memo: "User B only",
});
assert.equal(r.status, 200);
sb = r.data.state;
assert.equal((await state(a)).sessions[0].memo, "User A only");
assert.equal((await state(b)).sessions[0].memo, "User B only");
assert.equal((await post(a, sa, "deleteSession", { id })).status, 200);
assert.equal((await post(b, sb, "deleteSession", { id })).status, 200);
console.log(
  "User isolation checks passed: unauthenticated rejection, separate reads, denied foreign deletion, separate preferences, owner-scoped equal IDs, separate updates.",
);
