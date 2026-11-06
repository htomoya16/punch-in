import type { DailyNoteExport } from "../../../domain/notes/daily-note";
import type { AppState } from "../../contracts/app-state";
import type { Backup } from "../../contracts/backup";
import type { TemplateCollection } from "../../ports/note-template-repository";

export function makeBackup(
  state: AppState,
  dailyNotes: DailyNoteExport[] = [],
  templates: TemplateCollection = {
    templates: [],
    defaultId: null,
    version: 0,
  },
): Backup {
  return {
    format: "punch-in",
    version: 4,
    templates: templates.templates.map(({ version: _, ...t }) => t),
    defaultTemplateId: templates.defaultId,
    exportedAt: new Date().toISOString(),
    preferences: state.preferences,
    categories: state.categories,
    sessions: state.sessions,
    dailyNotes,
  };
}
