"use client";
import { useState } from "react";
import type { Category, Session } from "../../../lib/model";
import { memberKey, memberRange, members } from "../../../lib/work";
import { clock, readableDate } from "../../../lib/time";
export default function DeleteRecord({
  session,
  categoryId,
  categories,
  pending,
  remove,
  close,
}: {
  session: Session;
  categoryId?: string;
  categories: Category[];
  pending: boolean;
  remove(id?: string): Promise<boolean>;
  close(): void;
}) {
  const [target, setTarget] = useState<string | null>(categoryId ?? null),
    [busy, setBusy] = useState(false);
  const items = members(session),
    name = (id: string) => categories.find((c) => c.id === id)?.name ?? "削除済み";
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
        {readableDate(session.businessDay)} {clock(session.startedAt, session.timezone)}
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
            <label key={memberKey(m)}>
              <input
                type="radio"
                name="delete-target"
                checked={target === memberKey(m)}
                onChange={() => setTarget(memberKey(m))}
              />
              {name(m.categoryId)}
              {items.some((other) => other !== m && other.categoryId === m.categoryId) && (
                <small>
                  （
                  {memberRange(session, memberKey(m)).start === null
                    ? "—"
                    : clock(memberRange(session, memberKey(m)).start!, session.timezone)}
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
