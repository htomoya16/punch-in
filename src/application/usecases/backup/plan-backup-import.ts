import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import type { AppState } from "../../contracts/app-state";
import type { BackupImportPlan } from "../../contracts/backup-import";
import { ApplicationError } from "../../errors/application-error";
import { backupSchema } from "../../validation/backup-schema";

export function assertNoOverlap(all: TrackingSession[]) {
  const ordered = [...all].sort((a, b) => a.startedAt - b.startedAt);
  let end = -1;
  for (const s of ordered) {
    // Zero-duration clicks have no occupied interval.
    if (s.endedAt === s.startedAt) continue;
    if (s.startedAt < end)
      throw new ApplicationError("invalid_input", "ほかの記録と時間が重なっています");
    end = s.endedAt ?? Infinity;
  }
}

export function planImport(
  state: AppState,
  raw: unknown,
  existingNoteDays: ReadonlySet<string> = new Set(),
  existingTemplateIds: ReadonlySet<string> = new Set(),
  now = Date.now(),
): BackupImportPlan {
  const backup = backupSchema.parse(raw);
  const categories = backup.categories.filter((c) => !state.categories.some((x) => x.id === c.id));
  const sessions = backup.sessions.filter((s) => !state.sessions.some((x) => x.id === s.id));
  if (
    sessions.some((s) => s.startedAt > now + 1000 || (s.endedAt !== null && s.endedAt > now + 1000))
  )
    throw new ApplicationError("invalid_input", "未来の打刻は取り込めません");
  assertNoOverlap([...state.sessions, ...sessions]);
  const notes = backup.version !== 1 ? backup.dailyNotes : [];
  const dailyNotes = notes.filter((n) => !existingNoteDays.has(n.day));
  const templates =
    backup.version === 4 ? backup.templates.filter((t) => !existingTemplateIds.has(t.id)) : [];
  return {
    backup,
    categories,
    sessions,
    dailyNotes,
    templates,
    preview: {
      dailyNotes: dailyNotes.length,
      skippedDailyNotes: notes.length - dailyNotes.length,
      categories: categories.length,
      sessions: sessions.length,
      skippedCategories: backup.categories.length - categories.length,
      skippedSessions: backup.sessions.length - sessions.length,
      running: sessions.some((s) => s.endedAt === null),
    },
  };
}
