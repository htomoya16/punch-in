import { makeBackup } from "../application/usecases/backup/export-backup";
import { createNoteUseCases } from "../application/usecases/notes/create-note-usecases";
import { createExecuteAppAction } from "../application/usecases/state/execute-app-action";
import { D1AppStateRepository } from "../infrastructure/persistence/d1/d1-app-state-repository";
import { D1DailyNoteRepository } from "../infrastructure/persistence/d1/daily-note-repository";
import { getDatabase } from "../infrastructure/persistence/d1/database";
import { D1NoteTemplateRepository } from "../infrastructure/persistence/d1/note-template-repository";
import { D1WorkEntryMemoRepository } from "../infrastructure/persistence/d1/work-entry-memo-repository";
import { systemClock } from "../infrastructure/runtime/system-clock";
import { uuidGenerator } from "../infrastructure/runtime/uuid-generator";
import { createTrackingUseCases } from "./tracking-usecases";

/** Only this composition boundary selects Cloudflare and Sites-specific implementations. */
export function createServerUseCases() {
  const database = getDatabase();
  const state = new D1AppStateRepository(database);
  const notes = new D1DailyNoteRepository(database);
  const templates = new D1NoteTemplateRepository(database);
  const memos = new D1WorkEntryMemoRepository(database);
  const tracking = createTrackingUseCases(database);

  return {
    initializeUser: (userId: string) => state.initialize(userId),
    readState: (userId: string) => state.read(userId),
    readRevision: (userId: string) => state.readRevision(userId),
    executeAction: createExecuteAppAction({
      state,
      notes,
      templates,
      clock: systemClock,
      ...tracking,
    }),
    ...createNoteUseCases({ notes, templates, memos, clock: systemClock, ids: uuidGenerator }),
    async exportBackup(userId: string) {
      const [snapshot, dailyNotes, noteTemplates] = await Promise.all([
        state.read(userId),
        notes.exportAll(userId),
        templates.read(userId),
      ]);
      return makeBackup(snapshot, dailyNotes, noteTemplates);
    },
  };
}
