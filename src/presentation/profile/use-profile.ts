"use client";

import { useRef, useState } from "react";
import type { UserProfile } from "../../domain/profile/user-profile";
import { profileApiClient } from "../../infrastructure/http/profile-api-client";

export function useProfile(initial: UserProfile) {
  const [profile, setProfile] = useState(initial);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(initial);
  const busy = useRef(false);

  function confirm(value: UserProfile) {
    current.current = value;
    setProfile(value);
  }

  async function save(name: string, image: Blob | null | undefined) {
    if (busy.current) return;
    busy.current = true;
    setIsSaving(true);
    setError("");
    try {
      if (name.trim() !== (current.current.displayName ?? "")) {
        confirm(await profileApiClient.saveName(name, current.current.version));
      }
      if (image !== undefined)
        confirm(await profileApiClient.saveAvatar(image, current.current.version));
      setIsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "プロフィールを保存できませんでした");
      // A lost response may already have committed; refresh before allowing another edit.
      try {
        confirm(await profileApiClient.read());
      } catch {
        /* Keep the last confirmed profile. */
      }
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  }

  return {
    profile,
    isOpen,
    isSaving,
    error,
    save,
    open: () => {
      setError("");
      setIsOpen(true);
    },
    close: () => {
      if (!busy.current) setIsOpen(false);
    },
  };
}
