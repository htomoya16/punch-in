"use client";

import { LogOut, Menu } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AppView } from "./app-types";

type Props = {
  displayName: string;
  closeMenu: () => void;
  compactNavigation: boolean;
  go: (next: AppView, historyFocusDay?: string) => void;
  menu: boolean;
  menuButton: RefObject<HTMLButtonElement | null>;
  setMenu: Dispatch<SetStateAction<boolean>>;
};

export function AppHeader({
  displayName,
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
          <img src="/icons/punch-in-96.png" alt="" width={26} height={26} decoding="async" />
        </span>
        <span>
          Punch <b>in</b>
          <span className="brand-period">.</span>
        </span>
      </button>
      <div className="account">
        <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
        <span className="account-name">{displayName}</span>
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
