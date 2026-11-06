import type { WorkCategory } from "../../domain/categories/work-category";
import type { UserPreferences } from "../../domain/settings/user-preferences";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import type { AppState } from "../contracts/app-state";
import type { BackupImportPlan } from "../contracts/backup-import";
import type { MutationIdentity } from "./tracking-repository";

export type AppMutation =
  | { kind: "category"; category: WorkCategory }
  | { kind: "archiveCategory"; id: string }
  | { kind: "reorder"; ids: string[] }
  | { kind: "preferences"; preferences: UserPreferences }
  | { kind: "session"; session: TrackingSession; previous?: TrackingSession }
  | { kind: "deleteSession"; id: string }
  | { kind: "import"; plan: BackupImportPlan; includePreferences: boolean };

export type RevisionState = {
  revision: number;
  memoRevision: number;
  mutationId: string;
  seeded: number;
};

export interface AppStateRepository {
  initialize(userId: string): Promise<void>;
  read(userId: string): Promise<AppState>;
  readRevision(userId: string): Promise<RevisionState | null>;
  /** Commit the revision and all related records atomically; preserve separately saved memos. */
  commit(userId: string, identity: MutationIdentity, mutation: AppMutation): Promise<boolean>;
}
