"use client";

import { useState } from "react";
import type { WorkCategory } from "../../../domain/categories/work-category";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { getWorkEntries, getWorkEntryId } from "../../../domain/tracking/work-entry";
import { getWorkEntryTimeRange } from "../../../domain/tracking/work-entry-intervals";
import { formatClockTime, formatRecordDate } from "../../../shared/time/date-time-format";

export default function DeleteRecord({
  session,
  categoryId,
  categories,
  pending,
  remove,
  close,
}: {
  session: TrackingSession;
  categoryId?: string;
  categories: WorkCategory[];
  pending: boolean;
  remove(id?: string): Promise<boolean>;
  close(): void;
}) {
  const [target, setTarget] = useState<string | null>(categoryId ?? null);
  const [busy, setBusy] = useState(false);
  const items = getWorkEntries(session);
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? "削除済み";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          if (await remove(target ?? undefined)) close();
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="confirm-text">
        {formatRecordDate(session.businessDay)}{" "}
        {formatClockTime(session.startedAt, session.timezone)}
      </p>
      {items.length > 1 ? (
        <fieldset className="delete-targets">
          <legend className="sr-only">削除する記録</legend>
          <label>
            <input
              type="radio"
              name="delete-target"
              checked={target === null}
              onChange={() => setTarget(null)}
            />
            記録全体
          </label>
          {items.map((m) => (
            <label key={getWorkEntryId(m)}>
              <input
                type="radio"
                name="delete-target"
                checked={target === getWorkEntryId(m)}
                onChange={() => setTarget(getWorkEntryId(m))}
              />
              {name(m.categoryId)}
              {items.some((other) => other !== m && other.categoryId === m.categoryId) && (
                <small>
                  （
                  {getWorkEntryTimeRange(session, getWorkEntryId(m)).start === null
                    ? "—"
                    : formatClockTime(
                        getWorkEntryTimeRange(session, getWorkEntryId(m)).start!,
                        session.timezone,
                      )}
                  〜）
                </small>
              )}
              だけ
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="confirm-text">「{name(items[0].categoryId)}」の記録を削除します。</p>
      )}
      <div className="modal-actions">
        <button type="button" className="outline-button" disabled={busy} onClick={close}>
          キャンセル
        </button>
        <button className="danger-button" disabled={pending || busy}>
          削除する
        </button>
      </div>
    </form>
  );
}
