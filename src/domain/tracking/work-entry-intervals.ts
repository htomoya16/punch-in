import type { TrackingSession } from "./tracking-session";
import { getIntervalEntryIds, getWorkEntries, getWorkEntryId } from "./work-entry";

export function getParticipationIntervals(session: TrackingSession) {
  return session.work
    ? session.work.intervals.flatMap((interval, index) =>
        interval.categoryIds.map((categoryId, k) => ({
          categoryId,
          memberId: getIntervalEntryIds(interval)[k],
          start: interval.start,
          end: interval.end,
          index,
        })),
      )
    : [
        {
          categoryId: session.categoryId,
          memberId: session.categoryId,
          start: session.startedAt,
          end: session.endedAt,
          index: 0,
        },
      ];
}

const periodsCache = new WeakMap<
  TrackingSession,
  Map<
    string,
    {
      start: number;
      end: number | null;
    }[]
  >
>();

export function getWorkEntryIntervals(session: TrackingSession, id: string) {
  let map = periodsCache.get(session);
  if (!map) {
    map = new Map();
    for (const interval of getParticipationIntervals(session)) {
      const row = map.get(interval.memberId) ?? [];
      const last = row.at(-1);
      if (last && last.end === interval.start) last.end = interval.end;
      else row.push({ start: interval.start, end: interval.end });
      map.set(interval.memberId, row);
    }
    periodsCache.set(session, map);
  }
  return map.get(id) ?? [];
}

export function getWorkEntryTimeRange(session: TrackingSession, id: string) {
  const m = getWorkEntries(session).find((entry) => getWorkEntryId(entry) === id);
  const periods = getWorkEntryIntervals(session, id);
  return {
    start:
      m?.startedAt ?? periods[0]?.start ?? (id === session.categoryId ? session.startedAt : null),
    end:
      m?.state === "finished"
        ? (m.endedAt ?? periods.at(-1)?.end ?? (!session.work ? session.endedAt : null))
        : null,
    inferredEnd: !!session.work && m?.state === "finished" && m.endedAt === undefined,
  };
}
