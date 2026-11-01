import type { AppState, PendingPunch, PunchDelta, Session } from "./model";
import { businessDay } from "./time";

/** Render a provisional result without changing the last confirmed state or revision. */
export function projectPunch(state: AppState, pending: PendingPunch): AppState {
  if (state.revision !== pending.baseRevision) return state;
  const running = state.sessions.find(s => s.endedAt === null);
  const at = Math.max(pending.at, running?.startedAt ?? 0, state.sessions[0]?.endedAt ?? 0);
  const sessions = state.sessions.map(s => s.id === running?.id ? { ...s, endedAt: at, updatedAt: at } : s);
  if (running?.categoryId !== pending.categoryId) sessions.unshift({
    id: `pending:${pending.mutationId}`, categoryId: pending.categoryId,
    startedAt: at, endedAt: null, businessDay: businessDay(at, state.preferences.dayStart, state.preferences.timezone),
    dayStart: state.preferences.dayStart, timezone: state.preferences.timezone, memo: "", createdAt: at, updatedAt: at,
  });
  return { ...state, sessions };
}

/** A gap requires a full refresh. A delayed response must never roll back newer data. */
export function applyPunchDelta(state: AppState, delta: PunchDelta): AppState | null {
  if (state.revision >= delta.revision) return state;
  if (state.revision !== delta.baseRevision || delta.revision !== delta.baseRevision + 1) return null;
  const replacements = new Map(delta.sessions.map(s => [s.id, s]));
  const existing = new Set(state.sessions.map(s => s.id));
  return { ...state, revision: delta.revision, serverNow: delta.serverNow,
    sessions: [...delta.sessions.filter(s => !existing.has(s.id)), ...state.sessions.map(s => replacements.get(s.id) ?? s)],
  };
}

export function completedTotal(sessions: Session[]) {
  return sessions.reduce((total, s) => total + (s.endedAt === null ? 0 : Math.max(0, s.endedAt - s.startedAt)), 0);
}
