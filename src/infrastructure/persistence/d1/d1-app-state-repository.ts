import type { AppState } from "../../../application/contracts/app-state";
import type {
  AppMutation,
  AppStateRepository,
  RevisionState,
} from "../../../application/ports/app-state-repository";
import type { MutationIdentity } from "../../../application/ports/tracking-repository";
import type { WorkCategory } from "../../../domain/categories/work-category";
import type { UserPreferences } from "../../../domain/settings/user-preferences";
import type { TrackingSession } from "../../../domain/tracking/tracking-session";
import { bootstrapQueries } from "./initialize-user";
import { mapTrackingSessionRow } from "./tracking-row-mapper";

export class D1AppStateRepository implements AppStateRepository {
  constructor(private readonly database: D1Database) {}
  async initialize(user: string) {
    const d = this.database;
    if (
      await d.prepare("SELECT 1 FROM preferences WHERE user_id=? AND seeded>=2").bind(user).first()
    )
      return;
    await d.batch(bootstrapQueries(user).map((q) => d.prepare(q.sql).bind(...q.values)));
  }
  async read(user: string): Promise<AppState> {
    const d = this.database;
    const [pr, cr, sr] = await d.batch<Record<string, unknown>>([
      d.prepare("SELECT * FROM preferences WHERE user_id=?").bind(user),
      d
        .prepare(
          "SELECT id,name,color,hidden,archived,position FROM categories WHERE user_id=? ORDER BY position,id",
        )
        .bind(user),
      d
        .prepare(
          "SELECT id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,work,created_at,updated_at FROM sessions WHERE user_id=? ORDER BY started_at DESC,id",
        )
        .bind(user),
    ]);
    const p = pr.results[0] as Record<string, unknown>;
    return {
      preferences: {
        timezone: String(p.timezone),
        dayStart: Number(p.day_start),
        accent: String(p.accent),
        sidebar: String(p.sidebar),
        reminderEnabled: !!p.reminder_enabled,
        reminderMinutes: Number(p.reminder_minutes),
      },
      categories: cr.results.map((c) => ({
        ...c,
        hidden: !!c.hidden,
        archived: !!c.archived,
      })) as WorkCategory[],
      sessions: sr.results.map(mapTrackingSessionRow),
      memoRevision: Number(p.memo_revision),
      revision: Number(p.revision),
      serverNow: Date.now(),
    };
  }
  async readRevision(userId: string): Promise<RevisionState | null> {
    const row = await this.database
      .prepare(
        "SELECT revision,seeded,memo_revision,mutation_token FROM preferences WHERE user_id=?",
      )
      .bind(userId)
      .first<{ revision: number; seeded: number; memo_revision: number; mutation_token: string }>();
    return row
      ? {
          revision: row.revision,
          seeded: row.seeded,
          memoRevision: row.memo_revision,
          mutationId: row.mutation_token,
        }
      : null;
  }
  async commit(user: string, identity: MutationIdentity, mutation: AppMutation): Promise<boolean> {
    const d = this.database;
    const token = identity.mutationId;
    const guard = "EXISTS (SELECT 1 FROM preferences WHERE user_id=? AND mutation_token=?)";
    const statements: D1PreparedStatement[] = [
      d
        .prepare(
          "UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND revision=?",
        )
        .bind(token, user, identity.expectedRevision),
    ];

    function write(sql: string, args: (string | number | null)[]) {
      statements.push(d.prepare(sql).bind(...args, user, token));
    }

    function insert(s: TrackingSession) {
      write(
        `INSERT INTO sessions (user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,work,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        [
          user,
          s.id,
          s.categoryId,
          s.startedAt,
          s.endedAt,
          s.businessDay,
          s.dayStart,
          s.timezone,
          s.memo,
          s.work ? JSON.stringify(s.work) : null,
          s.createdAt,
          s.updatedAt,
        ],
      );
    }

    function savePrefs(p: UserPreferences) {
      write(
        `UPDATE preferences SET timezone=?,day_start=?,accent=?,sidebar=?,reminder_enabled=?,reminder_minutes=? WHERE user_id=? AND ${guard}`,
        [p.timezone, p.dayStart, p.accent, p.sidebar, +p.reminderEnabled, p.reminderMinutes, user],
      );
    }

    if (mutation.kind === "category") {
      const c = mutation.category;
      write(
        `INSERT INTO categories (user_id,id,name,color,hidden,archived,position) SELECT ?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,color=excluded.color,hidden=excluded.hidden,position=excluded.position`,
        [user, c.id, c.name, c.color, +c.hidden, 0, c.position],
      );
    } else if (mutation.kind === "archiveCategory") {
      const id = mutation.id;
      write(`UPDATE categories SET archived=1 WHERE user_id=? AND id=? AND ${guard}`, [user, id]);
    } else if (mutation.kind === "reorder") {
      const ids = mutation.ids;
      write(
        `UPDATE categories SET position=(SELECT key FROM json_each(?) WHERE value=categories.id) WHERE user_id=? AND archived=0 AND ${guard}`,
        [JSON.stringify(ids), user],
      );
    } else if (mutation.kind === "preferences") {
      savePrefs(mutation.preferences);
    } else if (mutation.kind === "session") {
      const { session: s, previous: old } = mutation;
      const now = s.updatedAt;
      if (old) {
        statements[0] = d
          .prepare(
            "UPDATE preferences SET revision=revision+1,mutation_token=? WHERE user_id=? AND revision=? AND EXISTS (SELECT 1 FROM sessions WHERE user_id=? AND id=? AND memo=?)",
          )
          .bind(token, user, identity.expectedRevision, user, old.id, old.memo);
      }
      if (old)
        write(
          `UPDATE sessions SET category_id=?,started_at=?,ended_at=?,business_day=?,memo=?,updated_at=? WHERE user_id=? AND id=? AND ${guard}`,
          [s.categoryId, s.startedAt, s.endedAt, s.businessDay, s.memo, now, user, s.id],
        );
      else insert(s);
    } else if (mutation.kind === "deleteSession") {
      const id = mutation.id;
      write(`DELETE FROM sessions WHERE user_id=? AND id=? AND ${guard}`, [user, id]);
    } else if (mutation.kind === "import") {
      const plan = mutation.plan;
      if (plan.templates.length)
        write(
          `INSERT INTO note_templates (user_id,id,name,markdown,document,version,mutation_id,created_at,updated_at) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.markdown'),json_extract(value,'$.document'),1,?,json_extract(value,'$.updatedAt'),json_extract(value,'$.updatedAt') FROM json_each(?) WHERE ${guard} ON CONFLICT(user_id,id) DO NOTHING`,
          [user, token, JSON.stringify(plan.templates)],
        );
      if (mutation.includePreferences && plan.backup.version === 4)
        write(
          `INSERT INTO note_template_preferences (user_id,default_id,version,mutation_id) SELECT ?,?,1,? WHERE ${guard} ON CONFLICT(user_id) DO UPDATE SET default_id=excluded.default_id,version=note_template_preferences.version+1,mutation_id=excluded.mutation_id`,
          [user, plan.backup.defaultTemplateId, token],
        );
      if (plan.categories.length)
        write(
          `INSERT INTO categories (user_id,id,name,color,hidden,archived,position) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.color'),json_extract(value,'$.hidden'),json_extract(value,'$.archived'),json_extract(value,'$.position') FROM json_each(?) WHERE ${guard}`,
          [user, JSON.stringify(plan.categories)],
        );
      if (plan.sessions.length)
        write(
          `INSERT INTO sessions (user_id,id,category_id,started_at,ended_at,business_day,day_start,timezone,memo,work,created_at,updated_at) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.categoryId'),json_extract(value,'$.startedAt'),json_extract(value,'$.endedAt'),json_extract(value,'$.businessDay'),json_extract(value,'$.dayStart'),json_extract(value,'$.timezone'),json_extract(value,'$.memo'),json_extract(value,'$.work'),json_extract(value,'$.createdAt'),json_extract(value,'$.updatedAt') FROM json_each(?) WHERE ${guard}`,
          [user, JSON.stringify(plan.sessions)],
        );
      if (plan.dailyNotes.length)
        write(
          `INSERT INTO daily_notes (user_id,day,markdown,version,mutation_id,updated_at,document,original_markdown,template) SELECT ?,json_extract(value,'$.day'),json_extract(value,'$.markdown'),1,?,json_extract(value,'$.updatedAt'),json_extract(value,'$.document'),json_extract(value,'$.originalMarkdown'),json_extract(value,'$.template') FROM json_each(?) WHERE ${guard} ON CONFLICT(user_id,day) DO NOTHING`,
          [user, token, JSON.stringify(plan.dailyNotes)],
        );
      if (mutation.includePreferences) savePrefs(plan.backup.preferences);
    }

    const result = await d.batch(statements);
    return result[0].meta.changes > 0;
  }
}
