import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { getWorkEntries, getWorkEntryId, type WorkEntry } from "../../domain/tracking/work-entry";
import { getWorkEntryTimeRange } from "../../domain/tracking/work-entry-intervals";

const orderedMembers = new WeakMap<TrackingSession, readonly WorkEntry[]>();

/** Display order only: retain stable IDs and the stored primary member/memo order. */
export function chronologicalMembers(session: TrackingSession): readonly WorkEntry[] {
  const cached = orderedMembers.get(session);
  if (cached) return cached;
  const entries = getWorkEntries(session).map((member, index) => ({
    member,
    index,
    start: member.startedAt ?? getWorkEntryTimeRange(session, getWorkEntryId(member)).start,
  }));
  entries.sort((a, b) =>
    a.start === b.start
      ? a.index - b.index
      : a.start === null
        ? 1
        : b.start === null
          ? -1
          : a.start - b.start,
  );
  const result = entries.map((entry) => entry.member);
  orderedMembers.set(session, result);
  return result;
}

/** Pick the latest records first, then read that window from early to late. */
export function latestSessionsChronologically(
  sessions: readonly TrackingSession[],
  limit = 5,
): TrackingSession[] {
  return [...sessions]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .sort((a, b) => a.startedAt - b.startedAt);
}
