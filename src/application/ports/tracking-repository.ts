import type { TrackingSession } from "../../domain/tracking/tracking-session";

export type MutationIdentity = {
  expectedRevision: number;
  mutationId: string;
};

export type TrackingMutation = MutationIdentity & {
  payload?: unknown;
  pressedAt?: number;
};

export type TrackingRevision = {
  revision: number;
  mutationId: string;
};

export type PunchContext = {
  preferences?: TrackingRevision & { dayStart: number; timezone: string };
  categoryAvailable: boolean;
  running?: TrackingSession;
  latestEndedAt: number;
};

export type WorkContext = {
  preferences?: TrackingRevision;
  categoryAvailable: boolean;
  session?: TrackingSession;
};

export interface TrackingRepository {
  loadPunchContext(userId: string, categoryId: string): Promise<PunchContext>;
  loadWorkContext(userId: string, sessionId: string, categoryId: string): Promise<WorkContext>;
  hasOverlap(userId: string, session: TrackingSession): Promise<boolean>;

  /**
   * Atomically compare the revision, increment it, and write the session.
   * A structural write must merge the latest separately saved entry memos by ID.
   * Return false on a stale revision; partial writes are never permitted.
   */
  commitSession(
    userId: string,
    identity: MutationIdentity,
    previous: TrackingSession | undefined,
    next: TrackingSession,
  ): Promise<boolean>;
}
