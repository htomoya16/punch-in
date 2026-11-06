import type { AppState } from "../contracts/app-state";
import type { AppActionRequest, AppActionResult } from "../contracts/client-action";

export type StateReadResult = { status: number; serverNow: number; state?: AppState };

export interface AppApiClient {
  readState(revision?: number, memoRevision?: number): Promise<StateReadResult>;
  executeAction(
    job: AppActionRequest,
  ): Promise<{ status: number; ok: boolean; result: AppActionResult }>;
}
