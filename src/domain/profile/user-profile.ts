export type UserProfile = {
  displayName: string | null;
  avatarId: string | null;
  version: number;
};

export function emptyUserProfile(): UserProfile {
  return { displayName: null, avatarId: null, version: 0 };
}

export const MAX_AVATAR_BYTES = 256 * 1024;

/** Accept raster formats only; uploaded SVG and HTML must never be served as avatars. */
export function avatarContentType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return null;
}
