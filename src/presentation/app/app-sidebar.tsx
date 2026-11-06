"use client";

import { LogOut, X } from "lucide-react";
import type { RefObject } from "react";
import { formatRecordDate } from "../../shared/time/date-time-format";
import DurationValue from "../components/time/duration-value";
import type { AppView } from "./app-types";
import { NAV } from "./navigation-items";

type Props = {
  closeMenu: () => void;
  compactNavigation: boolean;
  dailyTotal: number;
  go: (next: AppView, historyFocusDay?: string) => void;
  menu: boolean;
  sidebarRef: RefObject<HTMLElement | null>;
  today: string;
  view: AppView;
};

export function AppSidebar({
  closeMenu,
  compactNavigation,
  dailyTotal,
  go,
  menu,
  sidebarRef,
  today,
  view,
}: Props) {
  return (
    <aside
      id="app-navigation"
      ref={sidebarRef}
      className={`sidebar ${menu ? "open" : ""}`}
      inert={compactNavigation && !menu}
      aria-hidden={compactNavigation && !menu ? true : undefined}
      role={compactNavigation ? "dialog" : undefined}
      aria-modal={compactNavigation && menu ? true : undefined}
      aria-label="メニュー"
    >
      <button
        className="sidebar-close icon-button"
        onClick={closeMenu}
        aria-label="メニューを閉じる"
      >
        <X size={20} />
      </button>
      <nav>
        {NAV.map((n, i) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            className={`nav-item ${view === n.id ? "active" : ""} ${i === 3 ? "nav-divider" : ""}`}
            aria-current={view === n.id ? "page" : undefined}
          >
            <n.icon size={19} strokeWidth={1.6} />
            <span>{n.label}</span>
            {view === n.id && <span className="nav-marker" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-total">
        <span>今日の記録時間</span>
        <strong>
          <DurationValue value={dailyTotal} seconds />
        </strong>
        <span className="sidebar-date">{formatRecordDate(today)}</span>
      </div>
      <a className="sidebar-signout" href="/signout-with-chatgpt?return_to=%2F" target="_top">
        <LogOut size={15} />
        ログアウト
      </a>
    </aside>
  );
}
