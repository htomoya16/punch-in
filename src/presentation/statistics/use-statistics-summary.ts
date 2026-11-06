"use client";

import { useMemo } from "react";
import type { AppState } from "../../application/contracts/app-state";
import {
  calculateAllocatedDuration,
  calculateAllocatedDurationsByCategory,
} from "../../domain/tracking/duration-allocation";
import { hasWorkCategory } from "../../domain/tracking/work-entry";
import { periodRange, shiftPeriod, type Period } from "../../shared/time/calendar";

export function useStatisticsSummary({
  state,
  period,
  anchor,
  statsFilter,
  now,
}: {
  state: AppState;
  period: Period;
  anchor: string;
  statsFilter: string;
  now: number;
}) {
  const [from, to] = useMemo(() => periodRange(period, anchor), [period, anchor]);
  const [prevFrom, prevTo] = useMemo(
    () => periodRange(period, shiftPeriod(period, anchor, -1)),
    [period, anchor],
  );

  const selected = useMemo(
    () =>
      state.sessions.filter(
        (s) =>
          s.businessDay >= from &&
          s.businessDay <= to &&
          (!statsFilter || hasWorkCategory(s, statsFilter)),
      ),
    [state.sessions, from, to, statsFilter],
  );

  const previous = useMemo(
    () =>
      state.sessions.filter(
        (s) =>
          s.businessDay >= prevFrom &&
          s.businessDay <= prevTo &&
          (!statsFilter || hasWorkCategory(s, statsFilter)),
      ),
    [state.sessions, prevFrom, prevTo, statsFilter],
  );

  const creditedBase = useMemo(
    () =>
      selected.reduce(
        (n, s) => n + (s.endedAt === null ? 0 : calculateAllocatedDuration(s, 0, statsFilter)),
        0,
      ),
    [selected, statsFilter],
  );

  const priorBase = useMemo(
    () =>
      previous.reduce(
        (n, s) => n + (s.endedAt === null ? 0 : calculateAllocatedDuration(s, 0, statsFilter)),
        0,
      ),
    [previous, statsFilter],
  );

  const selectedActive = useMemo(() => selected.find((s) => s.endedAt === null), [selected]);
  const previousActive = useMemo(() => previous.find((s) => s.endedAt === null), [previous]);

  const creditedTotal =
    creditedBase +
    (selectedActive ? calculateAllocatedDuration(selectedActive, now, statsFilter) : 0);
  const priorTotal =
    priorBase + (previousActive ? calculateAllocatedDuration(previousActive, now, statsFilter) : 0);

  const selectedRunning = !!selectedActive;

  const summaries = useMemo(() => {
    const values = new Map<
      string,
      {
        current: number;
        previous: number;
      }
    >();
    for (const [rows, key] of [
      [selected, "current"],
      [previous, "previous"],
    ] as const)
      for (const s of rows) {
        if (s.endedAt !== null)
          for (const [id, time] of calculateAllocatedDurationsByCategory(s, 0)) {
            const value = values.get(id) ?? { current: 0, previous: 0 };
            value[key] += time;
            values.set(id, value);
          }
      }
    return values;
  }, [selected, previous]);
  return {
    from,
    to,
    selected,
    creditedTotal,
    priorTotal,
    selectedRunning,
    summaries,
    selectedActive,
    previousActive,
  };
}
