import type { Session } from "./model";

export type WorkMember = {
  id?: string;
  categoryId: string;
  memo: string;
  state: "active" | "paused" | "finished";
  weight: number;
  manualMs?: number;
  startedAt?: number;
  endedAt?: number | null;
};
export type WorkInterval = {
  start: number;
  end: number | null;
  categoryIds: string[];
  memberIds?: string[];
};
export type WorkGroup = {
  version: 1;
  mode: "auto" | "ratio" | "manual";
  batchPausedCategoryIds?: string[];
  members: WorkMember[];
  intervals: WorkInterval[];
};
export type WorkControl = "join" | "pause" | "resume" | "finish" | "end" | "pauseAll" | "resumeAll";
/** Old entries retain their category ID as their stable identity. */
export function memberKey(m: WorkMember) {
  return m.id ?? m.categoryId;
}
export function members(s: Session): WorkMember[] {
  return (
    s.work?.members ?? [
      {
        categoryId: s.categoryId,
        memo: s.memo,
        state: s.endedAt === null ? "active" : "finished",
        weight: 1,
      },
    ]
  );
}
export function currentMember(s: Session, categoryId: string) {
  return members(s).findLast((m) => m.categoryId === categoryId);
}
export function includesCategory(s: Session, id: string) {
  return members(s).some((m) => m.categoryId === id);
}
export function intervalMembers(i: WorkInterval) {
  return i.memberIds ?? i.categoryIds;
}
export function realTime(s: Session, now: number, category = "") {
  return s.work
    ? s.work.intervals
        .filter((i) => !category || i.categoryIds.includes(category))
        .reduce((n, i) => n + Math.max(0, (i.end ?? now) - i.start), 0)
    : category && s.categoryId !== category
      ? 0
      : Math.max(0, (s.endedAt ?? now) - s.startedAt);
}

const completedEntries = new WeakMap<Session, Map<string, number>>(),
  completedCategories = new WeakMap<Session, Map<string, number>>();
export function entryAllocations(s: Session, now: number): Map<string, number> {
  if (s.endedAt === null) return computeEntries(s, now);
  let cached = completedEntries.get(s);
  if (!cached) {
    cached = computeEntries(s, 0);
    completedEntries.set(s, cached);
  }
  return cached;
}
function computeEntries(s: Session, now: number): Map<string, number> {
  if (!s.work) return new Map([[s.categoryId, realTime(s, now)]]);
  const w = s.work,
    values = new Map(w.members.map((m) => [memberKey(m), 0]));
  if (w.mode === "manual") return new Map(w.members.map((m) => [memberKey(m), m.manualMs ?? 0]));
  if (w.mode === "ratio") {
    const total = realTime(s, now),
      weight = w.members.reduce((n, m) => n + m.weight, 0);
    let used = 0,
      cumulative = 0;
    for (const m of w.members) {
      cumulative += m.weight;
      const target = Math.floor((total * cumulative) / weight);
      values.set(memberKey(m), target - used);
      used = target;
    }
    return values;
  }
  for (const i of w.intervals) {
    const ids = intervalMembers(i),
      elapsed = Math.max(0, (i.end ?? now) - i.start),
      part = Math.floor(elapsed / ids.length);
    ids.forEach((id, index) =>
      values.set(
        id,
        (values.get(id) ?? 0) + part + (index === 0 ? elapsed - part * ids.length : 0),
      ),
    );
  }
  return values;
}
export function categoryAllocations(s: Session, entries: ReadonlyMap<string, number>) {
  const values = new Map<string, number>();
  for (const m of members(s))
    values.set(m.categoryId, (values.get(m.categoryId) ?? 0) + (entries.get(memberKey(m)) ?? 0));
  return values;
}
export function allocations(s: Session, now: number): Map<string, number> {
  if (s.endedAt === null) return categoryAllocations(s, entryAllocations(s, now));
  let cached = completedCategories.get(s);
  if (!cached) {
    cached = categoryAllocations(s, entryAllocations(s, 0));
    completedCategories.set(s, cached);
  }
  return cached;
}
export function creditedTime(s: Session, now: number, category = "") {
  const values = allocations(s, now);
  return category ? (values.get(category) ?? 0) : [...values.values()].reduce((a, b) => a + b, 0);
}

export function controlWork(
  s: Session,
  control: WorkControl,
  categoryId: string,
  now: number,
  newEntryId?: string,
): Session {
  if (s.endedAt !== null) throw new Error("終了した記録は操作できません");
  const w: WorkGroup = s.work
    ? structuredClone(s.work)
    : {
        version: 1,
        mode: "auto",
        members: members(s),
        intervals: [{ start: s.startedAt, end: null, categoryIds: [s.categoryId] }],
      };
  const at = Math.max(now, s.startedAt, s.updatedAt, ...w.intervals.map((i) => i.end ?? i.start));
  for (const m of w.members) {
    const range = memberRange(s, memberKey(m));
    if (m.startedAt === undefined && range.start !== null) m.startedAt = range.start;
    if (m.endedAt === undefined) {
      if (m.state !== "finished") m.endedAt = null;
      else if (range.end !== null) m.endedAt = range.end;
    }
  }
  const member = w.members.findLast((m) => m.categoryId === categoryId);
  const finish = (m: WorkMember) => {
    if (m.state === "finished") return;
    m.endedAt =
      m.state === "paused"
        ? (memberIntervals(s, memberKey(m)).at(-1)?.end ?? m.startedAt ?? at)
        : at;
    m.state = "finished";
  };
  if (control === "pauseAll") {
    const active = w.members.filter((m) => m.state === "active");
    if (!active.length) throw new Error("計測中の作業がありません");
    w.batchPausedCategoryIds = [
      ...new Set([...(w.batchPausedCategoryIds ?? []), ...active.map((m) => m.categoryId)]),
    ];
    active.forEach((m) => {
      m.state = "paused";
    });
  } else if (control === "resumeAll") {
    const ids = new Set(w.batchPausedCategoryIds ?? []);
    if (!w.members.some((m) => ids.has(m.categoryId) && m.state === "paused"))
      throw new Error("まとめて再開する作業がありません");
    w.members.forEach((m) => {
      if (ids.has(m.categoryId) && m.state === "paused") m.state = "active";
    });
    delete w.batchPausedCategoryIds;
  } else if (control === "join") {
    if (member?.state === "active") return s;
    if (member?.state === "paused") member.state = "active";
    else {
      if (w.members.length >= 1000)
        throw new Error("この記録を終了して、新しい記録を開始してください");
      if (!member && new Set(w.members.map((m) => m.categoryId)).size >= 50)
        throw new Error("並行する作業は50種類までです");
      let id: string | undefined;
      if (member) {
        id = newEntryId ?? `entry-${w.members.length}`;
        while (w.members.some((m) => memberKey(m) === id)) id += "-new";
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
  const open = w.intervals.find((i) => i.end === null);
  if (open) {
    open.end = at;
    if (open.end === open.start) w.intervals = w.intervals.filter((i) => i !== open);
  }
  const active = w.members.filter((m) => m.state === "active");
  if (active.length)
    w.intervals.push({
      start: at,
      end: null,
      categoryIds: active.map((m) => m.categoryId),
      ...(active.some((m) => m.id) ? { memberIds: active.map(memberKey) } : {}),
    });
  if (w.intervals.length > 10000)
    throw new Error("この記録を終了して、新しい記録を開始してください");
  const endedAt = w.members.every((m) => m.state === "finished")
    ? Math.max(
        s.startedAt,
        ...w.members.map((m) => m.endedAt ?? s.startedAt),
        ...w.intervals.map((i) => i.end ?? s.startedAt),
      )
    : null;
  return { ...s, work: w, endedAt, updatedAt: at };
}
function pruneBatchPause(w: WorkGroup) {
  if (!w.batchPausedCategoryIds) return;
  w.batchPausedCategoryIds = w.batchPausedCategoryIds.filter((id) =>
    w.members.some((m) => m.categoryId === id && m.state === "paused"),
  );
  if (!w.batchPausedCategoryIds.length) delete w.batchPausedCategoryIds;
}
export function memoKey(s: Session, id: string) {
  return s.work ? `work:${JSON.stringify([s.id, id])}` : s.id;
}
export function readMemo(s: Session, key: string) {
  return key === s.id
    ? s.memo
    : s.work?.members.find((m) => memoKey(s, memberKey(m)) === key)?.memo;
}
export function setMemo(s: Session, key: string, memo: string): Session {
  if (!s.work) return key === s.id ? { ...s, memo } : s;
  const member = s.work.members.find(
    (m, i) => memoKey(s, memberKey(m)) === key || (key === s.id && i === 0),
  );
  if (!member) return s;
  return {
    ...s,
    memo: member === s.work.members[0] ? memo : s.memo,
    work: { ...s.work, members: s.work.members.map((m) => (m === member ? { ...m, memo } : m)) },
  };
}
export function preserveMemos(next: Session, old: Session) {
  let result = next;
  for (const m of members(old)) result = setMemo(result, memoKey(result, memberKey(m)), m.memo);
  return result;
}
export function participation(s: Session) {
  return s.work
    ? s.work.intervals.flatMap((i, index) =>
        i.categoryIds.map((categoryId, k) => ({
          categoryId,
          memberId: intervalMembers(i)[k],
          start: i.start,
          end: i.end,
          index,
        })),
      )
    : [
        {
          categoryId: s.categoryId,
          memberId: s.categoryId,
          start: s.startedAt,
          end: s.endedAt,
          index: 0,
        },
      ];
}
const periodsCache = new WeakMap<Session, Map<string, { start: number; end: number | null }[]>>();
export function memberIntervals(s: Session, id: string) {
  let map = periodsCache.get(s);
  if (!map) {
    map = new Map();
    for (const interval of participation(s)) {
      const row = map.get(interval.memberId) ?? [],
        last = row.at(-1);
      if (last && last.end === interval.start) last.end = interval.end;
      else row.push({ start: interval.start, end: interval.end });
      map.set(interval.memberId, row);
    }
    periodsCache.set(s, map);
  }
  return map.get(id) ?? [];
}
export function memberRange(s: Session, id: string) {
  const m = members(s).find((m) => memberKey(m) === id),
    periods = memberIntervals(s, id);
  return {
    start: m?.startedAt ?? periods[0]?.start ?? (id === s.categoryId ? s.startedAt : null),
    end:
      m?.state === "finished"
        ? (m.endedAt ?? periods.at(-1)?.end ?? (!s.work ? s.endedAt : null))
        : null,
    inferredEnd: !!s.work && m?.state === "finished" && m.endedAt === undefined,
  };
}
/** Remove one entry. Shared intervals remain and automatic credits are redistributed. */
export function removeWork(s: Session, id: string, at: number): Session {
  if (!s.work || s.work.members.length < 2)
    throw new Error("最後の作業は記録全体の削除を使用してください");
  if (!s.work.members.some((m) => memberKey(m) === id)) throw new Error("作業が見つかりません");
  const w = structuredClone(s.work);
  w.members = w.members.filter((m) => memberKey(m) !== id);
  pruneBatchPause(w);
  w.intervals = w.intervals
    .map((i) => {
      const indexes = intervalMembers(i)
        .map((key, k) => (key === id ? -1 : k))
        .filter((k) => k !== -1);
      return {
        ...i,
        categoryIds: indexes.map((k) => i.categoryIds[k]),
        ...(i.memberIds ? { memberIds: indexes.map((k) => i.memberIds![k]) } : {}),
      };
    })
    .filter((i) => i.categoryIds.length);
  if (w.members.every((m) => m.weight === 0))
    w.members.forEach((m) => {
      m.weight = 1;
    });
  const finished = w.members.every((m) => m.state === "finished"),
    lastEnd = Math.max(
      s.startedAt,
      ...w.members.map(
        (m) =>
          memberRange(s, memberKey(m)).end ?? memberRange(s, memberKey(m)).start ?? s.startedAt,
      ),
    );
  return {
    ...s,
    categoryId: w.members[0].categoryId,
    memo: w.members[0].memo,
    work: w,
    endedAt: s.endedAt ?? (finished ? lastEnd : null),
    updatedAt: at,
  };
}
