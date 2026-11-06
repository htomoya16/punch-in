"use client";

import { useMemo } from "react";
import type { AppState } from "../../application/contracts/app-state";
import {
  calculateAllocatedDurationsByEntry,
  sumAllocatedDurationsByCategory,
} from "../../domain/tracking/duration-allocation";
import { getRecordedDuration } from "../../domain/tracking/recorded-duration";
import { completedTotal } from "../state/tracking-projection";
import { elapsedColors } from "./elapsed-colors";
import { punchButtonPositions } from "./punch-button-layout";
import { latestSessionsChronologically } from "./record-order";

export function useTrackingViewModel({
  state,
  now,
  today,
}: {
  state: AppState;
  now: number;
  today: string;
}) {
  const categoryMap = useMemo(
    () => new Map(state.categories.map((c) => [c.id, c])),
    [state.categories],
  );

  const running = useMemo(() => state.sessions.find((s) => s.endedAt === null), [state.sessions]);
  const runningCategory = categoryMap.get(running?.categoryId ?? "");

  const runningEntryTimes = useMemo(
    () => (running ? calculateAllocatedDurationsByEntry(running, now) : new Map<string, number>()),
    [running, now],
  );

  const runningTimes = useMemo(
    () =>
      running
        ? sumAllocatedDurationsByCategory(running, runningEntryTimes)
        : new Map<string, number>(),
    [running, runningEntryTimes],
  );

  const timerColors = useMemo(
    () => elapsedColors(running, state.categories),
    [running, state.categories],
  );

  const displaySession = running ?? state.sessions[0];
  const displayCategory = categoryMap.get(displaySession?.categoryId ?? "");

  const daily = useMemo(
    () => state.sessions.filter((s) => s.businessDay === today),
    [state.sessions, today],
  );

  const visibleDaily = useMemo(() => latestSessionsChronologically(daily), [daily]);

  const dailyBase = useMemo(() => completedTotal(daily), [daily]);

  const dailyTotal =
    dailyBase + (running?.businessDay === today ? getRecordedDuration(running, now) : 0);

  const activeCats = useMemo(() => state.categories.filter((c) => !c.archived), [state.categories]);

  const visibleCats = useMemo(() => activeCats.filter((c) => !c.hidden), [activeCats]);

  const buttonPositions = useMemo(
    () => ({
      wide: punchButtonPositions(visibleCats.length, 3),
      compact: punchButtonPositions(visibleCats.length, 2),
    }),
    [visibleCats.length],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("ja-JP", {
        timeZone: state.preferences.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
      }),
    [state.preferences.timezone],
  );
  return {
    categoryMap,
    running,
    runningCategory,
    runningEntryTimes,
    runningTimes,
    timerColors,
    displaySession,
    displayCategory,
    daily,
    visibleDaily,
    dailyTotal,
    activeCats,
    visibleCats,
    buttonPositions,
    dateFormatter,
  };
}
