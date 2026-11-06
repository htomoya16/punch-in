import { calculateRecordedDuration } from "./duration-allocation";
import type { TrackingSession } from "./tracking-session";

export function getRecordedDuration(session: TrackingSession, now: number) {
  return calculateRecordedDuration(session, now);
}
