import type { AvatarImage, AvatarStorage } from "../../../application/ports/avatar-storage";

export class R2AvatarStorage implements AvatarStorage {
  constructor(private readonly bucket: R2Bucket | undefined) {}

  private getBucket() {
    if (!this.bucket) throw new Error("Profile image storage unavailable");
    return this.bucket;
  }

  private key(userId: string, avatarId: string) {
    return `profile/${encodeURIComponent(userId)}/${encodeURIComponent(avatarId)}`;
  }

  async read(userId: string, avatarId: string): Promise<AvatarImage | null> {
    const object = await this.getBucket().get(this.key(userId, avatarId));
    if (!object) return null;
    return {
      bytes: await object.arrayBuffer(),
      contentType: object.httpMetadata?.contentType ?? "image/webp",
    };
  }

  async write(userId: string, avatarId: string, image: AvatarImage) {
    await this.getBucket().put(this.key(userId, avatarId), image.bytes, {
      httpMetadata: { contentType: image.contentType },
    });
  }

  async remove(userId: string, avatarId: string) {
    await this.getBucket().delete(this.key(userId, avatarId));
  }
}
