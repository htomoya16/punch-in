import { WorkCategory } from "../../domain/categories/work-category";
import { UserPreferences } from "../../domain/settings/user-preferences";
import { TrackingSession } from "../../domain/tracking/tracking-session";

export type BackupBase = {
  format: "punch-in";
  exportedAt: string;
  preferences: UserPreferences;
  categories: WorkCategory[];
  sessions: TrackingSession[];
};

export type Backup = BackupBase &
  (
    | {
        version: 1;
      }
    | {
        version: 2 | 3;
        dailyNotes: import("../../domain/notes/daily-note").DailyNoteExport[];
      }
    | {
        version: 4;
        dailyNotes: import("../../domain/notes/daily-note").DailyNoteExport[];
        templates: Omit<import("../../domain/notes/note-template").NoteTemplate, "version">[];
        defaultTemplateId: string | null;
      }
  );
