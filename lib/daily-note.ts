export const MAX_NOTE_LENGTH = 100_000;
export type DailyNote = { day: string; markdown: string; version: number; updatedAt: number };
export type DailyNoteExport = Pick<DailyNote, "day" | "markdown" | "updatedAt">;
export type NoteWrite = { day: string; markdown: string; expectedVersion: number; mutationId: string };
export type NoteMode = "edit" | "preview";
export type NoteTarget = { day: string; mode: NoteMode; open: boolean };
export function emptyDailyNote(day: string): DailyNote { return { day, markdown: "", version: 0, updatedAt: 0 }; }
