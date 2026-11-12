import { getWorkEntryId, type TrackingInterval, type WorkEntry } from "./work-entry";

export type ParticipationPeriod = { id: string; start: number; end: number | null };

/** Split at every participation change, preserving canonical entry order and pause gaps. */
export function rebuildTrackingIntervals(
  entries: WorkEntry[],
  periods: ParticipationPeriod[],
): TrackingInterval[] {
  const events = new Map<number, { start: string[]; end: string[] }>();
  function event(at: number) {
    let value = events.get(at);
    if (!value) {
      value = { start: [], end: [] };
      events.set(at, value);
    }
    return value;
  }
  for (const period of periods) {
    if (period.start === period.end) continue;
    event(period.start).start.push(period.id);
    if (period.end !== null) event(period.end).end.push(period.id);
  }
  const ordered = [...events.keys()].sort((a, b) => a - b);
  const byId = new Map(entries.map((entry) => [getWorkEntryId(entry), entry]));
  const order = new Map(entries.map((entry, index) => [getWorkEntryId(entry), index]));
  const active = new Set<string>();
  const intervals: TrackingInterval[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const at = ordered[index];
    const changes = events.get(at)!;
    changes.end.forEach((id) => active.delete(id));
    changes.start.forEach((id) => active.add(id));
    if (!active.size) continue;
    const ids = [...active].sort((a, b) => order.get(a)! - order.get(b)!);
    const categoryIds = ids.map((id) => byId.get(id)!.categoryId);
    if (new Set(categoryIds).size !== categoryIds.length)
      throw new Error("同じ作業の記録と時間が重なっています");
    intervals.push({
      start: at,
      end: ordered[index + 1] ?? null,
      categoryIds,
      ...(ids.some((id) => byId.get(id)?.id) ? { memberIds: ids } : {}),
    });
  }
  if (intervals.length > 10000) throw new Error("計測区間が多すぎます");
  return intervals;
}
