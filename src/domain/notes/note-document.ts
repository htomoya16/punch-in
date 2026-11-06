// A portable JSON envelope, independent from the editor runtime.
export type NoteDocument = { format: "blocknote"; version: 1; blocks: Record<string, unknown>[] };

export const MAX_DOCUMENT_BYTES = 700_000;

export function isNoteDocument(value: unknown): value is NoteDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as NoteDocument;
  if (
    doc.format !== "blocknote" ||
    doc.version !== 1 ||
    !Array.isArray(doc.blocks) ||
    !doc.blocks.length ||
    doc.blocks.length > 5000
  )
    return false;
  let nodes = 0;

  function safe(v: unknown, depth: number): boolean {
    if (depth > 40 || ++nodes > 100000) return false;
    if (v === null || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "string") return v.length <= 100000;
    if (Array.isArray(v)) return v.every((x) => safe(x, depth + 1));
    if (typeof v !== "object") return false;
    return Object.entries(v as Record<string, unknown>).every(
      ([k, x]) => !["__proto__", "constructor", "prototype"].includes(k) && safe(x, depth + 1),
    );
  }

  const ids = new Set<string>();
  let blocks = 0;
  const types = new Set([
    "paragraph",
    "heading",
    "bulletListItem",
    "numberedListItem",
    "checkListItem",
    "toggleListItem",
    "quote",
    "codeBlock",
    "table",
    "divider",
    "image",
    "file",
    "audio",
    "video",
  ]);

  function uri(value: unknown) {
    return (
      typeof value !== "string" ||
      !/^\s*(?:javascript|vbscript|file|data):/i.test(value.replace(/[\u0000-\u0020]/g, ""))
    );
  }

  function inline(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    return value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const i = item as Record<string, unknown>;
      if (i.type === "link") return typeof i.href === "string" && uri(i.href) && inline(i.content);
      if (
        i.type !== "text" ||
        typeof i.text !== "string" ||
        !i.styles ||
        typeof i.styles !== "object" ||
        Array.isArray(i.styles)
      )
        return false;
      return Object.entries(i.styles).every(([key, v]) =>
        ["bold", "italic", "underline", "strike", "code"].includes(key)
          ? typeof v === "boolean"
          : ["textColor", "backgroundColor"].includes(key) && typeof v === "string",
      );
    });
  }

  function block(v: unknown, depth: number): boolean {
    if (depth > 16 || !v || typeof v !== "object" || ++blocks > 5000) return false;
    const b = v as Record<string, unknown>;
    if (
      typeof b.type !== "string" ||
      !types.has(b.type) ||
      typeof b.id !== "string" ||
      !b.id ||
      ids.has(b.id)
    )
      return false;
    ids.add(b.id);
    if (
      b.props !== undefined &&
      (!b.props ||
        typeof b.props !== "object" ||
        Array.isArray(b.props) ||
        Object.values(b.props).some((x) => !["string", "boolean", "number"].includes(typeof x)))
    )
      return false;
    if (b.props && !uri((b.props as Record<string, unknown>).url)) return false;
    if (b.type === "table") {
      if (!b.content || typeof b.content !== "object" || Array.isArray(b.content)) return false;
      const c = b.content as Record<string, unknown>;
      if (
        c.type !== "tableContent" ||
        !Array.isArray(c.rows) ||
        !c.rows.length ||
        c.rows.length > 5000
      )
        return false;
      if (
        !c.rows.every((row) => {
          if (
            !row ||
            typeof row !== "object" ||
            !Array.isArray(row.cells) ||
            !row.cells.length ||
            row.cells.length > 100
          )
            return false;
          return row.cells.every((cell: unknown) =>
            Array.isArray(cell)
              ? inline(cell)
              : !!cell &&
                typeof cell === "object" &&
                (cell as Record<string, unknown>).type === "tableCell" &&
                inline((cell as Record<string, unknown>).content),
          );
        })
      )
        return false;
    } else if (["divider", "image", "file", "audio", "video"].includes(b.type)) {
      if (b.content !== undefined) return false;
    } else if (!inline(b.content)) return false;
    return (
      b.children === undefined ||
      (Array.isArray(b.children) && b.children.every((x) => block(x, depth + 1)))
    );
  }

  try {
    return (
      safe(doc, 0) &&
      doc.blocks.every((b) => block(b, 0)) &&
      new TextEncoder().encode(JSON.stringify(doc)).byteLength <= MAX_DOCUMENT_BYTES
    );
  } catch {
    return false;
  }
}

export function noteContentKey(value: { markdown: string; document?: NoteDocument }) {
  return JSON.stringify([value.markdown, value.document ?? null]);
}
