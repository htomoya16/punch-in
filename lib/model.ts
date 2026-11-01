export type Preferences = { timezone: string; dayStart: number; accent: string; sidebar: string; reminderEnabled: boolean; reminderMinutes: number };
export type Category = { id: string; name: string; color: string; hidden: boolean; archived: boolean; position: number };
export type Session = {
  id: string; categoryId: string; startedAt: number; endedAt: number | null; businessDay: string;
  dayStart: number; timezone: string; memo: string; createdAt: number; updatedAt: number;
};
export type AppState = { preferences: Preferences; categories: Category[]; sessions: Session[]; revision: number; serverNow: number };
export type Backup = { format: "punch-in"; version: 1; exportedAt: string; preferences: Preferences; categories: Category[]; sessions: Session[] };
export const DEFAULT_CATEGORIES = [
  { id: "research", name: "研究", color: "#168ab5" }, { id: "development", name: "個人開発", color: "#12a89a" },
  { id: "career", name: "就活", color: "#ec846c" }, { id: "study", name: "学習", color: "#9380c4" },
];
