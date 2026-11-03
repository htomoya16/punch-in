import type {NoteDocument} from "./note-document";
export const MAX_NOTE_LENGTH = 100_000;
export type DailyNote = { day: string; markdown: string; version: number; updatedAt: number; document?: NoteDocument; originalMarkdown?: string };
export type DailyNoteExport = Pick<DailyNote, "day" | "markdown" | "updatedAt" | "document" | "originalMarkdown">;
export type NoteWrite = { day: string; markdown: string; expectedVersion: number; mutationId: string; document?: NoteDocument };
export type NoteTarget = { day: string; open: boolean; reveal?:number };
export function emptyDailyNote(day: string): DailyNote { return { day, markdown: "", version: 0, updatedAt: 0 }; }
