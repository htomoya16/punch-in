import type { TrackingSession } from "./tracking-session";
import { getIntervalEntryIds, getWorkEntries, getWorkEntryId } from "./work-entry";

export function calculateRecordedDuration(session: TrackingSession, now: number, category = "") {
  return session.work
    ? session.work.intervals
        .filter((interval) => !category || interval.categoryIds.includes(category))
        .reduce((n, interval) => n + Math.max(0, (interval.end ?? now) - interval.start), 0)
    : category && session.categoryId !== category
      ? 0
      : Math.max(0, (session.endedAt ?? now) - session.startedAt);
}

const completedEntries = new WeakMap<TrackingSession, Map<string, number>>();
const completedCategories = new WeakMap<TrackingSession, Map<string, number>>();

export function calculateAllocatedDurationsByEntry(
  session: TrackingSession,
  now: number,
): Map<string, number> {
  if (session.endedAt === null) return computeEntries(session, now);
  let cached = completedEntries.get(session);
  if (!cached) {
    cached = computeEntries(session, 0);
    completedEntries.set(session, cached);
  }
  return cached;
}

function computeEntries(session: TrackingSession, now: number): Map<string, number> {
  if (!session.work)
    return new Map([[session.categoryId, calculateRecordedDuration(session, now)]]);
  const w = session.work;
  const values = new Map(w.members.map((entry) => [getWorkEntryId(entry), 0]));
  if (w.mode === "manual")
    return new Map(w.members.map((entry) => [getWorkEntryId(entry), entry.manualMs ?? 0]));
  if (w.mode === "ratio") {
    const total = calculateRecordedDuration(session, now);
    const weight = w.members.reduce((n, entry) => n + entry.weight, 0);
    let used = 0;
    let cumulative = 0;
    for (const m of w.members) {
      cumulative += m.weight;
      const target = Math.floor((total * cumulative) / weight);
      values.set(getWorkEntryId(m), target - used);
      used = target;
    }
    return values;
  }
  for (const i of w.intervals) {
    const ids = getIntervalEntryIds(i);
    const elapsed = Math.max(0, (i.end ?? now) - i.start);
    const part = Math.floor(elapsed / ids.length);
    ids.forEach((id, index) =>
      values.set(
        id,
        (values.get(id) ?? 0) + part + (index === 0 ? elapsed - part * ids.length : 0),
      ),
    );
  }
  return values;
}

export function sumAllocatedDurationsByCategory(
  session: TrackingSession,
  entries: ReadonlyMap<string, number>,
) {
  const values = new Map<string, number>();
  for (const m of getWorkEntries(session))
    values.set(
      m.categoryId,
      (values.get(m.categoryId) ?? 0) + (entries.get(getWorkEntryId(m)) ?? 0),
    );
  return values;
}

export function calculateAllocatedDurationsByCategory(
  session: TrackingSession,
  now: number,
): Map<string, number> {
  if (session.endedAt === null)
    return sumAllocatedDurationsByCategory(
      session,
      calculateAllocatedDurationsByEntry(session, now),
    );
  let cached = completedCategories.get(session);
  if (!cached) {
    cached = sumAllocatedDurationsByCategory(
      session,
      calculateAllocatedDurationsByEntry(session, 0),
    );
    completedCategories.set(session, cached);
  }
  return cached;
}

export function calculateAllocatedDuration(session: TrackingSession, now: number, category = "") {
  const values = calculateAllocatedDurationsByCategory(session, now);
  return category ? (values.get(category) ?? 0) : [...values.values()].reduce((a, b) => a + b, 0);
}
