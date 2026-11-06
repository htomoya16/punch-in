import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { periodRange, shiftDay } from "../../shared/time/calendar";

export function weekDays(anchor: string, sessions: TrackingSession[]) {
  const [from] = periodRange("week", anchor);
  const byDay = new Map<string, TrackingSession[]>();
  for (const s of sessions) {
    const rows = byDay.get(s.businessDay) ?? [];
    rows.push(s);
    byDay.set(s.businessDay, rows);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(from, i);
    return {
      day,
      sessions: [...(byDay.get(day) ?? [])].sort(
        (a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id),
      ),
    };
  });
}
