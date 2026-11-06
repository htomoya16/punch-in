import type { AppActionName } from "./app-action";
import type { AppState, PunchDelta } from "./app-state";

export type AppActionRequest = {
  action: AppActionName;
  payload: unknown;
  mutationId: string;
  expectedRevision: number;
  responseMode?: "delta";
  pressedAt?: number;
};

export type AppActionResult = {
  error?: string;
  state?: AppState;
  punchDelta?: PunchDelta;
  preview?: BackupImportPreview;
};

export type BackupImportPreview = {
  dailyNotes: number;
  skippedDailyNotes: number;
  categories: number;
  sessions: number;
  skippedCategories: number;
  skippedSessions: number;
  running: boolean;
};
