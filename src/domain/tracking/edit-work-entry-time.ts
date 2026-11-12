import { rebuildTrackingIntervals } from "./rebuild-tracking-intervals";
import { resolveBusinessDay } from "../../shared/time/calendar";
import type { TrackingSession } from "./tracking-session";
import { getWorkEntries, getWorkEntryId } from "./work-entry";
import {
  getParticipationIntervals,
  getWorkEntryIntervals,
  getWorkEntryTimeRange,
} from "./work-entry-intervals";

/** Edit one entry's outer boundaries, retaining its pause gaps and every other entry. */
export function editWorkTime(
  session: TrackingSession,
  id: string,
  startedAt: number,
  endedAt: number | null,
  now: number,
): TrackingSession {
  if (!session.work) throw new Error("作業の記録が見つかりません");
  const member = getWorkEntries(session).find((entry) => getWorkEntryId(entry) === id);
  if (!member) throw new Error("作業の記録が見つかりません");
  if (startedAt > now + 1000 || (endedAt !== null && endedAt > now + 1000))
    throw new Error("未来の日時は登録できません");
  if ((member.state === "finished") !== (endedAt !== null))
    throw new Error("終了時刻は計測を終了してから変更してください");
  if (endedAt !== null && endedAt < startedAt)
    throw new Error("終了時刻は開始時刻以降にしてください");
  const previous = getWorkEntryTimeRange(session, id);
  if (previous.start === startedAt && (member.state !== "finished" || previous.end === endedAt))
    return session;
  const periods = getWorkEntryIntervals(session, id).map((p) => ({ ...p }));
  if (!periods.length)
    periods.push({
      start: startedAt,
      end: endedAt ?? (member.state === "paused" ? (member.endedAt ?? startedAt) : null),
    });
  periods[0].start = startedAt;
  if (member.state === "finished") periods[periods.length - 1].end = endedAt;
  if (
    periods.some(
      (p, i) =>
        (p.end !== null && p.end < p.start) ||
        (i > 0 && (periods[i - 1].end === null || periods[i - 1].end! > p.start)),
    )
  )
    throw new Error("一時停止の区間と前後します。開始・終了時刻を確認してください");
  const pieces = getParticipationIntervals(session)
    .filter((p) => p.memberId !== id)
    .map((p) => ({ id: p.memberId, start: p.start, end: p.end }));
  pieces.push(...periods.map((p) => ({ id, ...p })));
  const intervals = rebuildTrackingIntervals(getWorkEntries(session), pieces);
  const work = {
    ...session.work,
    members: session.work.members.map((entry) =>
      getWorkEntryId(entry) === id ? { ...entry, startedAt, endedAt } : entry,
    ),
    intervals,
  };
  const first = Math.min(
    startedAt,
    ...work.members.flatMap((entry) => (entry.startedAt === undefined ? [] : [entry.startedAt])),
    ...intervals.map((interval) => interval.start),
  );
  const last =
    session.endedAt === null
      ? null
      : Math.max(
          first,
          ...work.members.flatMap((entry) => (entry.endedAt == null ? [] : [entry.endedAt])),
          ...intervals.map((interval) => interval.end ?? first),
        );
  return {
    ...session,
    startedAt: first,
    endedAt: last,
    businessDay: resolveBusinessDay(first, session.dayStart, session.timezone),
    work,
    updatedAt: now,
  };
}
