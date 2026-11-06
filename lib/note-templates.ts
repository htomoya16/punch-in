import type { NoteDocument } from "./note-document";
export type NoteTemplate = {
  id: string;
  name: string;
  markdown: string;
  document: NoteDocument;
  version: number;
  updatedAt: number;
};
export type AppliedTemplate = { id: string; fingerprint: string };
/** Clone only block IDs. Cell attributes and inline content must remain untouched. */
export function cloneDocument(document: NoteDocument): NoteDocument {
  const clone = structuredClone(document);
  const visit = (blocks: Record<string, unknown>[]) => {
    for (const block of blocks) {
      block.id = crypto.randomUUID();
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(clone.blocks);
  return clone;
}
export async function documentFingerprint(document: NoteDocument) {
  const clone = structuredClone(document);
  const visit = (blocks: Record<string, unknown>[]) => {
    for (const block of blocks) {
      delete block.id;
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(clone.blocks);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(clone)),
  );
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function noteSaveKey(note: {
  markdown: string;
  document?: NoteDocument;
  template?: AppliedTemplate;
}) {
  return JSON.stringify([note.markdown, note.document ?? null, note.template ?? null]);
}
