"use client";

import { ChevronRight, Clock3, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import type { WorkCategory } from "../../../domain/categories/work-category";
import { calculateAllocatedDurationsByEntry } from "../../../domain/tracking/duration-allocation";
import { getRecordedDuration } from "../../../domain/tracking/recorded-duration";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { getWorkEntryId } from "../../../domain/tracking/work-entry";
import {
  getWorkEntryIntervals,
  getWorkEntryTimeRange,
} from "../../../domain/tracking/work-entry-intervals";
import { getWorkEntryMemoKey } from "../../../domain/tracking/work-entry-memo";
import { getLocalDateTimeParts } from "../../../shared/time/calendar";
import { formatClockTime, formatMinuteDateTimeInput } from "../../../shared/time/date-time-format";
import { formatDurationInWords, formatDurationSeconds } from "../../../shared/time/duration-format";
import DurationValue from "../../components/time/duration-value";
import { chronologicalMembers } from "../record-order";
import type { WorkEntryMemoStore } from "../work-entry-memo-store";
import MemoCell from "./memo-cell";

type Props = {
  sessions: TrackingSession[];
  categories: WorkCategory[];
  now: number;
  store: WorkEntryMemoStore;
  pending: boolean;
  showIntervals?: boolean;
  seconds?: boolean;
  onEdit(s: TrackingSession): void;
  onDelete(s: TrackingSession, memberId?: string): void;
};

function endLabel(s: TrackingSession, seconds: boolean) {
  return s.endedAt === null
    ? s.work?.members.every((m) => m.state !== "active")
      ? "一時停止中"
      : "計測中"
    : `${getLocalDateTimeParts(s.startedAt, s.timezone).date !== getLocalDateTimeParts(s.endedAt, s.timezone).date ? "翌日以降 " : ""}${formatClockTime(s.endedAt, s.timezone, seconds)}`;
}

export default function WorkRecords({
  sessions,
  categories,
  now,
  store,
  pending,
  showIntervals = false,
  seconds = false,
  onEdit,
  onDelete,
}: Props) {
  const [limits, setLimits] = useState<Record<string, number>>({});
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  return (
    <div className="work-records record-list">
      {sessions.map((s) => {
        const times = calculateAllocatedDurationsByEntry(s, now);
        const items = chronologicalMembers(s);
        const isPending = s.id.startsWith("pending:");
        const real = getRecordedDuration(s, now);
        const envelope = items.length > 1 || (times.get(getWorkEntryId(items[0])) ?? 0) !== real;
        const actions = (
          <div className="record-actions">
            <button
              className="icon-button"
              aria-label="記録を編集"
              disabled={pending || isPending}
              onClick={() => onEdit(s)}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button danger"
              aria-label="記録を削除"
              disabled={pending || isPending}
              onClick={() => onDelete(s)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
        return (
          <article
            className={`work-record ${envelope ? "has-record-envelope" : "is-single-record"}`}
            data-record-id={s.id}
            key={s.id}
          >
            {envelope && (
              <header className="record-envelope">
                <div className="record-range tabular">
                  <Clock3
                    className="time-range-icon"
                    size={15}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <time>{formatClockTime(s.startedAt, s.timezone, seconds)}</time>
                  <span aria-hidden="true">→</span>
                  <time>{endLabel(s, seconds)}</time>
                </div>
                <div className="record-total">
                  <small>記録時間</small>
                  <strong>
                    <DurationValue value={real} seconds={seconds} />
                  </strong>
                </div>
                {actions}
              </header>
            )}
            {items.length > (limits[s.id] ?? 50) && (
              <button
                className="text-button"
                onClick={() => setLimits((v) => ({ ...v, [s.id]: (v[s.id] ?? 50) + 50 }))}
              >
                以前の記録を表示（{items.length - (limits[s.id] ?? 50)}件）
              </button>
            )}
            {items.slice(-(limits[s.id] ?? 50)).map((m) => {
              const key = getWorkEntryId(m);
              const category = categoryMap.get(m.categoryId);
              const range = getWorkEntryTimeRange(s, key);
              const periods = getWorkEntryIntervals(s, key);
              const name = category?.name ?? "削除済み";

              return (
                <section
                  data-member-id={key}
                  className={`work-record-member record-member ${m.state === "paused" ? "is-paused" : ""}`}
                  key={key}
                  style={{ "--record-color": category?.color ?? "#64748b" } as CSSProperties}
                  aria-label={name}
                >
                  <div className="record-member-heading">
                    <span className="record-member-name">{name}</span>
                    <div className="record-member-summary">
                      <strong
                        className="record-member-time"
                        title="作業時間"
                        aria-label={`作業時間 ${seconds ? formatDurationSeconds(times.get(key) ?? 0) : formatDurationInWords(times.get(key) ?? 0)}`}
                      >
                        <DurationValue value={times.get(key) ?? 0} seconds={seconds} />
                      </strong>
                      <div className="record-member-period tabular">
                        <Clock3
                          className="time-range-icon"
                          size={14}
                          strokeWidth={1.6}
                          aria-hidden="true"
                        />
                        <time
                          title={
                            range.start === null
                              ? undefined
                              : formatMinuteDateTimeInput(range.start, s.timezone).replace("T", " ")
                          }
                          aria-label={`開始 ${range.start === null ? "不明" : formatClockTime(range.start, s.timezone, seconds)}`}
                        >
                          {range.start === null
                            ? "—"
                            : formatClockTime(range.start, s.timezone, seconds)}
                        </time>
                        <span className="record-time-track" aria-hidden="true" />
                        <time
                          title={
                            range.end === null
                              ? undefined
                              : formatMinuteDateTimeInput(range.end, s.timezone).replace("T", " ")
                          }
                          aria-label={
                            m.state === "finished"
                              ? `終了 ${range.end === null ? "不明" : formatClockTime(range.end, s.timezone, seconds)}`
                              : m.state === "paused"
                                ? "一時停止中"
                                : "計測中"
                          }
                        >
                          {m.state === "finished"
                            ? range.end === null
                              ? "—"
                              : `${range.start !== null && getLocalDateTimeParts(range.start, s.timezone).date !== getLocalDateTimeParts(range.end, s.timezone).date ? "翌日以降 " : ""}${formatClockTime(range.end, s.timezone, seconds)}`
                            : m.state === "paused"
                              ? "一時停止中"
                              : "計測中"}
                        </time>
                      </div>
                    </div>
                    {envelope
                      ? items.length > 1 && (
                          <button
                            className="icon-button danger"
                            aria-label={`${name}だけ削除`}
                            disabled={isPending || pending}
                            onClick={() => onDelete(s, key)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )
                      : actions}
                  </div>

                  <MemoCell
                    id={getWorkEntryMemoKey(s, key)}
                    target={
                      s.work
                        ? {
                            id: s.id,
                            categoryId: m.categoryId,
                            ...(m.id ? { memberId: m.id } : {}),
                          }
                        : undefined
                    }
                    value={m.memo}
                    label={`${name} ${range.start === null ? "" : formatClockTime(range.start, s.timezone, seconds)}のメモ`}
                    store={store}
                    disabled={isPending || pending}
                  />
                  {showIntervals && periods.length > 1 && (
                    <details className="record-intervals">
                      <summary>
                        <ChevronRight size={14} />
                        <span>計測区間</span>
                        <span className="record-interval-count">{periods.length}</span>
                      </summary>
                      <div className="record-interval-list">
                        {periods.map((p, i) => (
                          <div className="record-interval tabular" key={i}>
                            <time>
                              <Clock3
                                className="time-range-icon"
                                size={13}
                                strokeWidth={1.6}
                                aria-hidden="true"
                              />
                              {formatClockTime(p.start, s.timezone)}
                            </time>
                            <span aria-hidden="true">→</span>
                            <time>
                              {p.end === null ? "計測中" : formatClockTime(p.end, s.timezone)}
                            </time>
                            <strong>
                              <DurationValue value={Math.max(0, (p.end ?? now) - p.start)} />
                            </strong>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </section>
              );
            })}
          </article>
        );
      })}
    </div>
  );
}
