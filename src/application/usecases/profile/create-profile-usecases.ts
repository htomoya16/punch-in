import { z } from "zod";
import {
  avatarContentType,
  MAX_AVATAR_BYTES,
  type UserProfile,
} from "../../../domain/profile/user-profile";
import { ApplicationError } from "../../errors/application-error";
import type { AvatarStorage } from "../../ports/avatar-storage";
import type { Clock } from "../../ports/clock";
import type { IdGenerator } from "../../ports/id-generator";
import type { ProfileRepository } from "../../ports/profile-repository";

const versionSchema = z.number().int().nonnegative();
const nameSchema = z.object({
  displayName: z.string().trim().max(80),
  expectedVersion: versionSchema,
});

export function createProfileUseCases(dependencies: {
  profiles: ProfileRepository;
  avatars: AvatarStorage;
  clock: Clock;
  ids: IdGenerator;
}) {
  const { profiles, avatars, clock, ids } = dependencies;

  function conflict(): never {
    throw new ApplicationError(
      "conflict",
      "プロフィールが別の画面で更新されました。開き直して確認してください",
    );
  }

  async function readCurrent(userId: string, expectedVersion: number) {
    versionSchema.parse(expectedVersion);
    const current = await profiles.read(userId);
    if (current.version !== expectedVersion) conflict();
    return current;
  }

  async function save(userId: string, current: UserProfile, changes: Partial<UserProfile>) {
    const next = { ...current, ...changes, version: current.version + 1 };
    if (!(await profiles.save(userId, next, current.version, clock.now()))) conflict();
    return next;
  }

  async function removeUnusedAvatar(userId: string, avatarId: string | null) {
    if (!avatarId) return;
    // Profile persistence is authoritative; a cleanup outage must not report a saved edit as failed.
    try {
      await avatars.remove(userId, avatarId);
    } catch {
      console.warn("Unused profile image cleanup failed");
    }
  }

  return {
    readProfile: (userId: string) => profiles.read(userId),

    async saveDisplayName(userId: string, input: unknown) {
      const value = nameSchema.parse(input);
      const current = await readCurrent(userId, value.expectedVersion);
      return save(userId, current, { displayName: value.displayName || null });
    },

    async saveAvatar(userId: string, bytes: ArrayBuffer, expectedVersion: number) {
      if (!bytes.byteLength || bytes.byteLength > MAX_AVATAR_BYTES) {
        throw new ApplicationError("invalid_input", "画像のサイズが大きすぎます");
      }
      const contentType = avatarContentType(new Uint8Array(bytes));
      if (!contentType)
        throw new ApplicationError("invalid_input", "PNG・JPEG・WebPの画像を選んでください");
      const current = await readCurrent(userId, expectedVersion);
      const avatarId = ids.generate();
      await avatars.write(userId, avatarId, { bytes, contentType });
      let next: UserProfile;
      try {
        next = await save(userId, current, { avatarId });
      } catch (error) {
        await removeUnusedAvatar(userId, avatarId);
        throw error;
      }
      await removeUnusedAvatar(userId, current.avatarId);
      return next;
    },

    async removeAvatar(userId: string, expectedVersion: number) {
      const current = await readCurrent(userId, expectedVersion);
      if (!current.avatarId) return current;
      const next = await save(userId, current, { avatarId: null });
      await removeUnusedAvatar(userId, current.avatarId);
      return next;
    },

    async readAvatar(userId: string) {
      const profile = await profiles.read(userId);
      return profile.avatarId ? avatars.read(userId, profile.avatarId) : null;
    },
  };
}
