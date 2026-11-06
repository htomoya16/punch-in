import { controlWork, currentMember, preserveMemos, realTime } from "./work";
import type { AppState, PendingPunch, PunchDelta, Session } from "./model";
import { businessDay } from "./time";

/** Render a provisional result without changing the last confirmed state or revision. */
export function projectPunch(state: AppState, pending: PendingPunch): AppState {
  try {
    return projectPunchUnchecked(state, pending);
  } catch {
    return state;
  }
}
function projectPunchUnchecked(state: AppState, pending: PendingPunch): AppState {
  if (state.revision !== pending.baseRevision) return state;
  if (pending.workId && pending.control) {
    const current = state.sessions.find((s) => s.id === pending.workId);
    if (!current) return state;
    const changed = controlWork(
      current,
      pending.control,
      pending.categoryId,
      pending.at,
      pending.mutationId,
    );
    return { ...state, sessions: state.sessions.map((s) => (s.id === changed.id ? changed : s)) };
  }
  const running = state.sessions.find((s) => s.endedAt === null);
  const at = Math.max(pending.at, running?.startedAt ?? 0, state.sessions[0]?.endedAt ?? 0);
  if (running && (running.work || running.categoryId !== pending.categoryId)) {
    const m = currentMember(running, pending.categoryId);
    const changed = controlWork(
      running,
      m?.state === "active" ? "finish" : m?.state === "paused" ? "resume" : "join",
      pending.categoryId,
      at,
      pending.mutationId,
    );
    return { ...state, sessions: state.sessions.map((s) => (s.id === changed.id ? changed : s)) };
  }
  const sessions = state.sessions.map((s) =>
    s.id === running?.id ? { ...s, endedAt: at, updatedAt: at } : s,
  );
  if (running?.categoryId !== pending.categoryId)
    sessions.unshift({
      id: `pending:${pending.mutationId}`,
      categoryId: pending.categoryId,
      startedAt: at,
      endedAt: null,
      businessDay: businessDay(at, state.preferences.dayStart, state.preferences.timezone),
      dayStart: state.preferences.dayStart,
      timezone: state.preferences.timezone,
      memo: "",
      createdAt: at,
      updatedAt: at,
    });
  return { ...state, sessions };
}

/** A gap requires a full refresh. A delayed response must never roll back newer data. */
export function applyPunchDelta(state: AppState, delta: PunchDelta): AppState | null {
  if (state.revision >= delta.revision) return state;
  if (state.revision !== delta.baseRevision || delta.revision !== delta.baseRevision + 1)
    return null;
  const replacements = new Map(delta.sessions.map((s) => [s.id, s]));
  const existing = new Set(state.sessions.map((s) => s.id));
  return {
    ...state,
    revision: delta.revision,
    serverNow: delta.serverNow,
    sessions: [
      ...delta.sessions.filter((s) => !existing.has(s.id)),
      ...state.sessions.map((s) => {
        const changed = replacements.get(s.id);
        return changed ? preserveMemos(changed, s) : s;
      }),
    ],
  };
}

export function completedTotal(sessions: Session[]) {
  return sessions.reduce((total, s) => total + (s.endedAt === null ? 0 : realTime(s, 0)), 0);
}
