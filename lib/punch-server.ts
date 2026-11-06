import { sessionFromRow } from "./session-row";
import { controlWork, currentMember } from "./work";
import { workUpdate } from "./work-server";
import { z } from "zod";
import { HttpError } from "./errors";
import { businessDay } from "./time";
import type { PunchDelta, Session } from "./model";

export { sessionFromRow } from "./session-row";
/** Two DB round trips, independent of history size. No all-session read or post-write reload. */
export async function performPunch(
  d: D1Database,
  user: string,
  input: { payload?: unknown; pressedAt?: number; expectedRevision: number; mutationId: string },
  receivedAt: number,
): Promise<PunchDelta | null> {
  const { categoryId } = z.object({ categoryId: z.string().min(1).max(100) }).parse(input.payload);
  const [pr, cr, sr, latest] = await d.batch<Record<string, unknown>>([
    d
      .prepare("SELECT timezone,day_start,revision,mutation_token FROM preferences WHERE user_id=?")
      .bind(user),
    d.prepare("SELECT id,archived FROM categories WHERE user_id=? AND id=?").bind(user, categoryId),
    d
      .prepare(
        "SELECT id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,work,created_at,updated_at FROM sessions WHERE user_id=? AND ended_at IS NULL",
      )
      .bind(user),
    d
      .prepare("SELECT ended_at FROM sessions WHERE user_id=? ORDER BY started_at DESC LIMIT 1")
      .bind(user),
  ]);
  const p = pr.results[0];
  if (!p) throw new HttpError(409, "画面を再読み込みしてください");
  // A lost response can be retried safely. The caller sends a full state only on this rare path.
  if (p.mutation_token === input.mutationId) return null;
  if (Number(p.revision) !== input.expectedRevision)
    throw new HttpError(
      409,
      "別の画面で更新されました。最新の状態を確認して、もう一度操作してください",
    );
  if (!cr.results[0] || cr.results[0].archived)
    throw new HttpError(400, "作業の種類が見つかりません");
  const running = sr.results[0] ? sessionFromRow(sr.results[0]) : undefined;
  // The client sends a server-clock-adjusted click time. Bound it to the last minute;
  // legacy requests or an invalid/outdated estimate fall back to request arrival.

  const clickAt =
    input.pressedAt !== undefined &&
    Number.isSafeInteger(input.pressedAt) &&
    input.pressedAt >= receivedAt - 60000 &&
    input.pressedAt <= receivedAt + 2000
      ? Math.min(input.pressedAt, receivedAt)
      : receivedAt;
  const at = Math.max(clickAt, running?.startedAt ?? 0, Number(latest.results[0]?.ended_at ?? 0));
  const guard = "EXISTS (SELECT 1 FROM preferences WHERE user_id=? AND mutation_token=?)";
  const statements = [
    d
      .prepare(
        "UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND revision=?",
      )
      .bind(input.mutationId, user, input.expectedRevision),
  ];
  const changed: Session[] = [];
  if (running && (running.work || running.categoryId !== categoryId)) {
    const m = currentMember(running, categoryId);
    const next = controlWork(
      running,
      m?.state === "active" ? "finish" : m?.state === "paused" ? "resume" : "join",
      categoryId,
      at,
      input.mutationId,
    );
    statements.push(workUpdate(d, user, running, next, input.mutationId));
    changed.push(next);
  } else if (running) {
    statements.push(
      d
        .prepare(
          `UPDATE sessions SET ended_at=?,updated_at=? WHERE user_id=? AND id=? AND ${guard}`,
        )
        .bind(at, at, user, running.id, user, input.mutationId),
    );
    changed.push({ ...running, endedAt: at, updatedAt: at });
  } else {
    const started: Session = {
      id: crypto.randomUUID(),
      categoryId,
      startedAt: at,
      endedAt: null,
      businessDay: businessDay(at, Number(p.day_start), String(p.timezone)),
      dayStart: Number(p.day_start),
      timezone: String(p.timezone),
      memo: "",
      createdAt: at,
      updatedAt: at,
    };
    statements.push(
      d
        .prepare(
          `INSERT INTO sessions (user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          user,
          started.id,
          categoryId,
          at,
          null,
          started.businessDay,
          started.dayStart,
          started.timezone,
          "",
          at,
          at,
          user,
          input.mutationId,
        ),
    );
    changed.push(started);
  }
  const result = await d.batch(statements);
  if (!result[0].meta.changes)
    throw new HttpError(409, "別の画面で更新されました。もう一度操作してください");
  return {
    baseRevision: input.expectedRevision,
    revision: input.expectedRevision + 1,
    sessions: changed,
    serverNow: Date.now(),
  };
}
