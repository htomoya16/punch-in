import { z } from "zod";
import { resolveBusinessDay } from "../../../shared/time/calendar";
import type { AppState } from "../../contracts/app-state";
import { ApplicationError } from "../../errors/application-error";
import type { AppMutation } from "../../ports/app-state-repository";
import { sessionSchema } from "../../validation/backup-schema";
import { assertNoOverlap } from "../backup/plan-backup-import";
import { requireCategory } from "../categories/plan-category-change";

export function planRecordChange(
  state: AppState,
  action: "session" | "deleteSession",
  payload: unknown,
  now: number,
): AppMutation {
  if (action === "deleteSession") {
    const { id } = z.object({ id: z.string() }).parse(payload);
    if (!state.sessions.some((session) => session.id === id))
      throw new ApplicationError("not_found", "記録が見つかりません");
    return { kind: "deleteSession", id };
  }
  const p = z
    .object({
      id: z.string(),
      categoryId: z.string(),
      startedAt: z.number().int(),
      endedAt: z.number().int().nullable(),
      memo: z.string().max(2000),
      expectedMemo: z.string().max(2000).optional(),
    })
    .parse(payload);
  requireCategory(state, p.categoryId, true);
  const old = state.sessions.find((s) => s.id === p.id);
  if (old?.work)
    throw new ApplicationError("invalid_input", "並行記録は配分の編集を使用してください");
  if (old) {
    if (p.expectedMemo !== undefined && old.memo !== p.expectedMemo && old.memo !== p.memo)
      throw new ApplicationError(
        "conflict",
        "メモが別の画面で更新されました。編集を開き直してください",
      );
  }
  const dayStart = old?.dayStart ?? state.preferences.dayStart;
  const timezone = old?.timezone ?? state.preferences.timezone;
  const s = sessionSchema.parse({
    ...p,
    dayStart,
    timezone,
    businessDay: resolveBusinessDay(p.startedAt, dayStart, timezone),
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
  });
  if (s.startedAt > now + 1000 || (s.endedAt !== null && s.endedAt > now + 1000))
    throw new ApplicationError("invalid_input", "未来の打刻は登録できません");
  assertNoOverlap([...state.sessions.filter((x) => x.id !== s.id), s]);

  return { kind: "session", session: s, previous: old };
}
