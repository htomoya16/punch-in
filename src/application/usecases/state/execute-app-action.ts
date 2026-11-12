import { z } from "zod";
import type { AppActionInput } from "../../contracts/app-action";
import { ApplicationError } from "../../errors/application-error";
import type { AppMutation, AppStateRepository } from "../../ports/app-state-repository";
import type { Clock } from "../../ports/clock";
import type { DailyNoteRepository } from "../../ports/daily-note-repository";
import type { NoteTemplateRepository } from "../../ports/note-template-repository";
import { preferenceSchema } from "../../validation/backup-schema";
import { planImport } from "../backup/plan-backup-import";
import { planCategoryChange } from "../categories/plan-category-change";
import { planRecordChange } from "../records/plan-record-change";
import type { createPunchWorkCategory } from "../tracking/punch-work-category";
import type { createUpdateTrackingSession } from "../tracking/update-tracking-session";

type Dependencies = {
  state: AppStateRepository;
  notes: DailyNoteRepository;
  templates: NoteTemplateRepository;
  clock: Clock;
  punch: ReturnType<typeof createPunchWorkCategory>;
  update: ReturnType<typeof createUpdateTrackingSession>;
};

export function createExecuteAppAction(dependencies: Dependencies) {
  const { state: repository, notes, templates, clock } = dependencies;
  return async function executeAppAction(
    userId: string,
    input: AppActionInput,
    receivedAt: number,
  ) {
    if (input.action === "punch" || input.action === "work") {
      const operation = input.action === "punch" ? dependencies.punch : dependencies.update;
      const delta = await operation(userId, input, receivedAt);
      return delta &&
        (input.payload as { control?: string } | undefined)?.control !== "edit" &&
        (input.action === "work" || input.responseMode === "delta")
        ? { punchDelta: delta }
        : { state: await repository.read(userId) };
    }

    const state = await repository.read(userId);
    if (input.action === "importPreview") {
      const { backup } = z.object({ backup: z.unknown() }).parse(input.payload);
      return {
        preview: planImport(
          state,
          backup,
          await notes.readDays(userId),
          new Set((await templates.read(userId)).templates.map((template) => template.id)),
          clock.now(),
        ).preview,
      };
    }

    const revision = await repository.readRevision(userId);
    if (revision?.mutationId === input.mutationId) return { state };
    if (state.revision !== input.expectedRevision)
      throw new ApplicationError(
        "conflict",
        "別の画面で更新されました。最新の状態を確認して、もう一度操作してください",
      );

    let mutation: AppMutation;
    if (
      input.action === "category" ||
      input.action === "archiveCategory" ||
      input.action === "reorder"
    ) {
      mutation = planCategoryChange(state, input.action, input.payload);
    } else if (input.action === "session" || input.action === "deleteSession") {
      mutation = planRecordChange(state, input.action, input.payload, clock.now());
    } else if (input.action === "preferences") {
      mutation = { kind: "preferences", preferences: preferenceSchema.parse(input.payload) };
    } else {
      const payload = z
        .object({ backup: z.unknown(), includePreferences: z.boolean() })
        .parse(input.payload);
      mutation = {
        kind: "import",
        plan: planImport(
          state,
          payload.backup,
          await notes.readDays(userId),
          new Set((await templates.read(userId)).templates.map((template) => template.id)),
          clock.now(),
        ),
        includePreferences: payload.includePreferences,
      };
    }

    if (!(await repository.commit(userId, input, mutation)))
      throw new ApplicationError("conflict", "別の画面で更新されました。もう一度操作してください");
    return { state: await repository.read(userId) };
  };
}
