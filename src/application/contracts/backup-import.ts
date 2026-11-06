import type { WorkCategory } from "../../domain/categories/work-category";
import type { DailyNoteExport } from "../../domain/notes/daily-note";
import type { NoteTemplate } from "../../domain/notes/note-template";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import type { Backup } from "./backup";
import type { BackupImportPreview } from "./client-action";

export type BackupImportPlan = {
  backup: Backup;
  categories: WorkCategory[];
  sessions: TrackingSession[];
  dailyNotes: DailyNoteExport[];
  templates: Omit<NoteTemplate, "version">[];
  preview: BackupImportPreview;
};
