import type { TrackingSession } from "./tracking-session";
import { getWorkEntries, getWorkEntryId } from "./work-entry";

export function getWorkEntryMemoKey(session: TrackingSession, id: string) {
  return session.work ? `work:${JSON.stringify([session.id, id])}` : session.id;
}

export function findWorkEntryMemo(session: TrackingSession, key: string) {
  return key === session.id
    ? session.memo
    : session.work?.members.find(
        (entry) => getWorkEntryMemoKey(session, getWorkEntryId(entry)) === key,
      )?.memo;
}

export function updateWorkEntryMemo(
  session: TrackingSession,
  key: string,
  memo: string,
): TrackingSession {
  if (!session.work) return key === session.id ? { ...session, memo } : session;
  const member = session.work.members.find(
    (entry, i) =>
      getWorkEntryMemoKey(session, getWorkEntryId(entry)) === key ||
      (key === session.id && i === 0),
  );
  if (!member) return session;
  return {
    ...session,
    memo: member === session.work.members[0] ? memo : session.memo,
    work: {
      ...session.work,
      members: session.work.members.map((entry) => (entry === member ? { ...entry, memo } : entry)),
    },
  };
}

export function preserveWorkEntryMemos(next: TrackingSession, old: TrackingSession) {
  let result = next;
  for (const m of getWorkEntries(old))
    result = updateWorkEntryMemo(result, getWorkEntryMemoKey(result, getWorkEntryId(m)), m.memo);
  return result;
}
