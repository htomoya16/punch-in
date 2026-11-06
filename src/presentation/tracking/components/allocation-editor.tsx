"use client";

import { Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkCategory } from "../../../domain/categories/work-category";
import { calculateAllocatedDurationsByEntry } from "../../../domain/tracking/duration-allocation";
import { getRecordedDuration } from "../../../domain/tracking/recorded-duration";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { getWorkEntryId } from "../../../domain/tracking/work-entry";
import { getWorkEntryTimeRange } from "../../../domain/tracking/work-entry-intervals";
import { formatClockTime } from "../../../shared/time/date-time-format";
import DurationValue from "../../components/time/duration-value";
import { editedMinutes } from "../record-editor";

export default function AllocationEditor({
  session,
  categories,
  pending,
  save,
}: {
  session: TrackingSession;
  categories: WorkCategory[];
  pending: boolean;
  save(payload: unknown): Promise<void>;
}) {
  const w = session.work!;
  const [mode, setMode] = useState(w.mode);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      w.members.map((m) => [
        getWorkEntryId(m),
        String(
          w.mode === "ratio"
            ? m.weight
            : Math.floor(
                (calculateAllocatedDurationsByEntry(session, 0).get(getWorkEntryId(m)) ?? 0) /
                  60000,
              ),
        ),
      ]),
    ),
  );
  const [error, setError] = useState("");
  const automatic = useMemo(
    () => calculateAllocatedDurationsByEntry({ ...session, work: { ...w, mode: "auto" } }, 0),
    [session, w],
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        let v: Record<string, number>;
        try {
          v = Object.fromEntries(
            Object.entries(values).map(([id, n]) => [
              id,
              mode === "manual"
                ? editedMinutes(
                    n,
                    w.mode === "manual"
                      ? (w.members.find((m) => getWorkEntryId(m) === id)?.manualMs ?? null)
                      : null,
                  )
                : Number(n),
            ]),
          );
        } catch (e) {
          setError((e as Error).message);
          return;
        }
        if (
          Object.values(v).some((n) => !Number.isFinite(n) || n < 0) ||
          (mode === "ratio" && Object.values(v).every((n) => n === 0))
        ) {
          setError("配分を確認してください");
          return;
        }
        void save({ id: session.id, control: "allocate", mode, values: v });
      }}
    >
      <div className="allocation-period">
        <span>
          <Clock3 className="time-range-icon" size={14} strokeWidth={1.6} aria-hidden="true" />
          {formatClockTime(session.startedAt, session.timezone)} →{" "}
          {session.endedAt === null ? "計測中" : formatClockTime(session.endedAt, session.timezone)}
        </span>
        <strong>
          記録時間 <DurationValue value={getRecordedDuration(session, Date.now())} />
        </strong>
      </div>
      {session.endedAt === null ? (
        <p>計測を終了すると配分を編集できます。</p>
      ) : (
        <>
          <div className="segmented allocation-modes">
            {(["auto", "ratio", "manual"] as const).map((m, i) => (
              <button
                type="button"
                key={m}
                className={mode === m ? "selected" : ""}
                onClick={() => {
                  setMode(m);
                  setValues(
                    Object.fromEntries(
                      w.members.map((member) => [
                        getWorkEntryId(member),
                        String(
                          m === "ratio"
                            ? member.weight
                            : Math.floor(
                                (calculateAllocatedDurationsByEntry(session, 0).get(
                                  getWorkEntryId(member),
                                ) ?? 0) / 60000,
                              ),
                        ),
                      ]),
                    ),
                  );
                }}
              >
                {["均等", "比率", "時間"][i]}
              </button>
            ))}
          </div>
          {w.members.map((m) => (
            <label className="setting-row" key={getWorkEntryId(m)}>
              <span>
                {categories.find((c) => c.id === m.categoryId)?.name ?? "削除済み"}
                <small className="allocation-member-period">
                  <Clock3
                    className="time-range-icon"
                    size={12}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  {getWorkEntryTimeRange(session, getWorkEntryId(m)).start === null
                    ? "—"
                    : formatClockTime(
                        getWorkEntryTimeRange(session, getWorkEntryId(m)).start!,
                        session.timezone,
                      )}{" "}
                  →{" "}
                  {getWorkEntryTimeRange(session, getWorkEntryId(m)).end === null
                    ? "—"
                    : formatClockTime(
                        getWorkEntryTimeRange(session, getWorkEntryId(m)).end!,
                        session.timezone,
                      )}
                </small>
              </span>
              {mode === "auto" ? (
                <strong>
                  <DurationValue value={automatic.get(getWorkEntryId(m)) ?? 0} />
                </strong>
              ) : (
                <div className="input-unit">
                  <input
                    required
                    type="number"
                    min="0"
                    step={mode === "manual" ? "1" : "any"}
                    max={mode === "manual" ? 5259600 : 1000000}
                    value={values[getWorkEntryId(m)]}
                    onChange={(e) => setValues({ ...values, [getWorkEntryId(m)]: e.target.value })}
                  />
                  <span>{mode === "manual" ? "分" : "比"}</span>
                </div>
              )}
            </label>
          ))}
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="primary-button" disabled={pending}>
              保存する
            </button>
          </div>
        </>
      )}
    </form>
  );
}
