import type { MemoWrite } from "../../application/contracts/work-entry-memo";
import { MemoConflictError } from "../../application/errors/memo-conflict-error";

export type MemoSnapshot = {
  memo: string;
  status: "saved" | "pending" | "saving" | "error" | "conflict";
  error?: string;
  conflict?: string;
};

export type MemoTarget = {
  id: string;
  categoryId: string;
  memberId?: string;
};

type Entry = {
  target?: MemoTarget;
  snapshot: MemoSnapshot;
  base: string;
  dirty: boolean;
  job?: MemoWrite;
  saving?: Promise<boolean>;
  timer?: ReturnType<typeof setTimeout>;
  draftTimer?: ReturnType<typeof setTimeout>;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class WorkEntryMemoStore {
  private entries = new Map<string, Entry>();
  private editing = new Set<string>();
  private listeners = new Set<() => void>();
  constructor(
    private scope: string,
    private write: (input: MemoWrite) => Promise<{
      id: string;
      memo: string;
      memoRevision?: number;
    }>,
    private saved: (id: string, memo: string, revision?: number) => string | void,
    private storage?: StorageLike,
    private delay = 800,
  ) {}
  private key(id: string) {
    return `punch-in:session-memo:${encodeURIComponent(this.scope)}:${encodeURIComponent(id)}`;
  }
  private entry(id: string, memo = "", target?: MemoTarget) {
    let e = this.entries.get(id);
    if (e) {
      if (target) e.target = target;
      return e;
    }
    e = { target, snapshot: { memo, status: "saved" }, base: memo, dirty: false };
    try {
      const d = JSON.parse(this.storage?.getItem(this.key(id)) ?? "null");
      if (d && typeof d.memo === "string" && d.memo.length <= 2000 && typeof d.base === "string") {
        e.snapshot = { memo: d.memo, status: "pending" };
        e.base = d.base;
        e.dirty = true;
        if (
          d.job?.id === (target?.id ?? id) &&
          d.job?.categoryId === target?.categoryId &&
          d.job?.memberId === target?.memberId &&
          typeof d.job.memo === "string" &&
          typeof d.job.expectedMemo === "string"
        )
          e.job = d.job;
      }
    } catch {
      /* Browser drafts are optional. */
    }
    this.entries.set(id, e);
    return e;
  }
  setEditing(id: string, active: boolean) {
    if (active) this.editing.add(id);
    else this.editing.delete(id);
  }
  isEditing(id: string) {
    return this.editing.has(id);
  }
  getSnapshot = (id: string, memo = "", target?: MemoTarget) =>
    this.entry(id, memo, target).snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(e: Entry, patch: Partial<MemoSnapshot>) {
    e.snapshot = { ...e.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }
  private persist(id: string, e: Entry) {
    clearTimeout(e.draftTimer);
    try {
      if (e.dirty || e.job)
        this.storage?.setItem(
          this.key(id),
          JSON.stringify({ memo: e.snapshot.memo, base: e.base, job: e.job }),
        );
      else this.storage?.removeItem(this.key(id));
    } catch {
      /* Autosave still works without local storage. */
    }
  }
  private schedule(id: string, e: Entry) {
    clearTimeout(e.timer);
    e.timer = setTimeout(() => {
      void this.flush(id);
    }, this.delay);
  }
  observe(id: string, memo: string, target?: MemoTarget) {
    const e = this.entry(id, memo, target);
    if (!e.dirty && !e.job && e.base !== memo) {
      e.base = memo;
      this.publish(e, { memo, status: "saved", error: undefined, conflict: undefined });
    }
    if (e.dirty && e.snapshot.status === "pending") this.schedule(id, e);
  }
  edit(id: string, memo: string) {
    if (memo.length > 2000) return;
    const e = this.entry(id);
    e.dirty = memo !== e.base || !!e.job;
    this.publish(e, {
      memo,
      status: e.snapshot.conflict !== undefined ? "conflict" : e.dirty ? "pending" : "saved",
      error: undefined,
    });
    clearTimeout(e.draftTimer);
    e.draftTimer = setTimeout(() => this.persist(id, e), 150);
    this.schedule(id, e);
  }
  async flush(id: string): Promise<boolean> {
    const e = this.entry(id);
    clearTimeout(e.timer);
    this.persist(id, e);
    if (e.saving) {
      const ok = await e.saving;
      return ok && e.dirty ? this.flush(id) : ok;
    }
    if (e.snapshot.conflict !== undefined) return false;
    if (!e.dirty && !e.job) return true;
    const job = e.job ?? {
      id: e.target?.id ?? id,
      ...(e.target
        ? {
            categoryId: e.target.categoryId,
            ...(e.target.memberId ? { memberId: e.target.memberId } : {}),
          }
        : {}),
      memo: e.snapshot.memo,
      expectedMemo: e.base,
    };
    e.job = job;
    this.persist(id, e);
    this.publish(e, { status: "saving", error: undefined });
    e.saving = (async () => {
      try {
        const result = await this.write(job);
        e.base = result.memo;
        e.job = undefined;
        e.dirty = e.snapshot.memo !== result.memo;
        this.publish(e, { status: e.dirty ? "pending" : "saved", error: undefined });
        this.persist(id, e);
        const remote = this.saved(id, result.memo, result.memoRevision);
        if (!e.dirty && typeof remote === "string" && remote !== result.memo) {
          e.base = remote;
          this.publish(e, { memo: remote });
        }
        return true;
      } catch (error) {
        if (error instanceof MemoConflictError) {
          e.job = undefined;
          this.publish(e, { status: "conflict", conflict: error.currentMemo, error: undefined });
        } else
          this.publish(e, {
            status: "error",
            error: error instanceof Error ? error.message : "保存できませんでした",
          });
        this.persist(id, e);
        return false;
      }
    })().finally(() => {
      e.saving = undefined;
    });
    const ok = await e.saving;
    return ok && e.dirty ? this.flush(id) : ok;
  }
  resolve(id: string, mine: boolean) {
    const e = this.entry(id);
    const remote = e.snapshot.conflict;
    if (remote === undefined) return;
    e.base = remote;
    e.job = undefined;
    e.dirty = mine && e.snapshot.memo !== remote;
    this.publish(e, {
      memo: mine ? e.snapshot.memo : remote,
      status: e.dirty ? "pending" : "saved",
      conflict: undefined,
      error: undefined,
    });
    this.persist(id, e);
    if (e.dirty) void this.flush(id);
    else this.saved(id, e.snapshot.memo);
  }
  // Call only after a successful flush and record deletion.
  discard(id: string) {
    const e = this.entries.get(id);
    if (e) {
      clearTimeout(e.timer);
      clearTimeout(e.draftTimer);
    }
    this.entries.delete(id);
    this.editing.delete(id);
    try {
      this.storage?.removeItem(this.key(id));
    } catch {
      /* Deleted records need no browser draft. */
    }
  }
  async flushAll() {
    return (await Promise.all([...this.entries.keys()].map((id) => this.flush(id)))).every(Boolean);
  }
  hasUnsaved() {
    return [...this.entries.values()].some((e) => e.dirty || e.job);
  }
  persistAll() {
    this.entries.forEach((e, id) => this.persist(id, e));
  }
  dispose() {
    this.persistAll();
    this.entries.forEach((e) => {
      clearTimeout(e.timer);
      clearTimeout(e.draftTimer);
    });
  }
}
