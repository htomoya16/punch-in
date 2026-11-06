import type { WorkCategory } from "../../domain/categories/work-category";
import { calculateAllocatedDurationsByEntry } from "../../domain/tracking/duration-allocation";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { getWorkEntries, getWorkEntryId } from "../../domain/tracking/work-entry";
import { getWorkEntryTimeRange } from "../../domain/tracking/work-entry-intervals";
import { formatDayStartTime, formatMinuteIsoTime } from "../../shared/time/date-time-format";
import { csv as formatCsv } from "./format-csv";

export function formatHistoryCsv(
  sessions: TrackingSession[],
  categories: WorkCategory[],
  now: number,
) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  return formatCsv([
    [
      "日付",
      "作業ID",
      "作業",
      "開始日時",
      "終了日時",
      "作業時間（分）",
      "タイムゾーン",
      "1日の開始",
      "メモ",
      "計測中",
    ],
    ...sessions.flatMap((session) =>
      getWorkEntries(session).map((entry) => {
        const entryId = getWorkEntryId(entry);
        const range = getWorkEntryTimeRange(session, entryId);
        return [
          session.businessDay,
          entry.categoryId,
          categoryMap.get(entry.categoryId)?.name ?? "",
          range.start === null ? "" : formatMinuteIsoTime(range.start),
          range.end === null ? "" : formatMinuteIsoTime(range.end),
          Math.floor((calculateAllocatedDurationsByEntry(session, now).get(entryId) ?? 0) / 60000),
          session.timezone,
          formatDayStartTime(session.dayStart),
          entry.memo,
          entry.state !== "finished" ? "はい" : "いいえ",
        ];
      }),
    ),
  ]);
}
