import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

export const preferences = sqliteTable("preferences", {
  userId: text("user_id").primaryKey(),
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  dayStart: integer("day_start").notNull().default(300),
  accent: text("accent").notNull().default("#168ab5"),
  sidebar: text("sidebar").notNull().default("#272c34"),
  reminderEnabled: integer("reminder_enabled").notNull().default(0),
  reminderMinutes: integer("reminder_minutes").notNull().default(360),
  memoRevision: integer("memo_revision").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  mutationToken: text("mutation_token").notNull().default(""),
  seeded: integer("seeded").notNull().default(0),
});
export const categories = sqliteTable("categories", {
  userId: text("user_id").notNull(), id: text("id").notNull(), name: text("name").notNull(), color: text("color").notNull(),
  hidden: integer("hidden").notNull().default(0), archived: integer("archived").notNull().default(0), position: integer("position").notNull().default(0),
}, t => [primaryKey({ columns: [t.userId, t.id] })]);
export const sessions = sqliteTable("sessions", {
  userId: text("user_id").notNull(), id: text("id").notNull(), categoryId: text("category_id").notNull(),
  startedAt: integer("started_at").notNull(), endedAt: integer("ended_at"), businessDay: text("business_day").notNull(),
  dayStart: integer("day_start").notNull(), timezone: text("timezone").notNull(), memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [
  primaryKey({ columns: [t.userId, t.id] }), index("sessions_by_day").on(t.userId, t.businessDay),
  index("sessions_by_start").on(t.userId, t.startedAt),
  uniqueIndex("one_running_session").on(t.userId).where(sql`${t.endedAt} IS NULL`),
  check("positive_duration", sql`${t.endedAt} IS NULL OR ${t.endedAt} >= ${t.startedAt}`),
]);

export const dailyNotes = sqliteTable("daily_notes", {
  userId: text("user_id").notNull(),
  day: text("day").notNull(),
  markdown: text("markdown").notNull().default(""),
  document: text("document"),
  originalMarkdown: text("original_markdown"),
  version: integer("version").notNull().default(1),
  mutationId: text("mutation_id").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.userId, t.day] }), check("positive_note_version", sql`${t.version} >= 1`)]);
