import { editWorkTime } from "../../../domain/tracking/edit-work-entry-time";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import {
  applyTrackingCommand,
  removeWorkEntry,
} from "../../../domain/tracking/tracking-transitions";
import { getWorkEntryId, type TrackingControl } from "../../../domain/tracking/work-entry";
import type { PunchDelta } from "../../contracts/app-state";
import { workInput } from "../../contracts/tracking-command";
import { ApplicationError } from "../../errors/application-error";
import type { Clock } from "../../ports/clock";
import type { TrackingMutation, TrackingRepository } from "../../ports/tracking-repository";
import { sessionSchema } from "../../validation/backup-schema";

export function createUpdateTrackingSession({
  repository,
  clock,
}: {
  repository: TrackingRepository;
  clock: Clock;
}) {
  return async function updateTrackingSession(
    userId: string,
    input: TrackingMutation,
    receivedAt: number,
  ): Promise<PunchDelta | null> {
    const p = workInput.parse(input.payload);
    const context = await repository.loadWorkContext(userId, p.id, p.categoryId ?? "");
    if (context.preferences?.mutationId === input.mutationId) return null;
    if (context.preferences?.revision !== input.expectedRevision)
      throw new ApplicationError("conflict", "別の画面で更新されました。もう一度操作してください");
    if (!context.session) throw new ApplicationError("not_found", "記録が見つかりません");
    const old = context.session;
    let next: TrackingSession;
    if (p.control === "timing") {
      if (!p.memberId || p.startedAt === undefined || p.endedAt === undefined)
        throw new ApplicationError("invalid_input", "開始・終了時刻を指定してください");
      try {
        next = sessionSchema.parse(
          editWorkTime(old, p.memberId, p.startedAt, p.endedAt, receivedAt),
        );
      } catch (error) {
        throw new ApplicationError(
          "invalid_input",
          error instanceof Error ? error.message : "日時を確認してください",
        );
      }
      if (next.endedAt !== next.startedAt) {
        const overlap = await repository.hasOverlap(userId, next);
        if (overlap)
          throw new ApplicationError("invalid_input", "ほかの記録と時間が重なっています");
      }
    } else if (p.control === "remove") {
      try {
        next = removeWorkEntry(old, p.memberId ?? p.categoryId ?? "", receivedAt);
      } catch (error) {
        throw new ApplicationError("invalid_input", (error as Error).message);
      }
    } else if (p.control === "allocate") {
      if (!old.work || old.endedAt === null)
        throw new ApplicationError("invalid_input", "計測を終了してから配分を編集してください");
      const mode = p.mode ?? "auto";
      const values = p.values ?? {};
      if (
        mode !== "auto" &&
        (old.work.members.some((m) => values[getWorkEntryId(m)] === undefined) ||
          Object.keys(values).length !== old.work.members.length)
      )
        throw new ApplicationError("invalid_input", "すべての作業の配分を指定してください");
      if (mode === "ratio" && Object.values(values).some((n) => n > 1000000))
        throw new ApplicationError("invalid_input", "比率は100万以下で指定してください");
      if (mode === "ratio" && Object.values(values).reduce((a, b) => a + b, 0) <= 0)
        throw new ApplicationError("invalid_input", "比率の合計は0より大きくしてください");
      next = {
        ...old,
        updatedAt: receivedAt,
        work: {
          ...old.work,
          mode,
          members: old.work.members.map((m) => ({
            ...m,
            weight: mode === "ratio" ? values[getWorkEntryId(m)] : m.weight,
            ...(mode === "manual"
              ? { manualMs: Math.round(values[getWorkEntryId(m)]) }
              : { manualMs: undefined }),
          })),
        },
      };
    } else {
      if (p.control === "join" && !context.categoryAvailable)
        throw new ApplicationError("invalid_input", "作業の種類が見つかりません");
      const click = input.pressedAt;
      const at =
        click !== undefined && click >= receivedAt - 60000 && click <= receivedAt + 2000
          ? Math.min(click, receivedAt)
          : receivedAt;
      try {
        next = applyTrackingCommand(
          old,
          p.control as TrackingControl,
          p.categoryId ?? "",
          at,
          input.mutationId,
        );
      } catch (error) {
        throw new ApplicationError("invalid_input", (error as Error).message);
      }
    }

    if (!(await repository.commitSession(userId, input, old, next)))
      throw new ApplicationError("conflict", "別の画面で更新されました。もう一度操作してください");
    return {
      baseRevision: input.expectedRevision,
      revision: input.expectedRevision + 1,
      sessions: [next],
      serverNow: clock.now(),
    };
  };
}
