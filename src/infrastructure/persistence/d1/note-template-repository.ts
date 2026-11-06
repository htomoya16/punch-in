import { z } from "zod";
import { ApplicationError } from "../../../application/errors/application-error";
import type { NoteTemplateRepository } from "../../../application/ports/note-template-repository";
import { templateMutation } from "../../../application/validation/note-template-schema";
import type { NoteTemplate } from "../../../domain/notes/note-template";

export async function readTemplates(db: D1Database, user: string) {
  const [rows, prefs] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT * FROM note_templates WHERE user_id=? ORDER BY created_at,id").bind(user),
    db
      .prepare("SELECT default_id,version FROM note_template_preferences WHERE user_id=?")
      .bind(user),
  ]);
  return {
    templates: rows.results.map(
      (r) =>
        ({
          id: String(r.id),
          name: String(r.name),
          markdown: String(r.markdown),
          document: JSON.parse(String(r.document)),
          version: Number(r.version),
          updatedAt: Number(r.updated_at),
        }) as NoteTemplate,
    ),
    defaultId: (prefs.results[0]?.default_id as string | null) ?? null,
    version: Number(prefs.results[0]?.version ?? 0),
  };
}

export async function mutateTemplate(
  db: D1Database,
  user: string,
  input: z.infer<typeof templateMutation>,
) {
  let changed = false;
  if (input.action === "save") {
    const r =
      input.expectedVersion === 0
        ? await db
            .prepare(
              "INSERT INTO note_templates (user_id,id,name,markdown,document,version,mutation_id,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?) ON CONFLICT(user_id,id) DO NOTHING",
            )
            .bind(
              user,
              input.id,
              input.name,
              input.markdown,
              JSON.stringify(input.document),
              input.mutationId,
              Date.now(),
              Date.now(),
            )
            .run()
        : await db
            .prepare(
              "UPDATE note_templates SET name=?,markdown=?,document=?,version=version+1,mutation_id=?,updated_at=? WHERE user_id=? AND id=? AND version=?",
            )
            .bind(
              input.name,
              input.markdown,
              JSON.stringify(input.document),
              input.mutationId,
              Date.now(),
              user,
              input.id,
              input.expectedVersion,
            )
            .run();
    changed = !!r.meta.changes;
  } else if (input.action === "default") {
    if (
      input.id &&
      !(await db
        .prepare("SELECT 1 FROM note_templates WHERE user_id=? AND id=?")
        .bind(user, input.id)
        .first())
    )
      throw new ApplicationError("not_found", "テンプレートが見つかりません");
    const r = await db
      .prepare(
        "INSERT INTO note_template_preferences (user_id,default_id,version,mutation_id) SELECT ?,?,1,? WHERE ?=0 OR EXISTS(SELECT 1 FROM note_template_preferences WHERE user_id=? AND version=?) ON CONFLICT(user_id) DO UPDATE SET default_id=excluded.default_id,version=note_template_preferences.version+1,mutation_id=excluded.mutation_id WHERE note_template_preferences.version=?",
      )
      .bind(
        user,
        input.id,
        input.mutationId,
        input.expectedVersion,
        user,
        input.expectedVersion,
        input.expectedVersion,
      )
      .run();
    changed = !!r.meta.changes;
  } else {
    const r = await db.batch([
      db
        .prepare(
          "UPDATE note_template_preferences SET default_id=NULL,version=version+1,mutation_id=? WHERE user_id=? AND default_id=? AND EXISTS(SELECT 1 FROM note_templates WHERE user_id=? AND id=? AND version=?)",
        )
        .bind(input.mutationId, user, input.id, user, input.id, input.expectedVersion),
      db
        .prepare("DELETE FROM note_templates WHERE user_id=? AND id=? AND version=?")
        .bind(user, input.id, input.expectedVersion),
    ]);
    changed = !!r[1].meta.changes;
  }
  if (!changed) {
    const table = input.action === "default" ? "note_template_preferences" : "note_templates";
    const previous = await db
      .prepare(
        `SELECT mutation_id FROM ${table} WHERE user_id=?${input.action === "default" ? "" : " AND id=?"}`,
      )
      .bind(...(input.action === "default" ? [user] : [user, input.id]))
      .first<{
        mutation_id: string;
      }>();
    if (previous?.mutation_id !== input.mutationId) {
      if (input.action === "delete" && !previous) return readTemplates(db, user);
      throw new ApplicationError(
        "conflict",
        "別の画面で更新されています。再読み込みして確認してください",
      );
    }
  }
  return readTemplates(db, user);
}

export class D1NoteTemplateRepository implements NoteTemplateRepository {
  constructor(private readonly database: D1Database) {}
  read(userId: string) {
    return readTemplates(this.database, userId);
  }
  async count(userId: string): Promise<number> {
    const row = await this.database
      .prepare("SELECT COUNT(*) AS n FROM note_templates WHERE user_id=?")
      .bind(userId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
  mutate(
    userId: string,
    input: import("../../../application/ports/note-template-repository").TemplateMutation,
  ) {
    return mutateTemplate(this.database, userId, input);
  }
  async readDefault(userId: string): Promise<NoteTemplate | undefined> {
    const row = await this.database
      .prepare(
        "SELECT t.* FROM note_templates t JOIN note_template_preferences p ON p.user_id=t.user_id AND p.default_id=t.id WHERE t.user_id=?",
      )
      .bind(userId)
      .first<Record<string, unknown>>();
    return row
      ? {
          id: String(row.id),
          name: String(row.name),
          markdown: String(row.markdown),
          document: JSON.parse(String(row.document)),
          version: Number(row.version),
          updatedAt: Number(row.updated_at),
        }
      : undefined;
  }
}
