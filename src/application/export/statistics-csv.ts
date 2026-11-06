import type { WorkCategory } from "../../domain/categories/work-category";
import { calculateAllocatedDurationsByCategory } from "../../domain/tracking/duration-allocation";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { hasWorkCategory } from "../../domain/tracking/work-entry";
import type { Period } from "../../shared/time/calendar";
import { formatDurationMinutes } from "../../shared/time/duration-format";
import { csv as formatCsv } from "./format-csv";

type StatisticsCsvInput = {
  categories: WorkCategory[];
  categoryFilter: string;
  period: Period;
  from: string;
  to: string;
  sessions: TrackingSession[];
  now: number;
  totalMs: number;
  includesRunning: boolean;
};

export function formatStatisticsCsv(input: StatisticsCsvInput) {
  const { categories, categoryFilter, period, from, to, sessions, now, totalMs, includesRunning } =
    input;
  const periodStart = period === "all" ? "全期間" : from;
  const periodEnd = period === "all" ? "" : to;
  return formatCsv([
    ["期間開始", "期間終了", "作業ID", "作業", "作業時間（分）", "時間", "計測中を含む"],
    ...categories
      .filter((category) => !categoryFilter || category.id === categoryFilter)
      .map((category) => {
        const records = sessions.filter((session) => hasWorkCategory(session, category.id));
        const durationMs = records.reduce(
          (total, session) =>
            total + (calculateAllocatedDurationsByCategory(session, now).get(category.id) ?? 0),
          0,
        );
        return [
          periodStart,
          periodEnd,
          category.id,
          category.name,
          Math.floor(durationMs / 60000),
          formatDurationMinutes(durationMs),
          records.some((session) => session.endedAt === null) ? "はい" : "いいえ",
        ];
      }),
    [
      periodStart,
      periodEnd,
      "",
      "作業時間",
      Math.floor(totalMs / 60000),
      formatDurationMinutes(totalMs),
      includesRunning ? "はい" : "いいえ",
    ],
  ]);
}
