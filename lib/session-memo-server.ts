import { z } from "zod";
import { HttpError } from "./errors";
export const sessionMemoSchema = z.object({
  id: z.string().min(1).max(100),
  memo: z.string().max(2000),
  expectedMemo: z.string().max(2000),
  categoryId: z.string().min(1).max(100).optional(),
  memberId: z.string().min(1).max(100).optional(),
});
export type MemoWrite = z.infer<typeof sessionMemoSchema>;
export async function writeSessionMemo(db: D1Database, user: string, input: MemoWrite) {
  if (input.categoryId) {
    const key = input.memberId ?? input.categoryId,
      selector = "COALESCE(json_extract(value,'$.id'),json_extract(value,'$.categoryId'))=?";
    const result = await db.batch<Record<string, unknown>>([
      db
        .prepare(
          `UPDATE sessions SET work=json_set(work,'$.members['||(SELECT key FROM json_each(sessions.work,'$.members') WHERE ${selector})||'].memo',?),memo=CASE WHEN COALESCE(json_extract(work,'$.members[0].id'),category_id)=? THEN ? ELSE memo END WHERE user_id=? AND id=? AND EXISTS(SELECT 1 FROM json_each(sessions.work,'$.members') WHERE ${selector} AND json_extract(value,'$.categoryId')=? AND json_extract(value,'$.memo')=?) AND EXISTS(SELECT 1 FROM json_each(sessions.work,'$.members') WHERE ${selector} AND json_extract(value,'$.memo')<>?) RETURNING id`,
        )
        .bind(
          key,
          input.memo,
          key,
          input.memo,
          user,
          input.id,
          key,
          input.categoryId,
          input.expectedMemo,
          key,
          input.memo,
        ),
      db
        .prepare(
          "UPDATE preferences SET memo_revision=memo_revision+1 WHERE user_id=? AND changes()>0",
        )
        .bind(user),
      db
        .prepare(
          "SELECT json_extract(j.value,'$.memo') AS memo,p.memo_revision AS revision FROM sessions s JOIN preferences p ON s.user_id=p.user_id JOIN json_each(s.work,'$.members') j WHERE s.user_id=? AND s.id=? AND COALESCE(json_extract(j.value,'$.id'),json_extract(j.value,'$.categoryId'))=? AND json_extract(j.value,'$.categoryId')=?",
        )
        .bind(user, input.id, key, input.categoryId),
    ]);
    const current = result[2].results[0];
    if (!current) throw new HttpError(404, "作業が見つかりません。入力内容は下書きに残っています");
    if (current.memo !== input.memo)
      throw new HttpError(409, "別の画面でメモが更新されています", { currentMemo: current.memo });
    return { id: input.id, memo: input.memo, memoRevision: Number(current.revision) };
  }
  const results = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "UPDATE sessions SET memo=? WHERE user_id=? AND id=? AND memo=? AND memo<>? AND work IS NULL RETURNING id,memo",
      )
      .bind(input.memo, user, input.id, input.expectedMemo, input.memo),
    db
      .prepare(
        "UPDATE preferences SET memo_revision=memo_revision+1 WHERE user_id=? AND changes()>0",
      )
      .bind(user),
    db.prepare("SELECT memo_revision FROM preferences WHERE user_id=?").bind(user),
  ]);
  if (results[0].results[0])
    return {
      id: input.id,
      memo: input.memo,
      memoRevision: Number(results[2].results[0].memo_revision),
    };
  const current = await db
    .prepare(
      "SELECT s.id,s.memo,s.work,p.memo_revision AS memoRevision FROM sessions s JOIN preferences p ON p.user_id=s.user_id WHERE s.user_id=? AND s.id=?",
    )
    .bind(user, input.id)
    .first<{ id: string; memo: string; work?: string; memoRevision: number }>();
  if (!current) throw new HttpError(404, "記録が見つかりません。入力内容は下書きに残っています");
  if (current.work)
    throw new HttpError(409, "画面を再読み込みして作業ごとのメモを編集してください");
  if (current.memo === input.memo) return current;
  throw new HttpError(409, "別の画面でメモが更新されています", { currentMemo: current.memo });
}
