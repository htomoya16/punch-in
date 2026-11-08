import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:8805";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Profile tests are local-only");
const owner = `profile-test-${randomUUID()}`;
const other = `profile-test-${randomUUID()}`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDb8AAAAASUVORK5CYII=",
  "base64",
);
let passed = 0;
async function request(path, { actor = owner, ...init } = {}) {
  return fetch(base + path, {
    ...init,
    headers: {
      ...(actor
        ? {
            "oai-authenticated-user-id": actor,
            "oai-authenticated-user-email": `${actor}@sites.test`,
          }
        : {}),
      Origin: base,
      ...init.headers,
    },
  });
}
async function name(displayName, version, actor = owner) {
  return request("/api/profile", {
    actor,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, expectedVersion: version }),
  });
}
function check(label) {
  console.log(`ok ${++passed} - ${label}`);
}
assert.equal((await request("/api/profile", { actor: null })).status, 401);
assert.equal((await request("/api/profile/avatar", { actor: null })).status, 401);
check("プロフィールと画像の未認証アクセスを拒否");
assert.deepEqual((await (await request("/api/profile")).json()).profile, {
  displayName: null,
  avatarId: null,
  version: 0,
});
check("初期プロフィール");
assert.equal((await name("Demo", 0)).status, 200);
assert.equal((await name("Stale", 0)).status, 409);
assert.equal(
  (await (await request("/api/profile", { actor: other })).json()).profile.displayName,
  null,
);
check("表示名の保存・競合・ユーザー分離");
assert.equal(
  (
    await request("/api/profile", {
      method: "PUT",
      headers: { Origin: "https://example.invalid", "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  403,
);
check("他サイトからの書込を拒否");
assert.equal(
  (
    await request("/api/profile/avatar", {
      method: "PUT",
      headers: { "If-Match": "1", "Content-Type": "image/svg+xml" },
      body: "<svg></svg>",
    })
  ).status,
  400,
);
assert.equal(
  (
    await request("/api/profile/avatar", {
      method: "PUT",
      headers: { "If-Match": "1" },
      body: new Uint8Array(256 * 1024 + 1),
    })
  ).status,
  413,
);
check("非対応形式・サイズ超過を拒否");
const uploaded = await request("/api/profile/avatar", {
  method: "PUT",
  headers: { "If-Match": "1", "Content-Type": "image/png" },
  body: png,
});
assert.equal(uploaded.status, 200);
const profile = (await uploaded.json()).profile;
assert.ok(profile.avatarId);
const image = await request("/api/profile/avatar");
assert.equal(image.status, 200);
assert.equal(image.headers.get("content-type"), "image/png");
assert.equal(image.headers.get("x-content-type-options"), "nosniff");
assert.match(image.headers.get("cache-control"), /private/);
assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
assert.equal(
  (await request(`/api/profile/avatar?v=${profile.avatarId}`, { actor: other })).status,
  404,
);
check("R2画像の保存・読込・ユーザー分離");
assert.equal(
  (await request("/api/profile/avatar", { method: "DELETE", headers: { "If-Match": "1" } })).status,
  409,
);
assert.equal(
  (await request("/api/profile/avatar", { method: "DELETE", headers: { "If-Match": "2" } })).status,
  200,
);
assert.equal((await request("/api/profile/avatar")).status, 404);
check("画像の削除・古い版からの削除拒否");
console.log(`${passed} profile API checks passed`);
