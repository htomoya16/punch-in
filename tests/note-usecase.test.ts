import assert from "node:assert/strict";
import test from "node:test";
import type { DailyNoteRepository } from "../src/application/ports/daily-note-repository";
import type { NoteTemplateRepository } from "../src/application/ports/note-template-repository";
import type { WorkEntryMemoRepository } from "../src/application/ports/work-entry-memo-repository";
import { createNoteUseCases } from "../src/application/usecases/notes/create-note-usecases";

const unused = async (): Promise<never> => {
  throw new Error("Unexpected port call");
};

test("テンプレートの作成上限はUsecaseで検証し、Portへ書き込まない", async () => {
  let writes = 0;
  const templates: NoteTemplateRepository = {
    read: unused,
    readDefault: unused,
    count: async () => 100,
    mutate: async () => {
      writes++;
      throw new Error("Quota must reject before writing");
    },
  };
  const notes: DailyNoteRepository = {
    read: unused,
    save: unused,
    exportAll: unused,
    readDays: unused,
    readIndex: unused,
    insertFromTemplate: unused,
  };
  const memos: WorkEntryMemoRepository = { save: unused };
  const useCases = createNoteUseCases({
    templates,
    notes,
    memos,
    clock: { now: () => 0 },
    ids: { generate: () => "fixed-id" },
  });
  await assert.rejects(
    useCases.updateTemplate("owner", {
      action: "save",
      id: "00000000-0000-4000-8000-000000000001",
      name: "Template",
      markdown: "",
      document: {
        format: "blocknote",
        version: 1,
        blocks: [{ id: "block", type: "paragraph", content: [], children: [] }],
      },
      expectedVersion: 0,
      mutationId: "00000000-0000-4000-8000-000000000002",
    }),
    { code: "invalid_input" },
  );
  assert.equal(writes, 0);
});
