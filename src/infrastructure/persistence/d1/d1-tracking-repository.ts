import type {
  MutationIdentity,
  PunchContext,
  TrackingRepository,
  WorkContext,
} from "../../../application/ports/tracking-repository";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { buildSessionUpdateStatement } from "./session-update-statement";
import { mapTrackingSessionRow } from "./tracking-row-mapper";

export class D1TrackingRepository implements TrackingRepository {
  constructor(private readonly database: D1Database) {}

  async loadPunchContext(userId: string, categoryId: string): Promise<PunchContext> {
    const [preferences, categories, sessions, latest] = await this.database.batch<
      Record<string, unknown>
    >([
      this.database
        .prepare(
          "SELECT timezone,day_start,revision,mutation_token FROM preferences WHERE user_id=?",
        )
        .bind(userId),
      this.database
        .prepare("SELECT id,archived FROM categories WHERE user_id=? AND id=?")
        .bind(userId, categoryId),
      this.database
        .prepare(
          "SELECT id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,work,created_at,updated_at FROM sessions WHERE user_id=? AND ended_at IS NULL",
        )
        .bind(userId),
      this.database
        .prepare("SELECT ended_at FROM sessions WHERE user_id=? ORDER BY started_at DESC LIMIT 1")
        .bind(userId),
    ]);
    const preference = preferences.results[0];
    return {
      preferences: preference
        ? {
            revision: Number(preference.revision),
            mutationId: String(preference.mutation_token),
            dayStart: Number(preference.day_start),
            timezone: String(preference.timezone),
          }
        : undefined,
      categoryAvailable: !!categories.results[0] && !categories.results[0].archived,
      running: sessions.results[0] ? mapTrackingSessionRow(sessions.results[0]) : undefined,
      latestEndedAt: Number(latest.results[0]?.ended_at ?? 0),
    };
  }

  async loadWorkContext(
    userId: string,
    sessionId: string,
    categoryId: string,
  ): Promise<WorkContext> {
    const [preferences, sessions, categories] = await this.database.batch<Record<string, unknown>>([
      this.database
        .prepare("SELECT revision,mutation_token FROM preferences WHERE user_id=?")
        .bind(userId),
      this.database
        .prepare("SELECT * FROM sessions WHERE user_id=? AND id=?")
        .bind(userId, sessionId),
      this.database
        .prepare("SELECT id FROM categories WHERE user_id=? AND archived=0 AND id=?")
        .bind(userId, categoryId),
    ]);
    const preference = preferences.results[0];
    return {
      preferences: preference
        ? { revision: Number(preference.revision), mutationId: String(preference.mutation_token) }
        : undefined,
      session: sessions.results[0] ? mapTrackingSessionRow(sessions.results[0]) : undefined,
      categoryAvailable: categories.results.length > 0,
    };
  }

  async hasOverlap(userId: string, session: TrackingSession): Promise<boolean> {
    const overlap = await this.database
      .prepare(
        "SELECT id FROM sessions WHERE user_id=? AND id<>? AND started_at<? AND COALESCE(ended_at,253402300799000)>? AND (ended_at IS NULL OR ended_at<>started_at) LIMIT 1",
      )
      .bind(userId, session.id, session.endedAt ?? 253402300799000, session.startedAt)
      .first();
    return !!overlap;
  }

  async commitSession(
    userId: string,
    identity: MutationIdentity,
    previous: TrackingSession | undefined,
    next: TrackingSession,
  ): Promise<boolean> {
    const { mutationId, expectedRevision } = identity;
    const guard = "EXISTS (SELECT 1 FROM preferences WHERE user_id=? AND mutation_token=?)";
    const revisionUpdate = this.database
      .prepare(
        "UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND revision=?",
      )
      .bind(mutationId, userId, expectedRevision);
    let sessionUpdate: D1PreparedStatement;

    if (previous && next.work) {
      sessionUpdate = buildSessionUpdateStatement(
        this.database,
        userId,
        previous,
        next,
        mutationId,
      );
    } else if (previous) {
      sessionUpdate = this.database
        .prepare(
          `UPDATE sessions SET ended_at=?,updated_at=? WHERE user_id=? AND id=? AND ${guard}`,
        )
        .bind(next.endedAt, next.updatedAt, userId, previous.id, userId, mutationId);
    } else {
      sessionUpdate = this.database
        .prepare(
          `INSERT INTO sessions (user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          userId,
          next.id,
          next.categoryId,
          next.startedAt,
          next.endedAt,
          next.businessDay,
          next.dayStart,
          next.timezone,
          next.memo,
          next.createdAt,
          next.updatedAt,
          userId,
          mutationId,
        );
    }

    // The guard keeps the session unchanged if the compare-and-swap loses a race.
    const results = await this.database.batch([revisionUpdate, sessionUpdate]);
    return results[0].meta.changes > 0;
  }
}
