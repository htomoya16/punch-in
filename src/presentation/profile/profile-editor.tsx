"use client";

import { Check, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UserProfile } from "../../domain/profile/user-profile";
import { prepareAvatar } from "../../infrastructure/browser/prepare-avatar";
import { Modal } from "../components/modal";
import { ProfileAvatar } from "./profile-avatar";

export function ProfileEditor({
  profile,
  fallbackName,
  isSaving,
  error,
  save,
  close,
}: {
  profile: UserProfile;
  fallbackName: string;
  isSaving: boolean;
  error: string;
  save: (name: string, image: Blob | null | undefined) => Promise<void>;
  close: () => void;
}) {
  const [name, setName] = useState(profile.displayName ?? "");
  const [image, setImage] = useState<Blob | null | undefined>(undefined);
  const [preview, setPreview] = useState<string>();
  const [imageError, setImageError] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!image) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function chooseImage(file: File) {
    setIsPreparing(true);
    setImageError("");
    try {
      setImage(await prepareAvatar(file));
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "画像を読み込めませんでした");
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <Modal title="プロフィール" close={close}>
      <form
        className="profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save(name, image);
        }}
      >
        <div className="profile-image-row">
          <ProfileAvatar
            name={name || fallbackName}
            avatarId={image === null ? null : profile.avatarId}
            preview={preview}
          />
          <div className="profile-image-actions">
            <button
              className="outline-button"
              type="button"
              disabled={isSaving || isPreparing}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={16} />
              画像を変更
            </button>
            {(image || (image !== null && profile.avatarId)) && (
              <button
                className="text-button"
                type="button"
                disabled={isSaving || isPreparing}
                onClick={() => setImage(null)}
              >
                削除
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void chooseImage(file);
            }}
          />
        </div>
        <label className="field">
          表示名
          <input
            value={name}
            placeholder={fallbackName}
            maxLength={80}
            disabled={isSaving}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {(imageError || error) && (
          <p className="profile-error" role="alert">
            {imageError || error}
          </p>
        )}
        <div className="modal-actions">
          <button className="outline-button" type="button" disabled={isSaving} onClick={close}>
            キャンセル
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={isSaving || isPreparing}
            aria-busy={isSaving}
          >
            <Check size={16} />
            {isSaving ? "保存中" : "保存する"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
