import assert from "node:assert/strict";
import test from "node:test";
import { writeDailyNote } from "../src/infrastructure/persistence/d1/daily-note-repository";
import {
  mutateTemplate,
  readTemplates,
} from "../src/infrastructure/persistence/d1/note-template-repository";
import { fixture } from "./d1-fixture";
import { initializeDailyNote } from "./support/note-usecases";
const user = "owner";
const document = {
  format: "blocknote" as const,
  version: 1 as const,
  blocks: [
    {
      id: "seed",
      type: "paragraph",
      content: [{ type: "text", text: "template", styles: {} }],
      children: [],
    },
  ],
};
const job = (id = crypto.randomUUID()) => ({
  action: "save" as const,
  id,
  name: "Template",
  document,
  markdown: "template",
  expectedVersion: 0,
  mutationId: crypto.randomUUID(),
});
async function setup() {
  const f = fixture(),
    j = job();
  await mutateTemplate(f.db, user, j);
  await mutateTemplate(f.db, user, {
    action: "default",
    id: j.id,
    expectedVersion: 0,
    mutationId: crypto.randomUUID(),
  });
  return { ...f, id: j.id };
}
test("自動テンプレートは初回だけ挿入し、各日でブロックIDが独立", async () => {
  const f = await setup();
  try {
    const a = await initializeDailyNote(f.db, user, "2026-11-01"),
      b = await initializeDailyNote(f.db, user, "2026-11-02");
    assert.equal(a.markdown, "template");
    assert.notEqual(a.document!.blocks[0].id, b.document!.blocks[0].id);
    assert.deepEqual(await initializeDailyNote(f.db, user, "2026-11-01"), a);
    assert.equal((await initializeDailyNote(f.db, "other", "2026-11-01")).version, 0);
  } finally {
    f.sqlite.close();
  }
});
test("テンプレートを変えても作成済み・空にした日別メモは変えない", async () => {
  const f = await setup();
  try {
    const a = await initializeDailyNote(f.db, user, "2026-11-01");
    await writeDailyNote(f.db, user, {
      day: a.day,
      markdown: "",
      document: {
        ...document,
        blocks: [{ id: "clear", type: "paragraph", content: [], children: [] }],
      },
      expectedVersion: 1,
      mutationId: crypto.randomUUID(),
    });
    await mutateTemplate(f.db, user, {
      ...job(f.id),
      name: "changed",
      markdown: "changed",
      expectedVersion: 1,
    });
    assert.equal((await initializeDailyNote(f.db, user, a.day)).markdown, "");
    assert.equal((await initializeDailyNote(f.db, user, "2026-11-02")).markdown, "changed");
  } finally {
    f.sqlite.close();
  }
});
test("デフォルト選択を変更・解除でき、削除でも解除する", async () => {
  const f = await setup();
  try {
    const second = job();
    await mutateTemplate(f.db, user, second);
    await mutateTemplate(f.db, user, {
      action: "default",
      id: second.id,
      expectedVersion: 1,
      mutationId: crypto.randomUUID(),
    });
    assert.equal((await readTemplates(f.db, user)).defaultId, second.id);
    await mutateTemplate(f.db, user, {
      action: "default",
      id: null,
      expectedVersion: 2,
      mutationId: crypto.randomUUID(),
    });
    assert.equal((await initializeDailyNote(f.db, user, "2026-11-01")).version, 0);
    await mutateTemplate(f.db, user, {
      action: "default",
      id: f.id,
      expectedVersion: 3,
      mutationId: crypto.randomUUID(),
    });
    await mutateTemplate(f.db, user, {
      action: "delete",
      id: f.id,
      expectedVersion: 1,
      mutationId: crypto.randomUUID(),
    });
    assert.equal((await readTemplates(f.db, user)).defaultId, null);
  } finally {
    f.sqlite.close();
  }
});
test("テンプレートCAS・保存再試行は編集を重複させない", async () => {
  const f = fixture(),
    j = job();
  try {
    await mutateTemplate(f.db, user, j);
    await mutateTemplate(f.db, user, j);
    assert.equal((await readTemplates(f.db, user)).templates[0].version, 1);
    await assert.rejects(
      () => mutateTemplate(f.db, user, { ...j, name: "stale", mutationId: crypto.randomUUID() }),
      /別の画面/,
    );
    assert.equal((await readTemplates(f.db, "other")).templates.length, 0);
  } finally {
    f.sqlite.close();
  }
});
test("手動で選択したテンプレート情報を本文と同時保存する", async () => {
  const f = fixture();
  try {
    const id = crypto.randomUUID(),
      t = { id, fingerprint: "a".repeat(64) };
    const saved = await writeDailyNote(f.db, user, {
      day: "2026-11-01",
      markdown: "template",
      document,
      template: t,
      expectedVersion: 0,
      mutationId: crypto.randomUUID(),
    });
    assert.deepEqual(saved.template, t);
    const next = await writeDailyNote(f.db, user, {
      day: saved.day,
      markdown: "typed",
      document,
      expectedVersion: 1,
      mutationId: crypto.randomUUID(),
    });
    assert.deepEqual(next.template, t);
  } finally {
    f.sqlite.close();
  }
});
