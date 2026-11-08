"use client";

import { LogOut, Menu, NotebookPen } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AppView } from "./app-types";
import { ProfileAvatar } from "../profile/profile-avatar";

type Props = {
  displayName: string;
  avatarId: string | null;
  openProfile: () => void;
  noteButton: RefObject<HTMLButtonElement | null>;
  notesOpen: boolean;
  noteError: boolean;
  toggleNotes: () => void;
  closeMenu: () => void;
  compactNavigation: boolean;
  go: (next: AppView, historyFocusDay?: string) => void;
  menu: boolean;
  menuButton: RefObject<HTMLButtonElement | null>;
  setMenu: Dispatch<SetStateAction<boolean>>;
};

export function AppHeader({
  displayName,
  avatarId,
  openProfile,
  noteButton,
  notesOpen,
  noteError,
  toggleNotes,
  closeMenu,
  compactNavigation,
  go,
  menu,
  menuButton,
  setMenu,
}: Props) {
  return (
    <header className="topbar">
      <button
        ref={menuButton}
        className="mobile-menu icon-button"
        onClick={() => (menu ? closeMenu() : setMenu(true))}
        aria-label="メニュー"
        aria-controls="app-navigation"
        aria-expanded={compactNavigation && menu}
      >
        <Menu size={22} />
      </button>
      <button
        className="brand"
        aria-label="打刻（ホーム）へ"
        onClick={() => {
          go("punch");
          window.scrollTo({ top: 0, behavior: "auto" });
        }}
      >
        <span className="brand-mark">
          <img src="/icons/punch-in-96.png?v=3" alt="" width={26} height={26} decoding="async" />
        </span>
        <span>
          Punch <b>in</b>
          <span className="brand-period">.</span>
        </span>
      </button>
      <div className="account">
        <button
          ref={noteButton}
          className={`text-button notes-toggle header-notes-toggle ${notesOpen ? "is-open" : ""}`}
          aria-label="日別メモ"
          aria-controls="daily-notes"
          aria-expanded={notesOpen}
          onClick={toggleNotes}
        >
          <NotebookPen size={18} />
          <span className="header-notes-label">日別メモ</span>
          {noteError && <span className="note-error-dot" />}
        </button>
        <button className="profile-button" aria-label="プロフィールを編集" onClick={openProfile}>
          <ProfileAvatar name={displayName} avatarId={avatarId} />
          <span className="account-name">{displayName}</span>
        </button>
        <a
          className="icon-button"
          href="/signout-with-chatgpt?return_to=%2F"
          target="_top"
          aria-label="ログアウト"
        >
          <LogOut size={16} />
        </a>
      </div>
    </header>
  );
}
