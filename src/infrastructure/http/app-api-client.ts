import type { AppState } from "../../application/contracts/app-state";
import type { AppActionRequest, AppActionResult } from "../../application/contracts/client-action";
import type { AppApiClient } from "../../application/ports/app-api-client";

export const appApiClient: AppApiClient = {
  async readState(revision?: number, memoRevision = 0) {
    const url =
      revision === undefined
        ? "/api/state"
        : `/api/state?revision=${revision}&memoRevision=${memoRevision}`;
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return {
      status: response.status,
      serverNow: Number(response.headers.get("X-Server-Now")),
      ...(response.ok ? { state: (await response.json()) as AppState } : {}),
    };
  },
  async executeAction(job: AppActionRequest) {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
      signal: AbortSignal.timeout(15000),
    });
    return {
      status: response.status,
      ok: response.ok,
      result: (await response.json()) as AppActionResult,
    };
  },
};
