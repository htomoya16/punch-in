import type { AppState, Session } from "./model";
import { backupSchema } from "./validation";
import { HttpError } from "./errors";

export function assertNoOverlap(all: Session[]) {
  const ordered = [...all].sort((a,b)=>a.startedAt-b.startedAt);
  let end = -1;
  for(const s of ordered) {
    // Zero-duration clicks have no occupied interval.
    if(s.endedAt === s.startedAt) continue;
    if(s.startedAt < end) throw new HttpError(400,"ほかの記録と時間が重なっています");
    end = s.endedAt ?? Infinity;
  }
}
export function planImport(state: AppState, raw: unknown, existingNoteDays: ReadonlySet<string> = new Set()) {
  const backup = backupSchema.parse(raw);
  const categories = backup.categories.filter(c=>!state.categories.some(x=>x.id===c.id));
  const sessions = backup.sessions.filter(s=>!state.sessions.some(x=>x.id===s.id));
  if(sessions.some(s=>s.startedAt > Date.now()+1000 || (s.endedAt!==null && s.endedAt>Date.now()+1000))) throw new HttpError(400,"未来の打刻は取り込めません");
  assertNoOverlap([...state.sessions,...sessions]);
  const notes = backup.version===2 ? backup.dailyNotes : [];
  const dailyNotes = notes.filter(n=>!existingNoteDays.has(n.day));
  return { backup, categories, sessions, dailyNotes, preview:{dailyNotes:dailyNotes.length,skippedDailyNotes:notes.length-dailyNotes.length,categories:categories.length,sessions:sessions.length,skippedCategories:backup.categories.length-categories.length,skippedSessions:backup.sessions.length-sessions.length,running:sessions.some(s=>s.endedAt===null)} };
}
