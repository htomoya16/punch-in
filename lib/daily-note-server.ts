import { HttpError } from "./errors";
import { emptyDailyNote, type DailyNote, type DailyNoteExport, type NoteWrite } from "./daily-note";
type NoteRow = { day: string; markdown: string; version: number; updated_at: number; mutation_id: string };
function noteFromRow(row: NoteRow): DailyNote { return { day: row.day, markdown: row.markdown, version: row.version, updatedAt: row.updated_at }; }

export async function readDailyNote(db: D1Database, user: string, day: string): Promise<DailyNote> {
  const row = await db.prepare("SELECT day,markdown,version,updated_at FROM daily_notes WHERE user_id=? AND day=?").bind(user, day).first<NoteRow>();
  return row ? noteFromRow(row) : emptyDailyNote(day);
}
export async function writeDailyNote(db: D1Database, user: string, input: NoteWrite): Promise<DailyNote> {
  const updatedAt = Date.now();
  const saved = input.expectedVersion === 0
    ? await db.prepare("INSERT INTO daily_notes (user_id,day,markdown,version,mutation_id,updated_at) VALUES (?,?,?,1,?,?) ON CONFLICT(user_id,day) DO NOTHING RETURNING day,markdown,version,updated_at").bind(user, input.day, input.markdown, input.mutationId, updatedAt).first<NoteRow>()
    : await db.prepare("UPDATE daily_notes SET markdown=?,version=version+1,mutation_id=?,updated_at=? WHERE user_id=? AND day=? AND version=? AND mutation_id<>? RETURNING day,markdown,version,updated_at").bind(input.markdown, input.mutationId, updatedAt, user, input.day, input.expectedVersion, input.mutationId).first<NoteRow>();
  if (saved) return noteFromRow(saved);
  const current = await db.prepare("SELECT day,markdown,version,updated_at,mutation_id FROM daily_notes WHERE user_id=? AND day=?").bind(user, input.day).first<NoteRow>();
  if (current?.mutation_id === input.mutationId && current.markdown === input.markdown) return noteFromRow(current);
  throw new HttpError(409, "別の画面でメモが更新されています", { current: current ? noteFromRow(current) : emptyDailyNote(input.day) });
}
export async function readAllDailyNotes(db: D1Database, user: string): Promise<DailyNoteExport[]> {
  const rows = await db.prepare("SELECT day,markdown,updated_at FROM daily_notes WHERE user_id=? ORDER BY day").bind(user).all<NoteRow>();
  return rows.results.map(r => ({ day: r.day, markdown: r.markdown, updatedAt: r.updated_at }));
}
export async function readDailyNoteDays(db: D1Database, user: string): Promise<Set<string>> {
  const rows = await db.prepare("SELECT day FROM daily_notes WHERE user_id=?").bind(user).all<{ day: string }>();
  return new Set(rows.results.map(r => r.day));
}
