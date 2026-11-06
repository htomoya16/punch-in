"use client";

import { useMemo } from "react";
import type { AppState } from "../../application/contracts/app-state";
import type { WorkCategory } from "../../domain/categories/work-category";
import { getWorkEntries, getWorkEntryId, hasWorkCategory } from "../../domain/tracking/work-entry";
import { getWorkEntryMemoKey } from "../../domain/tracking/work-entry-memo";
import type { WorkEntryMemoStore } from "../tracking/work-entry-memo-store";

export function useHistorySelection({
  state,
  weekFrom,
  weekTo,
  historyRange,
  historyDay,
  historyTo,
  filter,
  query,
  memoStore,
  categoryMap,
}: {
  state: AppState;
  weekFrom: string;
  weekTo: string;
  historyRange: boolean;
  historyDay: string;
  historyTo: string;
  filter: string;
  query: string;
  memoStore: WorkEntryMemoStore;
  categoryMap: Map<string, WorkCategory>;
}) {
  const history = useMemo(
    () =>
      state.sessions.filter(
        (s) =>
          s.businessDay >= weekFrom &&
          s.businessDay <= weekTo &&
          (!historyRange || (s.businessDay >= historyDay && s.businessDay <= historyTo)) &&
          (!filter || hasWorkCategory(s, filter)) &&
          (!query ||
            getWorkEntries(s).some((m) =>
              memoStore.isEditing(getWorkEntryMemoKey(s, getWorkEntryId(m))),
            ) ||
            getWorkEntries(s)
              .map((m) => `${categoryMap.get(m.categoryId)?.name ?? ""} ${m.memo}`)
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [
      state.sessions,
      categoryMap,
      historyDay,
      historyTo,
      historyRange,
      weekFrom,
      weekTo,
      filter,
      query,
      memoStore,
    ],
  );

  const timelineSessions = useMemo(
    () =>
      state.sessions.filter(
        (s) =>
          (!historyRange || (s.businessDay >= historyDay && s.businessDay <= historyTo)) &&
          (!filter || hasWorkCategory(s, filter)) &&
          (!query ||
            getWorkEntries(s).some((m) =>
              memoStore.isEditing(getWorkEntryMemoKey(s, getWorkEntryId(m))),
            ) ||
            getWorkEntries(s)
              .map((m) => `${categoryMap.get(m.categoryId)?.name ?? ""} ${m.memo}`)
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [state.sessions, historyRange, historyDay, historyTo, filter, query, memoStore, categoryMap],
  );
  return { history, timelineSessions };
}
