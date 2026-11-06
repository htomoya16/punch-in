"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Copy, Trash2, Check, X, LoaderCircle } from "lucide-react";
import type { NoteTemplate } from "../../../lib/note-templates";
import { cloneDocument } from "../../../lib/note-templates";
import type { NoteDocument } from "../../../lib/note-document";
import BlockEditor from "./block-editor";
type List = { templates: NoteTemplate[]; defaultId: string | null; version: number };
export default function TemplatePanel({
  close,
  apply,
}: {
  close(): void;
  apply(template: NoteTemplate): Promise<void>;
}) {
  const [list, setList] = useState<List | null>(null),
    [editing, setEditing] = useState<NoteTemplate | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null);
  const lock = useRef(false);
  async function load() {
    try {
      const r = await fetch("/api/note-templates", { cache: "no-store" });
      if (!r.ok) throw new Error("テンプレートを取得できませんでした");
      setList(await r.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function mutate(payload: unknown) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/note-templates", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        }),
        data = (await r.json()) as List & { error?: string };
      if (!r.ok) throw new Error(data.error ?? "保存できませんでした");
      setList(data as List);
      return data as List;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function leave() {
    if (dirty) {
      setDiscard(true);
      return;
    }
    setEditing(null);
  }
  function make(copy?: NoteTemplate) {
    const document: NoteDocument = copy
      ? cloneDocument(copy.document)
      : {
          format: "blocknote",
          version: 1,
          blocks: [{ id: crypto.randomUUID(), type: "paragraph", content: [], children: [] }],
        };
    setEditing({
      id: crypto.randomUUID(),
      name: copy ? `${copy.name} のコピー` : "",
      markdown: copy?.markdown ?? "",
      document,
      version: 0,
      updatedAt: 0,
    });
    setDirty(false);
  }
  async function save() {
    if (!editing) return;
    const first = list?.templates.length === 0;
    const result = await mutate({
      action: "save",
      ...editing,
      expectedVersion: editing.version,
      mutationId: crypto.randomUUID(),
    });
    if (result) {
      setDirty(false);
      setEditing(null);
      if (first)
        await mutate({
          action: "default",
          id: editing.id,
          expectedVersion: result.version,
          mutationId: crypto.randomUUID(),
        });
    }
  }
  return (
    <section className="template-panel" aria-label="日別メモのテンプレート">
      <header className="template-header">
        <button
          className="icon-button"
          aria-label={editing ? "一覧に戻る" : "テンプレートを閉じる"}
          disabled={busy}
          onClick={() => (editing ? leave() : close())}
        >
          {editing ? <ArrowLeft size={18} /> : <X size={18} />}
        </button>
        <h2>{editing ? "テンプレートを編集" : "テンプレート"}</h2>
        {editing ? (
          <button
            className="text-button"
            disabled={busy || !editing.name.trim()}
            onClick={() => void save()}
          >
            {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}保存
          </button>
        ) : (
          <button className="text-button" onClick={() => make()}>
            <Plus size={15} />
            作成
          </button>
        )}
      </header>
      {error && (
        <div className="note-message" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={() => void load()}>
            再読み込み
          </button>
        </div>
      )}
      {discard && (
        <div className="note-message">
          <span>編集内容を破棄しますか？</span>
          <button
            className="text-button"
            onClick={() => {
              setDirty(false);
              setDiscard(false);
              setEditing(null);
            }}
          >
            破棄
          </button>
          <button className="text-button" onClick={() => setDiscard(false)}>
            戻る
          </button>
        </div>
      )}
      {editing ? (
        <>
          <input
            className="template-name"
            aria-label="テンプレート名"
            placeholder="テンプレート名"
            maxLength={80}
            value={editing.name}
            onChange={(e) => {
              setDirty(true);
              setEditing({ ...editing, name: e.target.value });
            }}
          />
          <div className="template-editor">
            <BlockEditor
              key={editing.id}
              label="テンプレート本文"
              note={{ ...editing, day: "template", loaded: true, status: "saved" }}
              onChange={(markdown, document) => {
                setDirty(true);
                setEditing((current) => (current ? { ...current, markdown, document } : null));
              }}
              onFocusChange={() => {}}
            />
          </div>
        </>
      ) : (
        <div className="template-list">
          {list ? (
            <>
              <label className="template-default">
                <span>自動で使うテンプレート</span>
                <select
                  aria-label="自動で使うテンプレート"
                  disabled={busy}
                  value={list.defaultId ?? ""}
                  onChange={(e) =>
                    void mutate({
                      action: "default",
                      id: e.target.value || null,
                      expectedVersion: list.version,
                      mutationId: crypto.randomUUID(),
                    })
                  }
                >
                  <option value="">なし</option>
                  {list.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {list.templates.map((t) => (
                <article key={t.id} className="template-item">
                  <button
                    className="template-item-name"
                    onClick={() => {
                      setEditing(t);
                      setDirty(false);
                    }}
                  >
                    {t.name}
                    {t.id === list.defaultId && <Check size={14} />}
                  </button>
                  <div>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await apply(t);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      使う
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`${t.name}を複製`}
                      disabled={busy}
                      onClick={() => make(t)}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`${t.name}を削除`}
                      disabled={busy}
                      onClick={() => setDeleting(t.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {deleting === t.id && (
                    <div className="template-delete">
                      <span>削除しますか？</span>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await mutate({
                              action: "delete",
                              id: t.id,
                              expectedVersion: t.version,
                              mutationId: crypto.randomUUID(),
                            })
                          )
                            setDeleting(null);
                        }}
                      >
                        削除
                      </button>
                      <button className="text-button" onClick={() => setDeleting(null)}>
                        戻る
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!list.templates.length && (
                <button className="outline-button" onClick={() => make()}>
                  <Plus size={16} />
                  テンプレートを作成
                </button>
              )}
            </>
          ) : (
            <div className="note-loading">
              <LoaderCircle className="spin" size={18} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
