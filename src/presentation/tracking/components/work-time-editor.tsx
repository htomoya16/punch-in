"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { WorkCategory } from "../../../domain/categories/work-category";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { getWorkEntries, getWorkEntryId } from "../../../domain/tracking/work-entry";
import { getWorkEntryTimeRange } from "../../../domain/tracking/work-entry-intervals";
import { formatClockTime, formatMinuteDateTimeInput } from "../../../shared/time/date-time-format";
import DateTimeField from "../../components/fields/date-time-field";
import { editedTime } from "../record-editor";

type Props = {
  session: TrackingSession;
  categories: WorkCategory[];
  pending: boolean;
  currentTime(): string;
  save(payload: unknown): Promise<void>;
};

export default function WorkTimeEditor({ session, categories, pending, currentTime, save }: Props) {
  const items = getWorkEntries(session);
  const [id, setId] = useState(
    getWorkEntryId(items.find((m) => m.state !== "finished") ?? items[0]),
  );
  const member = items.find((m) => getWorkEntryId(m) === id)!;
  const range = getWorkEntryTimeRange(session, id);
  return (
    <>
      <label className="field">
        記録
        <select aria-label="日時を編集する記録" value={id} onChange={(e) => setId(e.target.value)}>
          {items.map((m) => (
            <option key={getWorkEntryId(m)} value={getWorkEntryId(m)}>
              {categories.find((c) => c.id === m.categoryId)?.name ?? "削除済み"}　
              {getWorkEntryTimeRange(session, getWorkEntryId(m)).start === null
                ? "—"
                : formatClockTime(
                    getWorkEntryTimeRange(session, getWorkEntryId(m)).start!,
                    session.timezone,
                  )}
            </option>
          ))}
        </select>
      </label>
      <EntryTime
        key={id}
        id={id}
        start={range.start ?? session.startedAt}
        end={member.state === "finished" ? range.end : null}
        state={member.state}
        session={session}
        pending={pending}
        currentTime={currentTime}
        save={save}
      />
    </>
  );
}

function EntryTime({
  id,
  start,
  end,
  state,
  session,
  pending,
  currentTime,
  save,
}: Omit<Props, "categories"> & { id: string; start: number; end: number | null; state: string }) {
  const [from, setFrom] = useState(formatMinuteDateTimeInput(start, session.timezone));
  const [to, setTo] = useState(
    end === null ? "" : formatMinuteDateTimeInput(end, session.timezone),
  );
  const [open, setOpen] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState("");
  return (
    <div>
      <DateTimeField
        label="開始"
        value={from}
        open={open === "start"}
        onOpen={(v) => setOpen(v ? "start" : null)}
        onChange={setFrom}
        currentTime={currentTime}
      />
      {state === "finished" ? (
        <DateTimeField
          label="終了"
          value={to}
          open={open === "end"}
          onOpen={(v) => setOpen(v ? "end" : null)}
          onChange={setTo}
          currentTime={currentTime}
        />
      ) : (
        <div className="field-caption">{state === "paused" ? "一時停止中" : "計測中"}</div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="primary-button"
          disabled={pending}
          onClick={() => {
            try {
              const startedAt = editedTime(from, start, session.timezone);
              const endedAt = state === "finished" ? editedTime(to, end, session.timezone) : null;
              if (endedAt !== null && endedAt < startedAt)
                throw new Error("終了時刻は開始時刻以降にしてください");
              setError("");
              void save({ id: session.id, control: "timing", memberId: id, startedAt, endedAt });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {pending ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}保存する
        </button>
      </div>
    </div>
  );
}
