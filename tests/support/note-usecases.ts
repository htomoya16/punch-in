import { createInitializeDailyNote } from "../../src/application/usecases/notes/initialize-daily-note";
import { D1DailyNoteRepository } from "../../src/infrastructure/persistence/d1/daily-note-repository";
import { D1NoteTemplateRepository } from "../../src/infrastructure/persistence/d1/note-template-repository";
import { systemClock } from "../../src/infrastructure/runtime/system-clock";
import { uuidGenerator } from "../../src/infrastructure/runtime/uuid-generator";
export function initializeDailyNote(database: D1Database, userId: string, day: string) {
  return createInitializeDailyNote({
    notes: new D1DailyNoteRepository(database),
    templates: new D1NoteTemplateRepository(database),
    clock: systemClock,
    ids: uuidGenerator,
  })(userId, day);
}
