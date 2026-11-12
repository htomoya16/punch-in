import { calculateAllocatedDurationsByEntry } from "../../domain/tracking/duration-allocation";
import type { WorkEntryEdit } from "../../domain/tracking/edit-tracking-record";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { getWorkEntries, getWorkEntryId, type SessionWork } from "../../domain/tracking/work-entry";
import {
  getWorkEntryIntervals,
  getWorkEntryTimeRange,
} from "../../domain/tracking/work-entry-intervals";
import { formatMinuteDateTimeInput } from "../../shared/time/date-time-format";
import { editedMinutes, editedTime } from "./record-editor";

export type IntervalDraft = {
  key: number;
  start: string;
  end: string;
  originalStart: number;
  originalEnd: number | null;
  removed: boolean;
};
export type EntryDraft = {
  id: string;
  categoryId: string;
  memo: string;
  weight: string;
  minutes: string;
  intervals: IntervalDraft[];
};

export function createRecordEditDraft(session: TrackingSession, now: number): EntryDraft[] {
  const allocated = calculateAllocatedDurationsByEntry(session, now);
  return getWorkEntries(session).map((entry) => {
    const id = getWorkEntryId(entry);
    const periods = getWorkEntryIntervals(session, id);
    const range = getWorkEntryTimeRange(session, id);
    const source = periods.length
      ? periods
      : [
          {
            start: range.start ?? session.startedAt,
            end: range.end ?? range.start ?? session.startedAt,
          },
        ];
    return {
      id,
      categoryId: entry.categoryId,
      memo: entry.memo,
      weight: String(entry.weight),
      minutes: String(Math.floor((allocated.get(id) ?? 0) / 60000)),
      intervals: source.map((period, index) => ({
        key: index,
        start: formatMinuteDateTimeInput(period.start, session.timezone),
        end: period.end === null ? "" : formatMinuteDateTimeInput(period.end, session.timezone),
        originalStart: period.start,
        originalEnd: period.end,
        removed: false,
      })),
    };
  });
}

export function recordEditsFromDraft(
  session: TrackingSession,
  draft: EntryDraft[],
  mode: SessionWork["mode"],
): WorkEntryEdit[] {
  return draft
    .filter((entry) => entry.intervals.some((period) => !period.removed))
    .map((entry) => {
      const old = getWorkEntries(session).find((value) => getWorkEntryId(value) === entry.id)!;
      return {
        id: entry.id,
        memo: entry.memo,
        weight: Number(entry.weight),
        ...(mode === "manual"
          ? {
              manualMs: editedMinutes(
                entry.minutes,
                session.work?.mode === "manual" ? (old.manualMs ?? null) : null,
              ),
            }
          : {}),
        intervals: entry.intervals
          .filter((period) => !period.removed)
          .map((period) => ({
            start: editedTime(period.start, period.originalStart, session.timezone),
            end:
              period.originalEnd === null
                ? null
                : editedTime(period.end, period.originalEnd, session.timezone),
          }))
          .sort((a, b) => a.start - b.start),
      };
    });
}
