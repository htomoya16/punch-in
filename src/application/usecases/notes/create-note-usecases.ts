import { sessionMemoSchema } from "../../contracts/work-entry-memo";
import { ApplicationError } from "../../errors/application-error";
import type { Clock } from "../../ports/clock";
import type { DailyNoteRepository } from "../../ports/daily-note-repository";
import type { IdGenerator } from "../../ports/id-generator";
import type { NoteTemplateRepository } from "../../ports/note-template-repository";
import type { WorkEntryMemoRepository } from "../../ports/work-entry-memo-repository";
import { noteDaySchema, noteWriteSchema } from "../../validation/daily-note-schema";
import { templateMutation } from "../../validation/note-template-schema";
import { createInitializeDailyNote } from "./initialize-daily-note";

export function createNoteUseCases(dependencies: {
  notes: DailyNoteRepository;
  templates: NoteTemplateRepository;
  memos: WorkEntryMemoRepository;
  clock: Clock;
  ids: IdGenerator;
}) {
  const { notes, templates, memos } = dependencies;
  return {
    readDailyNote: (userId: string, day: unknown) => notes.read(userId, noteDaySchema.parse(day)),
    saveDailyNote: (userId: string, input: unknown) =>
      notes.save(userId, noteWriteSchema.parse(input)),
    initializeDailyNote: (userId: string, day: unknown) =>
      createInitializeDailyNote(dependencies)(userId, noteDaySchema.parse(day)),
    readDailyNoteIndex: (userId: string) => notes.readIndex(userId),
    readTemplates: (userId: string) => templates.read(userId),
    async updateTemplate(userId: string, input: unknown) {
      const mutation = templateMutation.parse(input);
      if (
        mutation.action === "save" &&
        mutation.expectedVersion === 0 &&
        (await templates.count(userId)) >= 100
      ) {
        throw new ApplicationError("invalid_input", "テンプレートは100件までです");
      }
      return templates.mutate(userId, mutation);
    },
    saveWorkEntryMemo: (userId: string, input: unknown) =>
      memos.save(userId, sessionMemoSchema.parse(input)),
  };
}
