import type { TrackingSession } from "./tracking-session";

export type WorkEntry = {
  id?: string;
  categoryId: string;
  memo: string;
  state: "active" | "paused" | "finished";
  weight: number;
  manualMs?: number;
  startedAt?: number;
  endedAt?: number | null;
};

export type TrackingInterval = {
  start: number;
  end: number | null;
  categoryIds: string[];
  memberIds?: string[];
};

export type SessionWork = {
  version: 1;
  mode: "auto" | "ratio" | "manual";
  batchPausedCategoryIds?: string[];
  members: WorkEntry[];
  intervals: TrackingInterval[];
};

export type TrackingControl =
  "join" | "pause" | "resume" | "finish" | "end" | "pauseAll" | "resumeAll";

/** Old entries retain their category ID as their stable identity. */
export function getWorkEntryId(entry: WorkEntry) {
  return entry.id ?? entry.categoryId;
}

export function getWorkEntries(session: TrackingSession): WorkEntry[] {
  return (
    session.work?.members ?? [
      {
        categoryId: session.categoryId,
        memo: session.memo,
        state: session.endedAt === null ? "active" : "finished",
        weight: 1,
      },
    ]
  );
}

export function findLatestWorkEntry(session: TrackingSession, categoryId: string) {
  return getWorkEntries(session).findLast((entry) => entry.categoryId === categoryId);
}

export function hasWorkCategory(session: TrackingSession, id: string) {
  return getWorkEntries(session).some((entry) => entry.categoryId === id);
}

export function getIntervalEntryIds(interval: TrackingInterval) {
  return interval.memberIds ?? interval.categoryIds;
}
