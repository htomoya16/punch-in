import type { NoteDocument } from "./note-document";
export const MAX_NOTE_LENGTH = 100_000;
export type DailyNote = {
  day: string;
  markdown: string;
  version: number;
  updatedAt: number;
  document?: NoteDocument;
  originalMarkdown?: string;
  template?: import("./note-templates").AppliedTemplate;
};
export type DailyNoteExport = Pick<
  DailyNote,
  "day" | "markdown" | "updatedAt" | "document" | "originalMarkdown" | "template"
>;
export type NoteWrite = {
  day: string;
  markdown: string;
  expectedVersion: number;
  mutationId: string;
  document?: NoteDocument;
  template?: import("./note-templates").AppliedTemplate;
};
export type NoteTarget = { day: string; open: boolean; reveal?: number };
export function emptyDailyNote(day: string): DailyNote {
  return { day, markdown: "", version: 0, updatedAt: 0 };
}
