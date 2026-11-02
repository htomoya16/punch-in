export type Preferences = { timezone: string; dayStart: number; accent: string; sidebar: string; reminderEnabled: boolean; reminderMinutes: number };
export type Category = { id: string; name: string; color: string; hidden: boolean; archived: boolean; position: number };
export type Session = {
  id: string; categoryId: string; startedAt: number; endedAt: number | null; businessDay: string;
  dayStart: number; timezone: string; memo: string; createdAt: number; updatedAt: number;
};
export type AppState = { preferences: Preferences; categories: Category[]; sessions: Session[]; revision: number; memoRevision?: number; serverNow: number };
export type PunchDelta = { baseRevision: number; revision: number; sessions: Session[]; serverNow: number };
export type PendingPunch = { categoryId: string; mutationId: string; baseRevision: number; at: number };
type BackupBase = { format: "punch-in"; exportedAt: string; preferences: Preferences; categories: Category[]; sessions: Session[] };
export type Backup = BackupBase & ({ version: 1 } | { version: 2; dailyNotes: import("./daily-note").DailyNoteExport[] });
export const DEFAULT_CATEGORIES = [
  { id: "punch", name: "打刻", color: "#168ab5" },
];
