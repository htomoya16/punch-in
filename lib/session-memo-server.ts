import { z } from "zod";
import { HttpError } from "./errors";
export const sessionMemoSchema = z.object({id:z.string().min(1).max(100),memo:z.string().max(2000),expectedMemo:z.string().max(2000)});
export type MemoWrite = z.infer<typeof sessionMemoSchema>;
export async function writeSessionMemo(db:D1Database,user:string,input:MemoWrite) {
  const results=await db.batch<Record<string,unknown>>([
    db.prepare("UPDATE sessions SET memo=? WHERE user_id=? AND id=? AND memo=? AND memo<>? RETURNING id,memo").bind(input.memo,user,input.id,input.expectedMemo,input.memo),
    db.prepare("UPDATE preferences SET memo_revision=memo_revision+1 WHERE user_id=? AND changes()>0").bind(user),
    db.prepare("SELECT memo_revision FROM preferences WHERE user_id=?").bind(user),
  ]);
  if(results[0].results[0])return {id:input.id,memo:input.memo,memoRevision:Number(results[2].results[0].memo_revision)};
  const current=await db.prepare("SELECT s.id,s.memo,p.memo_revision AS memoRevision FROM sessions s JOIN preferences p ON p.user_id=s.user_id WHERE s.user_id=? AND s.id=?").bind(user,input.id).first<{id:string;memo:string;memoRevision:number}>();
  if(!current)throw new HttpError(404,"記録が見つかりません。入力内容は下書きに残っています");
  if(current.memo===input.memo)return current;
  throw new HttpError(409,"別の画面でメモが更新されています",{currentMemo:current.memo});
}
