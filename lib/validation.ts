import { templateExportSchema } from "./note-template-server";
import { workSchema } from "./work-validation";
import { z } from "zod";
import { noteExportSchema, legacyNoteExportSchema } from "./daily-note-validation";
import { businessDay } from "./time";
const id = z.string().min(1).max(100);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const timezone = z
  .string()
  .max(80)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "タイムゾーンが無効です");
export const preferenceSchema = z.object({
  timezone,
  dayStart: z.number().int().min(0).max(1439),
  accent: color,
  sidebar: color,
  reminderEnabled: z.boolean(),
  reminderMinutes: z.number().int().min(1).max(10080),
});
export const categorySchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  color,
  hidden: z.boolean(),
  archived: z.boolean(),
  position: z.number().int().min(0).max(10000),
});
export const sessionSchema = z
  .object({
    id,
    categoryId: id,
    startedAt: z.number().int().min(0).max(253402300799000),
    endedAt: z.number().int().min(0).max(253402300799000).nullable(),
    businessDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dayStart: z.number().int().min(0).max(1439),
    timezone,
    memo: z.string().max(2000),
    work: workSchema.optional(),
    createdAt: z.number().int().min(0),
    updatedAt: z.number().int().min(0),
  })
  .superRefine((s, ctx) => {
    if (s.work) {
      const w = s.work;
      if (
        s.endedAt === null &&
        (w.mode !== "auto" || w.members.every((m) => m.state === "finished"))
      )
        ctx.addIssue({ code: "custom", message: "計測中の作業状態を確認してください" });
      if (
        w.members.some(
          (m) =>
            (m.startedAt !== undefined &&
              (m.startedAt < s.startedAt || m.startedAt > (s.endedAt ?? s.updatedAt))) ||
            (m.endedAt !== undefined &&
              m.endedAt !== null &&
              (m.endedAt > (s.endedAt ?? s.updatedAt) || m.state !== "finished")),
        )
      )
        ctx.addIssue({ code: "custom", message: "作業の時刻が記録と一致しません" });
      if (
        w.members[0].categoryId !== s.categoryId ||
        w.members[0].memo !== s.memo ||
        w.intervals.some(
          (i) =>
            i.start < s.startedAt || (s.endedAt !== null && (i.end === null || i.end > s.endedAt)),
        ) ||
        (s.endedAt !== null && w.members.some((m) => m.state !== "finished"))
      )
        ctx.addIssue({ code: "custom", message: "作業の区間が記録と一致しません" });
    }
    if (s.endedAt !== null && s.endedAt < s.startedAt)
      ctx.addIssue({ code: "custom", message: "終了時刻は開始時刻以降にしてください" });
    if (s.businessDay !== businessDay(s.startedAt, s.dayStart, s.timezone))
      ctx.addIssue({ code: "custom", message: "記録の日付が開始時刻・設定と一致しません" });
  });
const backupBase = z.object({
  format: z.literal("punch-in"),
  exportedAt: z.string().datetime(),
  preferences: preferenceSchema,
  categories: z.array(categorySchema).max(500),
  sessions: z.array(sessionSchema).max(20000),
});
export const backupSchema = z
  .discriminatedUnion("version", [
    backupBase.extend({ version: z.literal(1) }),
    backupBase.extend({
      version: z.literal(2),
      dailyNotes: z.array(legacyNoteExportSchema).max(20000),
    }),
    backupBase.extend({ version: z.literal(3), dailyNotes: z.array(noteExportSchema).max(20000) }),
    backupBase.extend({
      version: z.literal(4),
      dailyNotes: z.array(noteExportSchema).max(20000),
      templates: z.array(templateExportSchema).max(100),
      defaultTemplateId: z.string().uuid().nullable(),
    }),
  ])
  .superRefine((b, ctx) => {
    if (
      b.version === 4 &&
      (new Set(b.templates.map((t) => t.id)).size !== b.templates.length ||
        (b.defaultTemplateId && !b.templates.some((t) => t.id === b.defaultTemplateId)))
    )
      ctx.addIssue({ code: "custom", message: "テンプレートの設定を確認してください" });
    if (b.version !== 1 && new Set(b.dailyNotes.map((n) => n.day)).size !== b.dailyNotes.length)
      ctx.addIssue({ code: "custom", message: "同じ日付のメモが重複しています" });
    if (
      new Set(b.categories.map((c) => c.id)).size !== b.categories.length ||
      new Set(b.sessions.map((s) => s.id)).size !== b.sessions.length
    )
      ctx.addIssue({ code: "custom", message: "ファイル内に重複したIDがあります" });
    const ids = new Set(b.categories.map((c) => c.id));
    if (
      b.sessions.some(
        (s) => !ids.has(s.categoryId) || s.work?.members.some((m) => !ids.has(m.categoryId)),
      )
    )
      ctx.addIssue({ code: "custom", message: "作業の種類が見つからない記録があります" });
    if (b.sessions.filter((s) => s.endedAt === null).length > 1)
      ctx.addIssue({ code: "custom", message: "計測中の記録は1つにしてください" });
  });
