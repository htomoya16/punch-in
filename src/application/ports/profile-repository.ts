import type { UserProfile } from "../../domain/profile/user-profile";

export interface ProfileRepository {
  read(userId: string): Promise<UserProfile>;
  /** Compare the version and save the whole profile in one atomic statement. */
  save(
    userId: string,
    profile: UserProfile,
    expectedVersion: number,
    updatedAt: number,
  ): Promise<boolean>;
}
