import assert from "node:assert/strict";
import test from "node:test";
import type { AvatarImage, AvatarStorage } from "../src/application/ports/avatar-storage";
import { createProfileUseCases } from "../src/application/usecases/profile/create-profile-usecases";
import { MAX_AVATAR_BYTES } from "../src/domain/profile/user-profile";
import { D1ProfileRepository } from "../src/infrastructure/persistence/d1/profile-repository";
import { fixture } from "./d1-fixture";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer;

function setup() {
  const { db } = fixture();
  const profiles = new D1ProfileRepository(db);
  const images = new Map<string, AvatarImage>();
  let sequence = 0;
  const avatars: AvatarStorage = {
    async read(userId, id) {
      return images.get(`${userId}:${id}`) ?? null;
    },
    async write(userId, id, image) {
      images.set(`${userId}:${id}`, image);
    },
    async remove(userId, id) {
      images.delete(`${userId}:${id}`);
    },
  };
  const useCases = createProfileUseCases({
    profiles,
    avatars,
    clock: { now: () => 12345 },
    ids: { generate: () => `image-${++sequence}` },
  });
  return { profiles, avatars, images, useCases };
}

test("プロフィールは未設定から作成でき、所有者ごとに分離する", async () => {
  const { useCases } = setup();
  assert.deepEqual(await useCases.readProfile("owner"), {
    displayName: null,
    avatarId: null,
    version: 0,
  });
  await useCases.saveDisplayName("owner", { displayName: "  名前  ", expectedVersion: 0 });
  assert.equal((await useCases.readProfile("owner")).displayName, "名前");
  assert.equal((await useCases.readProfile("other")).displayName, null);
  await useCases.saveDisplayName("owner", { displayName: "", expectedVersion: 1 });
  assert.equal((await useCases.readProfile("owner")).displayName, null);
});

test("古いプロフィールの保存と、存在しない版からの作成を拒否する", async () => {
  const { useCases, profiles } = setup();
  await useCases.saveDisplayName("owner", { displayName: "保存した名前", expectedVersion: 0 });
  await assert.rejects(
    useCases.saveDisplayName("owner", { displayName: "古い名前", expectedVersion: 0 }),
    { code: "conflict" },
  );
  assert.equal(
    await profiles.save("missing", { displayName: "invalid", avatarId: null, version: 3 }, 2, 123),
    false,
  );
  assert.equal((await profiles.read("missing")).version, 0);
  assert.equal((await useCases.readProfile("owner")).displayName, "保存した名前");
});

test("画像の置換と削除はプロフィール確定後に古いファイルを片付ける", async () => {
  const { useCases, images } = setup();
  const first = await useCases.saveAvatar("owner", png, 0);
  assert.equal(first.avatarId, "image-1");
  assert.equal((await useCases.readAvatar("owner"))?.contentType, "image/png");
  assert.equal(await useCases.readAvatar("other"), null);
  const second = await useCases.saveAvatar("owner", png, 1);
  assert.equal(second.avatarId, "image-2");
  assert.deepEqual([...images.keys()], ["owner:image-2"]);
  const cleared = await useCases.removeAvatar("owner", 2);
  assert.equal(cleared.avatarId, null);
  assert.equal(images.size, 0);
});

test("画像転送中に他の編集が確定した場合は上書きせず新規ファイルを片付ける", async () => {
  const { avatars, profiles, images } = setup();
  const write = avatars.write;
  avatars.write = async (userId, id, image) => {
    await write(userId, id, image);
    await profiles.save(userId, { displayName: "別の画面", avatarId: null, version: 1 }, 0, 100);
  };
  const useCases = createProfileUseCases({
    profiles,
    avatars,
    clock: { now: () => 200 },
    ids: { generate: () => "losing-image" },
  });
  await assert.rejects(useCases.saveAvatar("owner", png, 0), { code: "conflict" });
  assert.equal((await profiles.read("owner")).displayName, "別の画面");
  assert.equal(images.size, 0);
});

test("SVG・HTML・サイズ超過の画像を保存しない", async () => {
  const { useCases, images } = setup();
  await assert.rejects(
    useCases.saveAvatar("owner", new TextEncoder().encode("<svg></svg>").buffer, 0),
    { code: "invalid_input" },
  );
  await assert.rejects(useCases.saveAvatar("owner", new ArrayBuffer(MAX_AVATAR_BYTES + 1), 0), {
    code: "invalid_input",
  });
  assert.equal((await useCases.readProfile("owner")).version, 0);
  assert.equal(images.size, 0);
});
