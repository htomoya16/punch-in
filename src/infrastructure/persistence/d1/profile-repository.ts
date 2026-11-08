import type { ProfileRepository } from "../../../application/ports/profile-repository";
import { emptyUserProfile, type UserProfile } from "../../../domain/profile/user-profile";

export class D1ProfileRepository implements ProfileRepository {
  constructor(private readonly database: D1Database) {}

  async read(userId: string): Promise<UserProfile> {
    const row = await this.database
      .prepare("SELECT display_name,avatar_id,version FROM user_profiles WHERE user_id=?")
      .bind(userId)
      .first<{ display_name: string | null; avatar_id: string | null; version: number }>();
    return row
      ? { displayName: row.display_name, avatarId: row.avatar_id, version: row.version }
      : emptyUserProfile();
  }

  async save(userId: string, profile: UserProfile, expectedVersion: number, updatedAt: number) {
    const result = await this.database
      .prepare(
        `
      INSERT INTO user_profiles (user_id,display_name,avatar_id,version,updated_at)
      SELECT ?,?,?,?,? WHERE ?=0 OR EXISTS (
        SELECT 1 FROM user_profiles WHERE user_id=? AND version=?
      )
      ON CONFLICT(user_id) DO UPDATE SET
        display_name=excluded.display_name,avatar_id=excluded.avatar_id,
        version=excluded.version,updated_at=excluded.updated_at
      WHERE user_profiles.version=?
    `,
      )
      .bind(
        userId,
        profile.displayName,
        profile.avatarId,
        profile.version,
        updatedAt,
        expectedVersion,
        userId,
        expectedVersion,
        expectedVersion,
      )
      .run();
    return result.meta.changes === 1;
  }
}
