import { cloneDocument, documentFingerprint } from "../../../domain/notes/note-template";
import type { Clock } from "../../ports/clock";
import type { DailyNoteRepository } from "../../ports/daily-note-repository";
import type { IdGenerator } from "../../ports/id-generator";
import type { NoteTemplateRepository } from "../../ports/note-template-repository";

export function createInitializeDailyNote(dependencies: {
  notes: DailyNoteRepository;
  templates: NoteTemplateRepository;
  clock: Clock;
  ids: IdGenerator;
}) {
  const { notes, templates, clock, ids } = dependencies;
  return async function initializeDailyNote(userId: string, day: string) {
    const current = await notes.read(userId, day);
    // An existing or deliberately cleared note must never be repopulated.
    if (current.version) return current;

    const template = await templates.readDefault(userId);
    if (!template) return current;
    const document = cloneDocument(template.document, () => ids.generate());
    const fingerprint = await documentFingerprint(document);
    return notes.insertFromTemplate(
      userId,
      day,
      { markdown: template.markdown, document, template: { id: template.id, fingerprint } },
      ids.generate(),
      clock.now(),
    );
  };
}
