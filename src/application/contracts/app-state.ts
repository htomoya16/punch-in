import { WorkCategory } from "../../domain/categories/work-category";
import { UserPreferences } from "../../domain/settings/user-preferences";
import { TrackingSession } from "../../domain/tracking/tracking-session";

export type AppState = {
  preferences: UserPreferences;
  categories: WorkCategory[];
  sessions: TrackingSession[];
  revision: number;
  memoRevision?: number;
  serverNow: number;
};

export type PunchDelta = {
  baseRevision: number;
  revision: number;
  sessions: TrackingSession[];
  serverNow: number;
};

export type PendingPunch = {
  categoryId: string;
  mutationId: string;
  baseRevision: number;
  at: number;
  workId?: string;
  control?: import("../../domain/tracking/work-entry").TrackingControl;
};
