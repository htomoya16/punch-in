"use client";

import { useState } from "react";

export function ProfileAvatar({
  name,
  avatarId,
  preview,
}: {
  name: string;
  avatarId: string | null;
  preview?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url =
    preview || (avatarId ? `/api/profile/avatar?v=${encodeURIComponent(avatarId)}` : null);
  return (
    <span className="avatar" aria-hidden="true">
      {url && failedUrl !== url ? (
        <img src={url} alt="" onError={() => setFailedUrl(url)} />
      ) : (
        Array.from(name.trim())[0]?.toUpperCase() || "P"
      )}
    </span>
  );
}
