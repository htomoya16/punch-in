"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkCategory } from "../../../domain/categories/work-category";
import { calculateAllocatedDurationsByEntry } from "../../../domain/tracking/duration-allocation";
import {
  editTrackingRecord,
  trackingRecordStructure,
} from "../../../domain/tracking/edit-tracking-record";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import {
  getWorkEntries,
  getWorkEntryId,
  type SessionWork,
} from "../../../domain/tracking/work-entry";
import { formatMinuteDateTimeInput } from "../../../shared/time/date-time-format";
import {
  createRecordEditDraft,
  recordEditsFromDraft,
  type EntryDraft,
  type IntervalDraft,
} from "../record-edit-draft";
import DurationValue from "../../components/time/duration-value";
import { IntervalEditRow } from "./interval-edit-row";

export function TrackingRecordEditor({
  session,
  categories,
  pending,
  errorMessage,
  now,
  close,
  save,
}: {
  session: TrackingSession;
  categories: WorkCategory[];
  pending: boolean;
  errorMessage?: string;
  now: () => number;
  close: () => void;
  save: (payload: unknown) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => createRecordEditDraft(session, now()));
  const [mode, setMode] = useState<SessionWork["mode"]>(session.work!.mode);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; key: number } | null>(null);
  const [entryLimit, setEntryLimit] = useState(20);
  const preview = useMemo(() => {
    try {
      return editTrackingRecord(session, recordEditsFromDraft(session, draft, mode), mode, now());
    } catch {
      return undefined;
    }
  }, [session, draft, mode, now]);
  const allocated = preview
    ? calculateAllocatedDurationsByEntry(preview, now())
    : new Map<string, number>();
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  function changeEntry(id: string, patch: Partial<EntryDraft>) {
    setDraft((entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function changePeriod(id: string, key: number, patch: Partial<IntervalDraft>) {
    setDraft((entries) =>
      entries.map((entry) =>
        entry.id !== id
          ? entry
          : {
              ...entry,
              intervals: entry.intervals.map((period) =>
                period.key === key ? { ...period, ...patch } : period,
              ),
            },
      ),
    );
  }

  function removePeriod(entry: EntryDraft, key: number) {
    if (entry.intervals.filter((period) => !period.removed).length === 1)
      setConfirm({ id: entry.id, key });
    else changePeriod(entry.id, key, { removed: true });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (confirm) return;
    try {
      const entries = recordEditsFromDraft(session, draft, mode);
      editTrackingRecord(session, entries, mode, now());
      setError("");
      void save({
        id: session.id,
        control: "edit",
        edit: {
          expectedStructure: trackingRecordStructure(session),
          expectedMemos: Object.fromEntries(
            getWorkEntries(session).map((entry) => [getWorkEntryId(entry), entry.memo]),
          ),
          entries,
          mode,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "区間を確認してください");
    }
  }

  const removedAll = draft.every((entry) => entry.intervals.every((period) => period.removed));
  return (
    <form className="tracking-record-editor" onSubmit={submit}>
      {session.endedAt !== null && (
        <div className="record-allocation-control">
          <span>配分</span>
          <div className="segmented">
            {(["auto", "ratio", "manual"] as const).map((value, index) => (
              <button
                type="button"
                key={value}
                className={mode === value ? "selected" : ""}
                disabled={pending}
                onClick={() => setMode(value)}
              >
                {["均等", "比率", "時間"][index]}
              </button>
            ))}
          </div>
        </div>
      )}
      <fieldset disabled={pending}>
        {draft.slice(0, entryLimit).map((entry) => {
          const removed = entry.intervals.every((period) => period.removed);
          const category = categoryMap.get(entry.categoryId);
          return (
            <section
              key={entry.id}
              className={`record-edit-entry ${removed ? "is-removed" : ""}`}
              aria-label={category?.name ?? "削除済みの作業"}
            >
              <div className="record-edit-entry-heading">
                <h3>
                  <span className="dot" style={{ background: category?.color }} />
                  {category?.name ?? "削除済みの作業"}
                </h3>
                {!removed && (
                  <strong>
                    <DurationValue value={allocated.get(entry.id) ?? 0} />
                  </strong>
                )}
                {removed && <span>作業とメモを削除予定</span>}
              </div>
              <EntryIntervals
                timezone={session.timezone}
                entry={entry}
                pending={pending}
                currentTime={() => formatMinuteDateTimeInput(now(), session.timezone)}
                change={(key, patch) => changePeriod(entry.id, key, patch)}
                remove={(key) => removePeriod(entry, key)}
              />
              {confirm?.id === entry.id && (
                <div className="interval-delete-confirm" role="alert" aria-label="作業とメモの削除">
                  <p>最後の区間です。この作業とメモも削除します。</p>
                  <div>
                    <button
                      type="button"
                      className="outline-button"
                      onClick={() => setConfirm(null)}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        changePeriod(entry.id, confirm.key, { removed: true });
                        setConfirm(null);
                      }}
                    >
                      作業とメモを削除
                    </button>
                  </div>
                </div>
              )}
              {!removed && (
                <>
                  {mode !== "auto" && (
                    <label className="record-edit-allocation">
                      {mode === "ratio" ? "比率" : "作業時間"}
                      <span className="input-unit">
                        <input
                          type="number"
                          min="0"
                          max={mode === "ratio" ? 1000000 : 5259600}
                          step={mode === "ratio" ? "any" : "1"}
                          required
                          value={mode === "ratio" ? entry.weight : entry.minutes}
                          onChange={(event) =>
                            changeEntry(
                              entry.id,
                              mode === "ratio"
                                ? { weight: event.target.value }
                                : { minutes: event.target.value },
                            )
                          }
                        />
                        <span>{mode === "ratio" ? "比" : "分"}</span>
                      </span>
                    </label>
                  )}
                  <label className="field record-edit-memo">
                    メモ
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={entry.memo}
                      onChange={(event) => changeEntry(entry.id, { memo: event.target.value })}
                    />
                  </label>
                </>
              )}
            </section>
          );
        })}
        {draft.length > entryLimit && (
          <button
            className="text-button"
            type="button"
            onClick={() => setEntryLimit(entryLimit + 20)}
          >
            作業をさらに表示
          </button>
        )}
      </fieldset>
      {(error || errorMessage) && (
        <p className="form-error" role="alert">
          {error || errorMessage}
        </p>
      )}
      <div className="modal-actions">
        <button className="outline-button" type="button" disabled={pending} onClick={close}>
          キャンセル
        </button>
        <button
          className={removedAll ? "danger-button" : "primary-button"}
          disabled={pending || !!confirm}
          aria-busy={pending}
        >
          {pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
          {removedAll ? "記録を削除する" : "保存する"}
        </button>
      </div>
    </form>
  );
}

function EntryIntervals({
  entry,
  pending,
  currentTime,
  timezone,
  change,
  remove,
}: {
  entry: EntryDraft;
  pending: boolean;
  currentTime: () => string;
  timezone: string;
  change: (key: number, patch: Partial<IntervalDraft>) => void;
  remove: (key: number) => void;
}) {
  const [limit, setLimit] = useState(20);
  return (
    <div className="record-edit-intervals">
      {entry.intervals.slice(0, limit).map((period, index) => (
        <IntervalEditRow
          key={period.key}
          period={period}
          index={index}
          pending={pending}
          currentTime={currentTime}
          timezone={timezone}
          change={(patch) => change(period.key, patch)}
          remove={() => remove(period.key)}
        />
      ))}
      {entry.intervals.length > limit && (
        <button type="button" className="text-button" onClick={() => setLimit(limit + 20)}>
          区間をさらに表示
        </button>
      )}
    </div>
  );
}
