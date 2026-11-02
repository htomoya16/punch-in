import { getDatabase as db } from "./database";
import { api, json, userId, readJson } from "./api";
export { api, json, userId };
import { readDailyNoteDays } from "./daily-note-server";
import type { DailyNoteExport } from "./daily-note";
import { z } from "zod";
import { type AppState, type Backup, type Category, type Preferences, type Session } from "./model";
import { bootstrapQueries } from "./bootstrap";
import { performPunch, sessionFromRow } from "./punch-server";
import { categorySchema, preferenceSchema, sessionSchema } from "./validation";
import { businessDay } from "./time";

import { HttpError } from "./errors";
import { planImport, assertNoOverlap } from "./records";
export async function initialize(user: string) {
  const d = db();
  if (await d.prepare("SELECT 1 FROM preferences WHERE user_id=? AND seeded>=2").bind(user).first()) return;
  await d.batch(bootstrapQueries(user).map(q => d.prepare(q.sql).bind(...q.values)));
}
export async function readState(user: string): Promise<AppState> {
  const d = db();
  const [pr, cr, sr] = await d.batch<Record<string,unknown>>([
    d.prepare("SELECT * FROM preferences WHERE user_id=?").bind(user),
    d.prepare("SELECT id,name,color,hidden,archived,position FROM categories WHERE user_id=? ORDER BY position,id").bind(user),
    d.prepare("SELECT id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,created_at,updated_at FROM sessions WHERE user_id=? ORDER BY started_at DESC,id").bind(user),
  ]);
  const p = pr.results[0] as Record<string,unknown>;
  return {
    preferences: { timezone:String(p.timezone),dayStart:Number(p.day_start),accent:String(p.accent),sidebar:String(p.sidebar),reminderEnabled:!!p.reminder_enabled,reminderMinutes:Number(p.reminder_minutes) },
    categories: cr.results.map(c => ({ ...c, hidden:!!c.hidden,archived:!!c.archived })) as Category[],
    sessions: sr.results.map(sessionFromRow),
    memoRevision:Number(p.memo_revision), revision:Number(p.revision), serverNow:Date.now(),
  };
}
const envelopeSchema = z.object({ action:z.enum(["punch","category","archiveCategory","reorder","preferences","session","deleteSession","importPreview","import"]), payload:z.unknown(), responseMode:z.enum(["state","delta"]).default("state"), pressedAt:z.number().int().nonnegative().optional(), expectedRevision:z.number().int().min(0), mutationId:z.string().uuid() });
function requireCategory(state: AppState, id: string, allowArchived = false) { const c=state.categories.find(c=>c.id===id && (allowArchived || !c.archived)); if(!c) throw new HttpError(400,"作業の種類が見つかりません"); return c; }
export async function action(request: Request, user: string, receivedAt = Date.now()) {
  const raw=await readJson(request,16_000_000);
  const input=envelopeSchema.parse(raw); const d=db();
  if(input.action==="punch") {
    const delta=await performPunch(d,user,input,receivedAt);
    return delta && input.responseMode==="delta" ? {punchDelta:delta} : {state:await readState(user)};
  }
  const state=await readState(user);
  if(input.action==="importPreview") { const p=z.object({backup:z.unknown()}).parse(input.payload); return {preview:planImport(state,p.backup,await readDailyNoteDays(d,user)).preview}; }
  const last=await d.prepare("SELECT mutation_token FROM preferences WHERE user_id=?").bind(user).first<{mutation_token:string}>();
  if(last?.mutation_token===input.mutationId) return {state};
  if(state.revision!==input.expectedRevision) throw new HttpError(409,"別の画面で更新されました。最新の状態を確認して、もう一度操作してください");
  const token=input.mutationId;
  const guard="EXISTS (SELECT 1 FROM preferences WHERE user_id=? AND mutation_token=?)";
  const statements:D1PreparedStatement[]=[d.prepare("UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND revision=?").bind(token,user,input.expectedRevision)];
  function write(sql: string, args: (string|number|null)[]) { statements.push(d.prepare(sql).bind(...args,user,token)); }
  function insert(s: Session) { write(`INSERT INTO sessions (user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`, [user,s.id,s.categoryId,s.startedAt,s.endedAt,s.businessDay,s.dayStart,s.timezone,s.memo,s.createdAt,s.updatedAt]); }
  function savePrefs(p:Preferences) { write(`UPDATE preferences SET timezone=?,day_start=?,accent=?,sidebar=?,reminder_enabled=?,reminder_minutes=? WHERE user_id=? AND ${guard}`,[p.timezone,p.dayStart,p.accent,p.sidebar,+p.reminderEnabled,p.reminderMinutes,user]); }
  const now=Date.now();
  if(input.action==="category") {
    const c=categorySchema.parse(input.payload);
    if(!state.categories.some(x=>x.id===c.id) && state.categories.length>=500) throw new HttpError(400,"作業の種類は500件までです");
    if(c.archived) throw new HttpError(400,"削除操作を使用してください");
    write(`INSERT INTO categories (user_id,id,name,color,hidden,archived,position) SELECT ?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,color=excluded.color,hidden=excluded.hidden,position=excluded.position`,[user,c.id,c.name,c.color,+c.hidden,0,c.position]);
  } else if(input.action==="archiveCategory") {
    const {id}=z.object({id:z.string()}).parse(input.payload);requireCategory(state,id);
    if(state.sessions.some(s=>s.categoryId===id&&s.endedAt===null)) throw new HttpError(400,"計測を終了してから削除してください");
    write(`UPDATE categories SET archived=1 WHERE user_id=? AND id=? AND ${guard}`,[user,id]);
  } else if(input.action==="reorder") {
    const {ids}=z.object({ids:z.array(z.string()).max(500)}).parse(input.payload);
    const active=state.categories.filter(c=>!c.archived);
    if(new Set(ids).size!==ids.length || ids.length!==active.length || active.some(c=>!ids.includes(c.id))) throw new HttpError(400,"並び順を確認してください");
    write(`UPDATE categories SET position=(SELECT key FROM json_each(?) WHERE value=categories.id) WHERE user_id=? AND archived=0 AND ${guard}`,[JSON.stringify(ids),user]);
  } else if(input.action==="preferences") { savePrefs(preferenceSchema.parse(input.payload));
  } else if(input.action==="session") {
    const p=z.object({id:z.string(),categoryId:z.string(),startedAt:z.number().int(),endedAt:z.number().int().nullable(),memo:z.string().max(2000),expectedMemo:z.string().max(2000).optional()}).parse(input.payload);
    requireCategory(state,p.categoryId,true); const old=state.sessions.find(s=>s.id===p.id);
    if(old){
      if(p.expectedMemo!==undefined&&old.memo!==p.expectedMemo&&old.memo!==p.memo)throw new HttpError(409,"メモが別の画面で更新されました。編集を開き直してください");
      statements[0]=d.prepare("UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND revision=? AND EXISTS (SELECT 1 FROM sessions WHERE user_id=? AND id=? AND memo=?)").bind(token,user,input.expectedRevision,user,old.id,old.memo);
    }
    const dayStart=old?.dayStart??state.preferences.dayStart, timezone=old?.timezone??state.preferences.timezone;
    const s=sessionSchema.parse({...p,dayStart,timezone,businessDay:businessDay(p.startedAt,dayStart,timezone),createdAt:old?.createdAt??now,updatedAt:now});
    if(s.startedAt>now+1000 || (s.endedAt!==null&&s.endedAt>now+1000)) throw new HttpError(400,"未来の打刻は登録できません");
    assertNoOverlap([...state.sessions.filter(x=>x.id!==s.id),s]);
    if(old) write(`UPDATE sessions SET category_id=?,started_at=?,ended_at=?,business_day=?,memo=?,updated_at=? WHERE user_id=? AND id=? AND ${guard}`,[s.categoryId,s.startedAt,s.endedAt,s.businessDay,s.memo,now,user,s.id]);
    else insert(s);
  } else if(input.action==="deleteSession") {
    const {id}=z.object({id:z.string()}).parse(input.payload);
    if(!state.sessions.some(s=>s.id===id)) throw new HttpError(404,"記録が見つかりません");
    write(`DELETE FROM sessions WHERE user_id=? AND id=? AND ${guard}`,[user,id]);
  } else if(input.action==="import") {
    const p=z.object({backup:z.unknown(),includePreferences:z.boolean()}).parse(input.payload); const plan=planImport(state,p.backup,await readDailyNoteDays(d,user));
    if(plan.categories.length) write(`INSERT INTO categories (user_id,id,name,color,hidden,archived,position) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.color'),json_extract(value,'$.hidden'),json_extract(value,'$.archived'),json_extract(value,'$.position') FROM json_each(?) WHERE ${guard}`,[user,JSON.stringify(plan.categories)]);
    if(plan.sessions.length) write(`INSERT INTO sessions (user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,created_at,updated_at) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.categoryId'),json_extract(value,'$.startedAt'),json_extract(value,'$.endedAt'),json_extract(value,'$.businessDay'),json_extract(value,'$.dayStart'),json_extract(value,'$.timezone'),json_extract(value,'$.memo'),json_extract(value,'$.createdAt'),json_extract(value,'$.updatedAt') FROM json_each(?) WHERE ${guard}`,[user,JSON.stringify(plan.sessions)]);
    if(plan.dailyNotes.length) write(`INSERT INTO daily_notes (user_id,day,markdown,version,mutation_id,updated_at) SELECT ?,json_extract(value,'$.day'),json_extract(value,'$.markdown'),1,?,json_extract(value,'$.updatedAt') FROM json_each(?) WHERE ${guard} ON CONFLICT(user_id,day) DO NOTHING`,[user,token,JSON.stringify(plan.dailyNotes)]);
    if(p.includePreferences) savePrefs(plan.backup.preferences);
  }
  const result=await d.batch(statements);
  if(!result[0].meta.changes) throw new HttpError(409,"別の画面で更新されました。もう一度操作してください");
  return {state:await readState(user)};
}
export function makeBackup(state: AppState, dailyNotes: DailyNoteExport[]=[]): Backup { return {format:"punch-in",version:2,exportedAt:new Date().toISOString(),preferences:state.preferences,categories:state.categories,sessions:state.sessions,dailyNotes}; }
export async function stateResponse(user:string, revision?:number,memoRevision=0) {
  const current=await db().prepare("SELECT revision,seeded,memo_revision FROM preferences WHERE user_id=?").bind(user).first<{revision:number;seeded:number;memo_revision:number}>();
  if(!current || current.seeded<2) await initialize(user);
  else if(revision===current.revision&&memoRevision===current.memo_revision) return new Response(null,{status:304,headers:{"Cache-Control":"no-store","X-Server-Now":String(Date.now())}});
  return json(await readState(user));
}
