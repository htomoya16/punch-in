export type AvatarImage = { bytes: ArrayBuffer; contentType: string };

export interface AvatarStorage {
  read(userId: string, avatarId: string): Promise<AvatarImage | null>;
  write(userId: string, avatarId: string, image: AvatarImage): Promise<void>;
  remove(userId: string, avatarId: string): Promise<void>;
}
