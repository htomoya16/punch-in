"use client";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState } from "../../application/contracts/app-state";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { hasWorkCategory } from "../../domain/tracking/work-entry";
import { shiftPeriod, type Period } from "../../shared/time/calendar";
import { formatRecordDate } from "../../shared/time/date-time-format";
import { PERIODS } from "../app/navigation-items";
import { Dot } from "../components/category-dot";
import DurationValue from "../components/time/duration-value";
import StatsOverview from "./components/stats-overview";

type Props = {
  anchor: string;
  creditedTotal: number;
  exportStats: () => void;
  from: string;
  now: number;
  openStatsHistory: (start: string, end: string, categoryId: string) => void;
  period: Period;
  previousActive: TrackingSession | undefined;
  priorTotal: number;
  runningTimes: Map<string, number>;
  selected: TrackingSession[];
  selectedActive: TrackingSession | undefined;
  selectedRunning: boolean;
  setAnchor: Dispatch<SetStateAction<string>>;
  setPeriod: Dispatch<SetStateAction<Period>>;
  setStatsFilter: Dispatch<SetStateAction<string>>;
  state: AppState;
  statsFilter: string;
  summaries: Map<string, { current: number; previous: number }>;
  to: string;
  today: string;
};

export function StatisticsScreen({
  anchor,
  creditedTotal,
  exportStats,
  from,
  now,
  openStatsHistory,
  period,
  previousActive,
  priorTotal,
  runningTimes,
  selected,
  selectedActive,
  selectedRunning,
  setAnchor,
  setPeriod,
  setStatsFilter,
  state,
  statsFilter,
  summaries,
  to,
  today,
}: Props) {
  return (
    <>
      <div className="toolbar stats-toolbar">
        <div className="segmented">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              className={period === p.id ? "selected" : ""}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <select
            aria-label="集計する作業"
            value={statsFilter}
            onChange={(e) => setStatsFilter(e.target.value)}
          >
            <option value="">すべての作業</option>
            {state.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="text-button" onClick={exportStats}>
            <Download size={16} />
            CSV
          </button>
        </div>
      </div>
      {period !== "all" && (
        <div className="stats-date">
          <button
            className="icon-button"
            aria-label="前の期間"
            onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <label>
            {period === "day"
              ? formatRecordDate(anchor)
              : period === "week"
                ? `${from.replaceAll("-", "/")} — ${to.slice(5).replace("-", "/")}`
                : period === "month"
                  ? `${anchor.slice(0, 4)}年${Number(anchor.slice(5, 7))}月`
                  : `${anchor.slice(0, 4)}年`}
            <input
              className="anchor-input"
              aria-label="集計の基準日"
              type="date"
              value={anchor}
              onChange={(e) => {
                if (e.target.value) setAnchor(e.target.value);
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="次の期間"
            onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}
          >
            <ChevronRight size={20} />
          </button>
          <button className="subtle-button" onClick={() => setAnchor(today)}>
            今
            {period === "day" ? "日" : period === "week" ? "週" : period === "month" ? "月" : "年"}
          </button>
        </div>
      )}
      <section className="stats-total">
        <span>作業時間{selectedRunning && <span className="live-tag">計測中を含む</span>}</span>
        <div>
          <strong>
            <DurationValue value={creditedTotal} />
          </strong>
          {period !== "all" && (
            <span className="comparison">
              前
              {period === "day"
                ? "日"
                : period === "week"
                  ? "週"
                  : period === "month"
                    ? "月"
                    : "年"}{" "}
              <DurationValue value={priorTotal} />
              <b className={creditedTotal >= priorTotal ? "positive" : ""}>
                {priorTotal > 0
                  ? `${creditedTotal >= priorTotal ? "+" : ""}${Math.round(((creditedTotal - priorTotal) / priorTotal) * 100)}%`
                  : "—"}
              </b>
            </span>
          )}
        </div>
      </section>
      <StatsOverview
        today={today}
        accent={state.preferences.accent}
        onHistory={openStatsHistory}
        categoryFilter={statsFilter}
        sessions={selected}
        categories={state.categories}
        now={selectedRunning ? now : 0}
        period={period}
        from={from}
        to={to}
      />
      <section className="category-summary">
        <div className="section-heading">
          <h2>作業別</h2>
        </div>
        {state.categories
          .filter(
            (c) =>
              (!statsFilter || c.id === statsFilter) &&
              (!c.archived || selected.some((s) => hasWorkCategory(s, c.id))),
          )
          .map((c) => {
            const summary = summaries.get(c.id);
            const t =
              (summary?.current ?? 0) + (selectedActive ? (runningTimes.get(c.id) ?? 0) : 0);
            const p =
              (summary?.previous ?? 0) + (previousActive ? (runningTimes.get(c.id) ?? 0) : 0);
            return (
              <div className="summary-row" key={c.id}>
                <span className="category-name" title={c.name}>
                  <Dot color={c.color} />
                  <span className="category-label">{c.name}</span>
                </span>
                <div className="summary-track">
                  <span
                    style={{
                      width: `${creditedTotal ? (t / creditedTotal) * 100 : 0}%`,
                      background: c.color,
                    }}
                  />
                </div>
                <strong>
                  <DurationValue value={t} />
                </strong>
                <span className="summary-percent">
                  {creditedTotal ? Math.round((t / creditedTotal) * 100) : 0}%
                </span>
                {period !== "all" && (
                  <span className="summary-prior">
                    前期間 <DurationValue value={p} />
                  </span>
                )}
              </div>
            );
          })}
      </section>
    </>
  );
}
