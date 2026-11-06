"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import type { AppState, PendingPunch } from "../../application/contracts/app-state";
import type { WorkCategory } from "../../domain/categories/work-category";
import { getRecordedDuration } from "../../domain/tracking/recorded-duration";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { getWorkEntries } from "../../domain/tracking/work-entry";
import { formatDurationInWords } from "../../shared/time/duration-format";

export function useTimerReminders({
  pendingPunch,
  running,
  state,
  now,
  runningCategory,
  setToast,
}: {
  pendingPunch: PendingPunch | null;
  running: TrackingSession | undefined;
  state: AppState;
  now: number;
  runningCategory: WorkCategory | undefined;
  setToast: Dispatch<SetStateAction<{ text: string; error?: boolean } | null>>;
}) {
  const [permission, setPermission] = useState("default");

  const notified = useRef(new Set<string>());

  useEffect(() => {
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (
      pendingPunch ||
      !running ||
      getWorkEntries(running).every((m) => m.state !== "active") ||
      !state.preferences.reminderEnabled ||
      getRecordedDuration(running, now) < state.preferences.reminderMinutes * 60000
    )
      return;
    const key = `punch-in:reminded:${running.id}`;
    if (notified.current.has(key)) return;
    notified.current.add(key);
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* Keep in-memory notification deduplication. */
    }
    const message = `${runningCategory?.name ?? "作業"}を${formatDurationInWords(getRecordedDuration(running, now))}計測しています`;
    setToast({ text: message });
    if ("Notification" in window && Notification.permission === "granted")
      try {
        new Notification("終了を忘れていませんか？", {
          body: message,
          tag: running.id,
          icon: "/icons/punch-in-192.png",
        });
      } catch {
        /* In-app notification is still delivered. */
      }
  }, [now, running, runningCategory, state.preferences, pendingPunch]);
  return { permission, setPermission };
}
