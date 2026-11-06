"use client";

import { ArrowRight } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { formatDurationSeconds } from "../../shared/time/duration-format";
import type { AppView } from "../app/app-types";
import DurationValue from "../components/time/duration-value";

type Props = {
  daily: TrackingSession[];
  dailyTotal: number;
  go: (next: AppView, historyFocusDay?: string) => void;
  recordTable: (list: TrackingSession[], showIntervals?: boolean) => React.JSX.Element;
  setHistoryDay: (day: string) => void;
  setHistoryTo: Dispatch<SetStateAction<string>>;
  today: string;
  visibleDaily: TrackingSession[];
};

export function TodayRecords({
  daily,
  dailyTotal,
  go,
  recordTable,
  setHistoryDay,
  setHistoryTo,
  today,
  visibleDaily,
}: Props) {
  return (
    <section className="today-records">
      <div className="section-heading">
        <h2>今日の記録</h2>
        <strong
          className="today-records-total tabular"
          aria-label={`今日の記録時間 ${formatDurationSeconds(dailyTotal)}`}
        >
          <DurationValue value={dailyTotal} seconds />
        </strong>
        <button
          className="text-button"
          onClick={() => {
            setHistoryDay(today);
            setHistoryTo(today);
            go("history");
          }}
        >
          履歴を見る
          <ArrowRight size={15} />
        </button>
      </div>
      {recordTable(visibleDaily)}
      {daily.length > 5 && (
        <button
          className="more-button"
          onClick={() => {
            setHistoryDay(today);
            setHistoryTo(today);
            go("history");
          }}
        >
          すべての記録を見る
        </button>
      )}
    </section>
  );
}
