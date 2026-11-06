import type { TrackingSession } from "./tracking-session";
import {
  getIntervalEntryIds,
  getWorkEntries,
  getWorkEntryId,
  SessionWork,
  TrackingControl,
  WorkEntry,
} from "./work-entry";
import { getWorkEntryIntervals, getWorkEntryTimeRange } from "./work-entry-intervals";

export function applyTrackingCommand(
  session: TrackingSession,
  control: TrackingControl,
  categoryId: string,
  now: number,
  newEntryId?: string,
): TrackingSession {
  if (session.endedAt !== null) throw new Error("終了した記録は操作できません");
  // Stored order is canonical: the first entry mirrors the session category and memo.
  const w: SessionWork = session.work
    ? structuredClone(session.work)
    : {
        version: 1,
        mode: "auto",
        members: getWorkEntries(session),
        intervals: [{ start: session.startedAt, end: null, categoryIds: [session.categoryId] }],
      };
  const at = Math.max(
    now,
    session.startedAt,
    session.updatedAt,
    ...w.intervals.map((interval) => interval.end ?? interval.start),
  );
  for (const m of w.members) {
    const range = getWorkEntryTimeRange(session, getWorkEntryId(m));
    if (m.startedAt === undefined && range.start !== null) m.startedAt = range.start;
    if (m.endedAt === undefined) {
      if (m.state !== "finished") m.endedAt = null;
      else if (range.end !== null) m.endedAt = range.end;
    }
  }
  const member = w.members.findLast((entry) => entry.categoryId === categoryId);
  const finish = (entry: WorkEntry) => {
    if (entry.state === "finished") return;
    entry.endedAt =
      entry.state === "paused"
        ? (getWorkEntryIntervals(session, getWorkEntryId(entry)).at(-1)?.end ??
          entry.startedAt ??
          at)
        : at;
    entry.state = "finished";
  };
  if (control === "pauseAll") {
    const active = w.members.filter((entry) => entry.state === "active");
    if (!active.length) throw new Error("計測中の作業がありません");
    w.batchPausedCategoryIds = [
      ...new Set([...(w.batchPausedCategoryIds ?? []), ...active.map((entry) => entry.categoryId)]),
    ];
    active.forEach((entry) => {
      entry.state = "paused";
    });
  } else if (control === "resumeAll") {
    const ids = new Set(w.batchPausedCategoryIds ?? []);
    if (!w.members.some((entry) => ids.has(entry.categoryId) && entry.state === "paused"))
      throw new Error("まとめて再開する作業がありません");
    w.members.forEach((entry) => {
      if (ids.has(entry.categoryId) && entry.state === "paused") entry.state = "active";
    });
    delete w.batchPausedCategoryIds;
  } else if (control === "join") {
    if (member?.state === "active") return session;
    if (member?.state === "paused") member.state = "active";
    else {
      if (w.members.length >= 1000)
        throw new Error("この記録を終了して、新しい記録を開始してください");
      if (!member && new Set(w.members.map((entry) => entry.categoryId)).size >= 50)
        throw new Error("並行する作業は50種類までです");
      let id: string | undefined;
      if (member) {
        id = newEntryId ?? `entry-${w.members.length}`;
        while (w.members.some((entry) => getWorkEntryId(entry) === id)) id += "-new";
      }
      w.members.push({
        ...(id ? { id } : {}),
        categoryId,
        memo: "",
        state: "active",
        weight: 1,
        startedAt: at,
        endedAt: null,
      });
    }
  } else if (control === "end") w.members.forEach(finish);
  else {
    if (!member) throw new Error("作業が見つかりません");
    if (control === "pause" && member.state !== "active")
      throw new Error("計測中の作業を選択してください");
    if (control === "resume" && member.state !== "paused")
      throw new Error("一時停止中の作業を選択してください");
    if (control === "finish") finish(member);
    else member.state = control === "pause" ? "paused" : "active";
  }
  pruneBatchPause(w);
  const open = w.intervals.find((interval) => interval.end === null);
  if (open) {
    open.end = at;
    if (open.end === open.start) w.intervals = w.intervals.filter((interval) => interval !== open);
  }
  const active = w.members.filter((entry) => entry.state === "active");
  if (active.length)
    w.intervals.push({
      start: at,
      end: null,
      categoryIds: active.map((entry) => entry.categoryId),
      ...(active.some((entry) => entry.id) ? { memberIds: active.map(getWorkEntryId) } : {}),
    });
  if (w.intervals.length > 10000)
    throw new Error("この記録を終了して、新しい記録を開始してください");
  const endedAt = w.members.every((entry) => entry.state === "finished")
    ? Math.max(
        session.startedAt,
        ...w.members.map((entry) => entry.endedAt ?? session.startedAt),
        ...w.intervals.map((interval) => interval.end ?? session.startedAt),
      )
    : null;
  return { ...session, work: w, endedAt, updatedAt: at };
}

function pruneBatchPause(work: SessionWork) {
  if (!work.batchPausedCategoryIds) return;
  work.batchPausedCategoryIds = work.batchPausedCategoryIds.filter((id) =>
    work.members.some((entry) => entry.categoryId === id && entry.state === "paused"),
  );
  if (!work.batchPausedCategoryIds.length) delete work.batchPausedCategoryIds;
}

/** Remove one entry. Shared intervals remain and automatic credits are redistributed. */
export function removeWorkEntry(session: TrackingSession, id: string, at: number): TrackingSession {
  if (!session.work || session.work.members.length < 2)
    throw new Error("最後の作業は記録全体の削除を使用してください");
  if (!session.work.members.some((entry) => getWorkEntryId(entry) === id))
    throw new Error("作業が見つかりません");
  const w = structuredClone(session.work);
  w.members = w.members.filter((entry) => getWorkEntryId(entry) !== id);
  pruneBatchPause(w);
  w.intervals = w.intervals
    .map((interval) => {
      const indexes = getIntervalEntryIds(interval)
        .map((key, k) => (key === id ? -1 : k))
        .filter((k) => k !== -1);
      return {
        ...interval,
        categoryIds: indexes.map((k) => interval.categoryIds[k]),
        ...(interval.memberIds ? { memberIds: indexes.map((k) => interval.memberIds![k]) } : {}),
      };
    })
    .filter((i) => i.categoryIds.length);
  if (w.members.every((entry) => entry.weight === 0))
    w.members.forEach((entry) => {
      entry.weight = 1;
    });
  const finished = w.members.every((entry) => entry.state === "finished");
  const lastEnd = Math.max(
    session.startedAt,
    ...w.members.map(
      (entry) =>
        getWorkEntryTimeRange(session, getWorkEntryId(entry)).end ??
        getWorkEntryTimeRange(session, getWorkEntryId(entry)).start ??
        session.startedAt,
    ),
  );
  return {
    ...session,
    categoryId: w.members[0].categoryId,
    memo: w.members[0].memo,
    work: w,
    endedAt: session.endedAt ?? (finished ? lastEnd : null),
    updatedAt: at,
  };
}
