import { Check, LoaderCircle, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { WorkCategory } from "../../../domain/categories/work-category";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { formatMinuteDateTimeInput, formatRecordDate } from "../../../shared/time/date-time-format";
import DateTimeField from "../../components/fields/date-time-field";
import { Modal } from "../../components/modal";
import { editedTime } from "../record-editor";

export function SessionEditor({
  value,
  categories,
  pending,
  exists,
  errorMessage,
  currentTime,
  close,
  save,
  remove,
}: {
  value: TrackingSession;
  categories: WorkCategory[];
  pending: boolean;
  exists: boolean;
  errorMessage?: string;
  currentTime: () => string;
  close: () => void;
  save: (
    s: TrackingSession & {
      expectedMemo?: string;
    },
  ) => Promise<void>;
  remove: () => void;
}) {
  const [categoryId, setCategoryId] = useState(value.categoryId);
  const [start, setStart] = useState(formatMinuteDateTimeInput(value.startedAt, value.timezone));
  const [end, setEnd] = useState(
    value.endedAt === null ? "" : formatMinuteDateTimeInput(value.endedAt, value.timezone),
  );
  const [memo, setMemo] = useState(value.memo);
  const [error, setError] = useState("");
  const [openTime, setOpenTime] = useState<"start" | "end" | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const startedAt = editedTime(start, value.startedAt, value.timezone);
      const endedAt = end ? editedTime(end, value.endedAt, value.timezone) : null;
      if (endedAt !== null && endedAt < startedAt)
        throw new Error("終了時刻は開始時刻以降にしてください");
      setError("");
      void save({ ...value, categoryId, startedAt, endedAt, memo, expectedMemo: value.memo });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={exists ? "記録を編集" : `${formatRecordDate(value.businessDay)}に追加`}
      close={close}
    >
      <form onSubmit={submit}>
        <label className="field">
          作業
          <select value={categoryId} required onChange={(e) => setCategoryId(e.target.value)}>
            <option value="" disabled>
              選択してください
            </option>
            {categories
              .filter((c) => !c.archived || c.id === value.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <DateTimeField
          label="開始"
          value={start}
          open={openTime === "start"}
          onOpen={(open) => setOpenTime(open ? "start" : null)}
          onChange={setStart}
          currentTime={currentTime}
        />
        <DateTimeField
          label="終了"
          value={end}
          open={openTime === "end"}
          onOpen={(open) => setOpenTime(open ? "end" : null)}
          onChange={setEnd}
          currentTime={currentTime}
          allowEmpty
        />
        <label className="field">
          メモ
          <textarea
            maxLength={2000}
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
        {(error || errorMessage) && (
          <p role="alert" className="form-error">
            {error || errorMessage}
          </p>
        )}
        <div className="modal-actions">
          {exists && (
            <button
              type="button"
              className="icon-button danger delete-record"
              onClick={remove}
              aria-label="この記録を削除"
            >
              <Trash2 size={19} />
            </button>
          )}
          <button type="button" className="outline-button" onClick={close}>
            キャンセル
          </button>
          <button className="primary-button" disabled={pending}>
            {pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}保存する
          </button>
        </div>
      </form>
    </Modal>
  );
}
