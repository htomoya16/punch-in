"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { IntervalDraft } from "../record-edit-draft";
import DateTimeField from "../../components/fields/date-time-field";
import DurationValue from "../../components/time/duration-value";
import { editedTime } from "../record-editor";

export function IntervalEditRow({
  period,
  index,
  pending,
  currentTime,
  timezone,
  change,
  remove,
}: {
  period: IntervalDraft;
  index: number;
  pending: boolean;
  currentTime: () => string;
  timezone: string;
  change: (patch: Partial<IntervalDraft>) => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState<"start" | "end" | null>(null);
  let duration: number | undefined;
  try {
    if (period.originalEnd !== null)
      duration =
        editedTime(period.end, period.originalEnd, timezone) -
        editedTime(period.start, period.originalStart, timezone);
  } catch {
    /* A partially entered date is validated when saving. */
  }
  if (period.removed)
    return (
      <div className="interval-removed">
        <span>区間{index + 1}を削除予定</span>
        <button
          type="button"
          className="text-button"
          disabled={pending}
          onClick={() => change({ removed: false })}
        >
          <RotateCcw size={14} />
          取り消す
        </button>
      </div>
    );
  return (
    <div className="interval-edit-row" role="group" aria-label={`区間${index + 1}`}>
      <DateTimeField
        label="開始"
        value={period.start}
        open={open === "start"}
        onOpen={(value) => setOpen(value ? "start" : null)}
        onChange={(start) => change({ start })}
        currentTime={currentTime}
      />
      {period.originalEnd === null ? (
        <div className="interval-live">計測中</div>
      ) : (
        <DateTimeField
          label="終了"
          value={period.end}
          open={open === "end"}
          onOpen={(value) => setOpen(value ? "end" : null)}
          onChange={(end) => change({ end })}
          currentTime={currentTime}
        />
      )}
      <button
        type="button"
        className="icon-button danger"
        disabled={pending || period.originalEnd === null}
        aria-label={`区間${index + 1}を削除`}
        onClick={remove}
      >
        <Trash2 size={16} />
      </button>
      {period.originalEnd !== null && (
        <output className="interval-edit-duration" aria-label={`区間${index + 1}の時間`}>
          {duration !== undefined && duration >= 0 ? <DurationValue value={duration} /> : "—"}
        </output>
      )}
    </div>
  );
}
