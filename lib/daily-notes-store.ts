import { noteSaveKey } from "./note-templates";
import { isNoteDocument, type NoteDocument } from "./note-document";
import { emptyDailyNote, MAX_NOTE_LENGTH, type DailyNote, type NoteWrite } from "./daily-note";

export class NoteConflictError extends Error {
  constructor(public current: DailyNote) {
    super("別の画面でメモが更新されています");
  }
}
export type NoteTransport = {
  read(day: string, version?: number, initialize?: boolean): Promise<DailyNote | null>;
  write(input: NoteWrite): Promise<DailyNote>;
};
export type NoteSnapshot = DailyNote & {
  loaded: boolean;
  status: "loading" | "saved" | "pending" | "saving" | "error" | "conflict";
  error?: string;
  conflict?: DailyNote;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Entry = {
  snapshot: NoteSnapshot;
  base: string;
  dirty: boolean;
  job?: NoteWrite;
  loading?: Promise<void>;
  saving?: Promise<boolean>;
  timer?: ReturnType<typeof setTimeout>;
  draftTimer?: ReturnType<typeof setTimeout>;
};

// This store outlives the sliding panel. Neither typing nor saving touches punch state.
export class DailyNotesStore {
  private entries = new Map<string, Entry>();
  private editing = new Set<string>();
  setEditing(day: string, active: boolean) {
    if (active) this.editing.add(day);
    else this.editing.delete(day);
  }
  private listeners = new Set<() => void>();
  constructor(
    private scope: string,
    private transport: NoteTransport,
    private storage?: StorageLike,
    private delay = 800,
  ) {}
  private key(day: string) {
    return `punch-in:daily-note:${encodeURIComponent(this.scope)}:${day}`;
  }
  private entry(day: string): Entry {
    let entry = this.entries.get(day);
    if (entry) return entry;
    entry = {
      snapshot: { ...emptyDailyNote(day), loaded: false, status: "loading" },
      base: noteSaveKey({ markdown: "" }),
      dirty: false,
    };
    try {
      const draft = JSON.parse(this.storage?.getItem(this.key(day)) ?? "null");
      if (
        draft &&
        typeof draft.markdown === "string" &&
        draft.markdown.length <= MAX_NOTE_LENGTH &&
        typeof draft.base === "string" &&
        Number.isSafeInteger(draft.version) &&
        draft.version >= 0
      ) {
        entry.snapshot.markdown = draft.markdown;
        if (isNoteDocument(draft.document)) entry.snapshot.document = draft.document;
        if (
          draft.template &&
          typeof draft.template.id === "string" &&
          typeof draft.template.fingerprint === "string"
        )
          entry.snapshot.template = draft.template;
        entry.snapshot.version = draft.version;
        entry.base =
          draft.format === 4
            ? draft.base
            : draft.format === 3
              ? JSON.stringify([...JSON.parse(draft.base), null])
              : noteSaveKey({ markdown: draft.base });
        entry.dirty = true;
        if (
          draft.job?.day === day &&
          typeof draft.job.markdown === "string" &&
          typeof draft.job.mutationId === "string" &&
          Number.isSafeInteger(draft.job.expectedVersion)
        )
          entry.job = draft.job;
      }
    } catch {
      /* A damaged or unavailable local draft must not prevent server saves. */
    }
    this.entries.set(day, entry);
    return entry;
  }
  getSnapshot = (day: string): NoteSnapshot => this.entry(day).snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(entry: Entry, patch: Partial<NoteSnapshot>) {
    entry.snapshot = { ...entry.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private persist(entry: Entry) {
    clearTimeout(entry.draftTimer);
    try {
      if (entry.dirty || entry.job)
        this.storage?.setItem(
          this.key(entry.snapshot.day),
          JSON.stringify({
            format: 4,
            template: entry.snapshot.template,
            markdown: entry.snapshot.markdown,
            document: entry.snapshot.document,
            base: entry.base,
            version: entry.snapshot.version,
            job: entry.job,
          }),
        );
      else this.storage?.removeItem(this.key(entry.snapshot.day));
    } catch {
      /* Server autosave still works when browser storage is full or disabled. */
    }
  }
  private schedule(entry: Entry) {
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      void this.flush(entry.snapshot.day);
    }, this.delay);
  }
  async load(day: string): Promise<void> {
    const entry = this.entry(day);
    if (entry.loading) return entry.loading;
    if (
      entry.snapshot.loaded &&
      this.editing.has(day) &&
      !entry.dirty &&
      entry.snapshot.status !== "error"
    )
      return;
    if (
      entry.saving ||
      (entry.snapshot.loaded && (entry.dirty || entry.job || entry.snapshot.conflict))
    )
      return;
    entry.loading = (async () => {
      try {
        const remote = await this.transport.read(
          day,
          entry.snapshot.loaded ? entry.snapshot.version : undefined,
          !entry.dirty && !entry.job,
        );
        if (!remote) {
          // A successful conditional read confirms the unchanged server copy,
          // including after a transient read failure. Keep edits made in flight.
          if (
            entry.snapshot.loaded &&
            !entry.dirty &&
            !entry.job &&
            !entry.snapshot.conflict &&
            entry.snapshot.status === "error"
          ) {
            this.publish(entry, { status: "saved", error: undefined });
          }
          return;
        }
        if (!entry.dirty && !entry.job && !this.editing.has(day)) {
          entry.base = noteSaveKey(remote);
          this.publish(entry, {
            ...remote,
            loaded: true,
            status: "saved",
            error: undefined,
            conflict: undefined,
          });
        } else if (noteSaveKey(remote) === noteSaveKey(entry.snapshot)) {
          entry.base = noteSaveKey(remote);
          entry.dirty = false;
          entry.job = undefined;
          this.publish(entry, {
            ...remote,
            loaded: true,
            status: "saved",
            error: undefined,
            conflict: undefined,
          });
        } else if (
          noteSaveKey(remote) === entry.base ||
          (entry.job && noteSaveKey(remote) === noteSaveKey(entry.job))
        ) {
          entry.base = noteSaveKey(remote);
          entry.job = undefined;
          this.publish(entry, {
            version: remote.version,
            updatedAt: remote.updatedAt,
            loaded: true,
            status: "pending",
            error: undefined,
          });
          this.schedule(entry);
        } else {
          this.publish(entry, {
            loaded: true,
            status: "conflict",
            conflict: remote,
            error: undefined,
          });
        }
        this.persist(entry);
      } catch {
        this.publish(entry, { status: "error", error: "メモを取得できませんでした" });
      }
    })().finally(() => {
      entry.loading = undefined;
    });
    return entry.loading;
  }
  edit(
    day: string,
    markdown: string,
    document?: NoteDocument,
    template = this.entry(day).snapshot.template,
  ) {
    const entry = this.entry(day);
    if (markdown.length > MAX_NOTE_LENGTH) return;
    // A restored legacy browser draft may not exist on the server yet. Save
    // its exact source first so the subsequent rich save can retain it there.
    if (
      document &&
      !entry.snapshot.document &&
      entry.dirty &&
      !entry.job &&
      !entry.snapshot.conflict
    ) {
      entry.job = {
        day,
        markdown: entry.snapshot.markdown,
        expectedVersion: entry.snapshot.version,
        mutationId: crypto.randomUUID(),
      };
    }
    entry.dirty = noteSaveKey({ markdown, document, template }) !== entry.base || !!entry.job;
    this.publish(entry, {
      markdown,
      document,
      template,
      status: entry.snapshot.conflict ? "conflict" : entry.dirty ? "pending" : "saved",
      error: undefined,
    });
    clearTimeout(entry.draftTimer);
    entry.draftTimer = setTimeout(() => this.persist(entry), 150);
    this.schedule(entry);
  }
  async flush(day: string): Promise<boolean> {
    const entry = this.entry(day);
    clearTimeout(entry.timer);
    this.persist(entry);
    if (entry.saving) {
      const ok = await entry.saving;
      return ok && entry.dirty ? this.flush(day) : ok;
    }
    if (!entry.snapshot.loaded) await this.load(day);
    if (!entry.snapshot.loaded || entry.snapshot.conflict) return false;
    if (!entry.dirty && !entry.job) return true;
    const job = entry.job ?? {
      day,
      markdown: entry.snapshot.markdown,
      ...(entry.snapshot.document ? { document: entry.snapshot.document } : {}),
      template: entry.snapshot.template,
      expectedVersion: entry.snapshot.version,
      mutationId: crypto.randomUUID(),
    };
    entry.job = job;
    this.persist(entry);
    this.publish(entry, { status: "saving", error: undefined });
    entry.saving = (async () => {
      try {
        const saved = await this.transport.write(job);
        entry.base = noteSaveKey(saved);
        entry.job = undefined;
        const template = entry.snapshot.template ?? saved.template;
        entry.dirty = noteSaveKey({ ...entry.snapshot, template }) !== noteSaveKey(saved);
        this.publish(entry, {
          template,
          version: saved.version,
          originalMarkdown: saved.originalMarkdown,
          updatedAt: saved.updatedAt,
          status: entry.dirty ? "pending" : "saved",
          error: undefined,
        });
        this.persist(entry);
        if (entry.dirty) this.schedule(entry);
        return true;
      } catch (error) {
        if (error instanceof NoteConflictError) {
          entry.job = undefined;
          this.publish(entry, { status: "conflict", conflict: error.current, error: undefined });
        } else
          this.publish(entry, {
            status: "error",
            error: "保存できませんでした。再試行してください",
          });
        this.persist(entry);
        return false;
      }
    })().finally(() => {
      entry.saving = undefined;
    });
    const ok = await entry.saving;
    return ok && entry.dirty ? this.flush(day) : ok;
  }
  async flushAll(): Promise<boolean> {
    const results = await Promise.all([...this.entries.keys()].map((day) => this.flush(day)));
    return results.every(Boolean);
  }
  resolve(day: string, choice: "mine" | "remote") {
    const entry = this.entry(day),
      remote = entry.snapshot.conflict;
    if (!remote) return;
    entry.base = noteSaveKey(remote);
    entry.job = undefined;
    entry.dirty = choice === "mine" && noteSaveKey(entry.snapshot) !== noteSaveKey(remote);
    this.publish(entry, {
      ...(choice === "remote" ? remote : { version: remote.version, updatedAt: remote.updatedAt }),
      loaded: true,
      conflict: undefined,
      error: undefined,
      status: entry.dirty ? "pending" : "saved",
    });
    this.persist(entry);
    if (entry.dirty) void this.flush(day);
  }
  hasUnsaved() {
    return [...this.entries.values()].some((entry) => entry.dirty || entry.job);
  }
  persistAll() {
    this.entries.forEach((entry) => this.persist(entry));
  }
  dispose() {
    this.persistAll();
    this.entries.forEach((entry) => {
      clearTimeout(entry.timer);
      clearTimeout(entry.draftTimer);
    });
  }
}
