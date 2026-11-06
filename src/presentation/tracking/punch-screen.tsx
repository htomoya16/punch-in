"use client";

import { LoaderCircle, Pencil, Play, Plus, Settings2, Square } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { type CSSProperties } from "react";
import type { AppActionName } from "../../application/contracts/app-action";
import type { AppState, PendingPunch } from "../../application/contracts/app-state";
import type { AppActionResult } from "../../application/contracts/client-action";
import type { WorkCategory } from "../../domain/categories/work-category";
import { getRecordedDuration } from "../../domain/tracking/recorded-duration";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { getWorkEntries } from "../../domain/tracking/work-entry";
import { contrastText, readableColor } from "../../shared/colors/color-contrast";
import { getLocalDateTimeParts } from "../../shared/time/calendar";
import { formatClockTime, formatRecordDate } from "../../shared/time/date-time-format";
import type { AppView } from "../app/app-types";
import DurationValue from "../components/time/duration-value";
import ParallelControls from "./components/parallel-controls";
import { diagonalColors } from "./elapsed-colors";
import type { PunchButtonPosition } from "./punch-button-layout";

type Props = {
  addCategory: () => void;
  buttonPositions: { wide: PunchButtonPosition[]; compact: PunchButtonPosition[] };
  category: (id: string) => WorkCategory | undefined;
  dateFormatter: Intl.DateTimeFormat;
  displayCategory: WorkCategory | undefined;
  displaySession: TrackingSession;
  editSession: (session: TrackingSession) => Promise<void>;
  go: (next: AppView, historyFocusDay?: string) => void;
  memberState: (id: string) => "active" | "paused" | "finished" | undefined;
  mutate: (
    action: AppActionName,
    payload: unknown,
    success?: string,
  ) => Promise<AppActionResult | null>;
  now: number;
  pending: boolean;
  pendingPunch: PendingPunch | null;
  running: TrackingSession | undefined;
  runningCategory: WorkCategory | undefined;
  runningEntryTimes: Map<string, number>;
  setHistoryDay: (day: string) => void;
  setHistoryTo: Dispatch<SetStateAction<string>>;
  state: AppState;
  timerColors: string[];
  today: string;
  visibleCats: WorkCategory[];
};

export function PunchScreen({
  addCategory,
  buttonPositions,
  category,
  dateFormatter,
  displayCategory,
  displaySession,
  editSession,
  go,
  memberState,
  mutate,
  now,
  pending,
  pendingPunch,
  running,
  runningCategory,
  runningEntryTimes,
  setHistoryDay,
  setHistoryTo,
  state,
  timerColors,
  today,
  visibleCats,
}: Props) {
  return (
    <>
      <div className="punch-tools">
        <span className="activity-date">
          {today !== getLocalDateTimeParts(now, state.preferences.timezone).date
            ? `${formatRecordDate(today)}の記録`
            : formatRecordDate(today)}
        </span>
        <button className="text-button" onClick={() => go("categories")}>
          <Settings2 size={15} />
          ボタンを編集
        </button>
      </div>
      <section className="punch-stage" aria-label="打刻">
        <div className="clock-area">
          <div className="full-date">{dateFormatter.format(now)}</div>
          <div
            className="big-clock"
            aria-label={`現在時刻 ${formatClockTime(now, state.preferences.timezone, true)}`}
          >
            <span>{formatClockTime(now, state.preferences.timezone)}</span>
            <small className="clock-seconds">
              :
              {String(getLocalDateTimeParts(now, state.preferences.timezone).second).padStart(
                2,
                "0",
              )}
            </small>
          </div>
          <div
            className={`current-state ${running ? "is-running" : ""} ${running && getWorkEntries(running).every((m) => m.state !== "active") ? "is-paused" : ""}`}
            style={runningCategory ? { color: readableColor(runningCategory.color) } : undefined}
          >
            {running ? (
              <>
                <span className="pulse-dot" />
                <span>
                  {getWorkEntries(running).every((m) => m.state !== "active")
                    ? "一時停止中"
                    : getWorkEntries(running)
                        .filter((m) => m.state === "active")
                        .map((m) => category(m.categoryId)?.name)
                        .join("・")}
                </span>
              </>
            ) : (
              <>
                <span className="idle-dot" />
                未計測
              </>
            )}
          </div>
          <div
            className={`live-details ${running ? "is-active" : ""}`}
            inert={!running}
            aria-hidden={!running}
            style={displayCategory ? { color: readableColor(displayCategory.color) } : undefined}
          >
            <div className="live-details-content">
              <span
                className={`running-elapsed ${timerColors.length > 1 ? "has-multiple-colors" : ""}`}
                style={{
                  ...(timerColors.length > 1
                    ? { backgroundImage: diagonalColors(timerColors) }
                    : { color: timerColors[0] ?? (running ? "#64748b" : undefined) }),
                }}
              >
                <DurationValue
                  value={displaySession ? getRecordedDuration(displaySession, now) : 0}
                  seconds
                />
              </span>
              <button
                className="running-memo"
                disabled={!running || pending}
                onClick={() => {
                  if (!running) return;
                  if (!running.work) {
                    void editSession(running);
                    return;
                  }
                  if (running.businessDay !== today) {
                    setHistoryDay(running.businessDay);
                    setHistoryTo(running.businessDay);
                    go("history", running.businessDay);
                  }
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>(
                          `[data-record-id="${CSS.escape(running.id)}"] .inline-memo textarea`,
                        )
                        ?.focus(),
                    ),
                  );
                }}
              >
                <Pencil size={13} />
                {displaySession?.work ? "メモ" : displaySession?.memo || "メモを追加"}
              </button>
            </div>
          </div>
        </div>
        <div className="punch-controls">
          <div className={`punch-buttons ${visibleCats.length === 1 ? "single-button" : ""}`}>
            {visibleCats.map((c, index) => (
              <button
                key={c.id}
                className={`punch-button ${memberState(c.id) === "active" ? "recording" : memberState(c.id) === "paused" ? "paused" : ""}`}
                style={
                  {
                    "--punch-row": buttonPositions.wide[index].row,
                    "--punch-column": buttonPositions.wide[index].column,
                    "--compact-row": buttonPositions.compact[index].row,
                    "--compact-column": buttonPositions.compact[index].column,
                    "--category": c.color,
                    "--category-stroke": readableColor(c.color, 3),
                    "--category-text": readableColor(c.color),
                    "--category-ink": contrastText(c.color),
                  } as CSSProperties
                }
                disabled={pending}
                onClick={() =>
                  void mutate(
                    "punch",
                    { categoryId: c.id },
                    memberState(c.id) === "paused"
                      ? `${c.name}を再開しました`
                      : memberState(c.id) === "active" || memberState(c.id) === "paused"
                        ? `${c.name}を終了しました`
                        : `${c.name}を開始しました`,
                  )
                }
                aria-label={`${c.name}を${memberState(c.id) === "paused" ? "再開" : memberState(c.id) === "active" ? "終了" : running ? "並行追加" : "開始"}`}
                aria-pressed={memberState(c.id) === "active" || memberState(c.id) === "paused"}
                aria-busy={pendingPunch?.categoryId === c.id || undefined}
              >
                <span className="punch-action">
                  {pendingPunch?.categoryId === c.id ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : memberState(c.id) === "active" ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <Play size={15} />
                  )}
                </span>
                <span>{c.name}</span>
                {(memberState(c.id) === "active" ||
                  memberState(c.id) === "paused" ||
                  pendingPunch?.categoryId === c.id) && (
                  <span className="punch-running-label">
                    {pendingPunch?.categoryId === c.id
                      ? "保存中"
                      : memberState(c.id) === "paused"
                        ? "一時停止中"
                        : "計測中"}
                  </span>
                )}
              </button>
            ))}
          </div>
          {running && (
            <ParallelControls
              session={running}
              categories={state.categories}
              times={runningEntryTimes}
              pending={pending}
              control={(control, categoryId) => {
                void mutate("work", { id: running.id, control, categoryId });
              }}
            />
          )}
          <button className="punch-add" onClick={addCategory} aria-label="作業を追加">
            <Plus size={23} />
          </button>
        </div>
      </section>
      {running && runningCategory?.hidden && !running.work && (
        <div className="notice">
          非表示の作業「{runningCategory.name}」を計測中です
          <button
            className="text-button"
            disabled={pending}
            onClick={() =>
              void mutate("punch", { categoryId: runningCategory.id }, "計測を終了しました")
            }
          >
            終了する
          </button>
        </div>
      )}
    </>
  );
}
