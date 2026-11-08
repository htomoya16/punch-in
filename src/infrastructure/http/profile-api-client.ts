import type { ProfileApiClient } from "../../application/ports/profile-api-client";
import type { UserProfile } from "../../domain/profile/user-profile";

async function profileRequest(url: string, init?: RequestInit): Promise<UserProfile> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = (await response.json()) as { profile?: UserProfile; error?: string };
  if (!response.ok || !body.profile)
    throw new Error(body.error || "プロフィールを保存できませんでした");
  return body.profile;
}

export const profileApiClient: ProfileApiClient = {
  read: () => profileRequest("/api/profile"),
  saveName: (displayName, version) =>
    profileRequest("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, expectedVersion: version }),
    }),
  saveAvatar: (image, version) =>
    profileRequest("/api/profile/avatar", {
      method: image ? "PUT" : "DELETE",
      headers: { "If-Match": String(version), ...(image ? { "Content-Type": image.type } : {}) },
      body: image,
    }),
};
