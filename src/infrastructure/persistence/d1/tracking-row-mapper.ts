import type { TrackingSession } from "../../../domain/tracking/tracking-session";

export function mapTrackingSessionRow(s: Record<string, unknown>): TrackingSession {
  return {
    id: String(s.id),
    categoryId: String(s.category_id),
    startedAt: Number(s.started_at),
    endedAt: s.ended_at === null ? null : Number(s.ended_at),
    businessDay: String(s.business_day),
    dayStart: Number(s.day_start),
    timezone: String(s.timezone),
    memo: String(s.memo),
    ...(s.work ? { work: JSON.parse(String(s.work)) } : {}),
    createdAt: Number(s.created_at),
    updatedAt: Number(s.updated_at),
  };
}
