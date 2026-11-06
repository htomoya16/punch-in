import type { DailyNote, DailyNoteExport, NoteWrite } from "../../domain/notes/daily-note";

export interface DailyNoteRepository {
  read(userId: string, day: string): Promise<DailyNote>;
  save(userId: string, input: NoteWrite): Promise<DailyNote>;
  exportAll(userId: string): Promise<DailyNoteExport[]>;
  readDays(userId: string): Promise<Set<string>>;
  readIndex(userId: string): Promise<string[]>;
  /** Insert only if absent, returning the winning note if another request created it. */
  insertFromTemplate(
    userId: string,
    day: string,
    seed: Pick<DailyNote, "markdown" | "document" | "template">,
    mutationId: string,
    now: number,
  ): Promise<DailyNote>;
}
