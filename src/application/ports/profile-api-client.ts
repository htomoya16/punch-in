import type { UserProfile } from "../../domain/profile/user-profile";

export interface ProfileApiClient {
  read(): Promise<UserProfile>;
  saveName(displayName: string, version: number): Promise<UserProfile>;
  saveAvatar(image: Blob | null, version: number): Promise<UserProfile>;
}
