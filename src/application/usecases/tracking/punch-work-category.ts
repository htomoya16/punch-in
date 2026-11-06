import { z } from "zod";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { applyTrackingCommand } from "../../../domain/tracking/tracking-transitions";
import { findLatestWorkEntry } from "../../../domain/tracking/work-entry";
import { resolveBusinessDay } from "../../../shared/time/calendar";
import type { PunchDelta } from "../../contracts/app-state";
import { ApplicationError } from "../../errors/application-error";
import type { Clock } from "../../ports/clock";
import type { IdGenerator } from "../../ports/id-generator";
import type { TrackingMutation, TrackingRepository } from "../../ports/tracking-repository";

const punchSchema = z.object({ categoryId: z.string().min(1).max(100) });

type Dependencies = { repository: TrackingRepository; clock: Clock; ids: IdGenerator };

export function createPunchWorkCategory({ repository, clock, ids }: Dependencies) {
  return async function punchWorkCategory(
    userId: string,
    input: TrackingMutation,
    receivedAt: number,
  ): Promise<PunchDelta | null> {
    const { categoryId } = punchSchema.parse(input.payload);
    const context = await repository.loadPunchContext(userId, categoryId);
    const { preferences, running } = context;

    if (!preferences) throw new ApplicationError("conflict", "画面を再読み込みしてください");
    // A repeated mutation can be acknowledged without creating a duplicate entry.
    if (preferences.mutationId === input.mutationId) return null;
    if (preferences.revision !== input.expectedRevision)
      throw new ApplicationError(
        "conflict",
        "別の画面で更新されました。最新の状態を確認して、もう一度操作してください",
      );
    if (!context.categoryAvailable)
      throw new ApplicationError("invalid_input", "作業の種類が見つかりません");

    const clickAt =
      input.pressedAt !== undefined &&
      Number.isSafeInteger(input.pressedAt) &&
      input.pressedAt >= receivedAt - 60000 &&
      input.pressedAt <= receivedAt + 2000
        ? Math.min(input.pressedAt, receivedAt)
        : receivedAt;
    const at = Math.max(clickAt, running?.startedAt ?? 0, context.latestEndedAt);
    let next: TrackingSession;

    if (running && (running.work || running.categoryId !== categoryId)) {
      const entry = findLatestWorkEntry(running, categoryId);
      const control =
        entry?.state === "active" ? "finish" : entry?.state === "paused" ? "resume" : "join";
      next = applyTrackingCommand(running, control, categoryId, at, input.mutationId);
    } else if (running) {
      next = { ...running, endedAt: at, updatedAt: at };
    } else {
      next = {
        id: ids.generate(),
        categoryId,
        startedAt: at,
        endedAt: null,
        businessDay: resolveBusinessDay(at, preferences.dayStart, preferences.timezone),
        dayStart: preferences.dayStart,
        timezone: preferences.timezone,
        memo: "",
        createdAt: at,
        updatedAt: at,
      };
    }

    if (!(await repository.commitSession(userId, input, running, next)))
      throw new ApplicationError("conflict", "別の画面で更新されました。もう一度操作してください");
    return {
      baseRevision: input.expectedRevision,
      revision: input.expectedRevision + 1,
      sessions: [next],
      serverNow: clock.now(),
    };
  };
}
