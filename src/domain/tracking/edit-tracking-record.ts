import { resolveBusinessDay } from "../../shared/time/calendar";
import { rebuildTrackingIntervals } from "./rebuild-tracking-intervals";
import type { TrackingSession } from "./tracking-session";
import { getWorkEntries, getWorkEntryId, type SessionWork } from "./work-entry";
import { getWorkEntryIntervals } from "./work-entry-intervals";

export type WorkEntryEdit = {
  id: string;
  memo: string;
  weight: number;
  manualMs?: number;
  intervals: { start: number; end: number | null }[];
};

/** Memo saves are independent; all other saved structure must still match when editing. */
export function trackingRecordStructure(session: TrackingSession) {
  return JSON.stringify([
    session.startedAt,
    session.endedAt,
    session.work?.mode,
    session.work?.batchPausedCategoryIds,
    getWorkEntries(session).map((entry) => [
      getWorkEntryId(entry),
      entry.categoryId,
      entry.state,
      entry.weight,
      entry.manualMs,
      entry.startedAt,
      entry.endedAt,
    ]),
    session.work?.intervals.map((interval) => [
      interval.start,
      interval.end,
      interval.categoryIds,
      interval.memberIds,
    ]),
  ]);
}

export function editTrackingRecord(
  session: TrackingSession,
  edits: WorkEntryEdit[],
  mode: SessionWork["mode"],
  now: number,
): TrackingSession | null {
  const previous = getWorkEntries(session);
  const changes = new Map(edits.map((edit) => [edit.id, edit]));
  if (
    changes.size !== edits.length ||
    edits.some((edit) => !previous.some((entry) => getWorkEntryId(entry) === edit.id))
  ) {
    throw new Error("編集する作業を確認してください");
  }
  if (session.endedAt === null && mode !== "auto")
    throw new Error("計測を終了してから配分を編集してください");
  const members = previous
    .filter((entry) => changes.has(getWorkEntryId(entry)))
    .map((entry) => {
      const edit = changes.get(getWorkEntryId(entry))!;
      if (!edit.intervals.length)
        throw new Error(
          entry.state === "active"
            ? "計測中の区間は終了後に削除してください"
            : "区間のない作業は削除してください",
        );
      const periods = edit.intervals;
      for (let index = 0; index < periods.length; index++) {
        const period = periods[index];
        if (
          !Number.isSafeInteger(period.start) ||
          period.start < 0 ||
          period.start > now + 1000 ||
          (period.end !== null &&
            (!Number.isSafeInteger(period.end) ||
              period.end < period.start ||
              period.end > now + 1000))
        ) {
          throw new Error("区間の開始・終了時刻を確認してください");
        }
        if (index && (periods[index - 1].end === null || periods[index - 1].end! > period.start)) {
          throw new Error("同じ作業の区間が重なっています。時刻の順序を確認してください");
        }
      }
      const open = periods.filter((period) => period.end === null);
      if (
        entry.state === "active"
          ? open.length !== 1 || periods.at(-1)?.end !== null
          : open.length !== 0
      ) {
        throw new Error("計測中の区間は終了後に削除してください");
      }
      if (
        entry.state === "active" &&
        !getWorkEntryIntervals(session, getWorkEntryId(entry)).some((period) => period.end === null)
      ) {
        throw new Error("計測中の区間を確認してください");
      }
      if (
        !Number.isFinite(edit.weight) ||
        edit.weight < 0 ||
        edit.weight > 1000000 ||
        (mode === "manual" &&
          (!Number.isSafeInteger(edit.manualMs) ||
            edit.manualMs! < 0 ||
            edit.manualMs! > 315576000000))
      ) {
        throw new Error("作業時間の配分を確認してください");
      }
      return {
        ...entry,
        memo: edit.memo,
        weight: mode === "ratio" ? edit.weight : entry.weight,
        manualMs: mode === "manual" ? edit.manualMs : undefined,
        startedAt: periods[0].start,
        endedAt: entry.state === "finished" ? periods.at(-1)!.end : null,
      };
    });
  if (previous.some((entry) => entry.state === "active" && !changes.has(getWorkEntryId(entry)))) {
    throw new Error("計測中の区間は終了後に削除してください");
  }
  if (!members.length) return null;
  if (members.every((entry) => entry.weight === 0)) {
    if (members.length === previous.length && mode === "ratio")
      throw new Error("比率の合計は0より大きくしてください");
    members.forEach((entry) => {
      entry.weight = 1;
    });
  }
  const intervals = rebuildTrackingIntervals(
    members,
    edits.flatMap((edit) => edit.intervals.map((period) => ({ id: edit.id, ...period }))),
  );
  const startedAt = Math.min(...members.map((entry) => entry.startedAt));
  const endedAt = members.every((entry) => entry.state === "finished")
    ? Math.max(...members.map((entry) => entry.endedAt!))
    : null;
  const batchPausedCategoryIds = session.work?.batchPausedCategoryIds?.filter((id) =>
    members.some((entry) => entry.categoryId === id && entry.state === "paused"),
  );
  return {
    ...session,
    categoryId: members[0].categoryId,
    memo: members[0].memo,
    startedAt,
    endedAt,
    businessDay: resolveBusinessDay(startedAt, session.dayStart, session.timezone),
    updatedAt: now,
    work: {
      version: 1,
      mode,
      members,
      intervals,
      ...(batchPausedCategoryIds?.length ? { batchPausedCategoryIds } : {}),
    },
  };
}
