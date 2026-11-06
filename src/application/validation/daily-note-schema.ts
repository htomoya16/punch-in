import { z } from "zod";
import { MAX_NOTE_LENGTH } from "../../domain/notes/daily-note";
import { isNoteDocument, type NoteDocument } from "../../domain/notes/note-document";

export const noteDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付を確認してください")
  .refine((day) => {
    const date = new Date(`${day}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
  }, "日付を確認してください");
export const noteMarkdownSchema = z
  .string()
  .max(MAX_NOTE_LENGTH, "メモは10万文字以内にしてください");
export const noteDocumentSchema = z.custom<NoteDocument>(
  isNoteDocument,
  "メモの構造を確認してください",
);
export const legacyNoteExportSchema = z.object({
  day: noteDaySchema,
  markdown: noteMarkdownSchema,
  updatedAt: z.number().int().min(0).max(253402300799000),
});
export const appliedTemplateSchema = z.object({
  id: z.string().uuid(),
  fingerprint: z.string().regex(/^(?:[a-f0-9]{64})?$/),
});
export const noteExportSchema = legacyNoteExportSchema.extend({
  document: noteDocumentSchema.optional(),
  originalMarkdown: noteMarkdownSchema.optional(),
  template: appliedTemplateSchema.optional(),
});
export const noteWriteSchema = z.object({
  day: noteDaySchema,
  markdown: noteMarkdownSchema,
  expectedVersion: z.number().int().nonnegative(),
  mutationId: z.string().uuid(),
  document: noteDocumentSchema.optional(),
  template: appliedTemplateSchema.optional(),
});
