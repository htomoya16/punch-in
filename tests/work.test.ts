import test from "node:test";
import assert from "node:assert/strict";
import { controlWork, allocations, realTime, preserveMemos, setMemo, memoKey } from "../lib/work";
import { cloneDocument, documentFingerprint } from "../lib/note-templates";
import { backupSchema } from "../lib/validation";
import { sessionSchema } from "../lib/validation";
import type { Session } from "../lib/model";
const minute = 60000,
  base = Date.parse("2026-11-01T01:00:00Z");
const session: Session = {
  id: "parent",
  categoryId: "a",
  startedAt: base,
  endedAt: null,
  businessDay: "2026-11-01",
  dayStart: 300,
  timezone: "Asia/Tokyo",
  memo: "A memo",
  createdAt: base,
  updatedAt: base,
};
function parallel() {
  return controlWork(session, "join", "b", base + 20 * minute);
}
function closed() {
  return controlWork(parallel(), "end", "", base + 60 * minute);
}
test("途中参加は重複区間だけ均等配分: A40分・B20分", () => {
  const s = closed();
  assert.deepEqual(
    [...allocations(s, 0)],
    [
      ["a", 40 * minute],
      ["b", 20 * minute],
    ],
  );
  assert.equal(realTime(s, 0), 60 * minute);
  assert.equal(s.id, session.id);
  assert.equal(s.startedAt, base);
  assert.equal(s.endedAt, base + 60 * minute);
  assert.equal(session.work, undefined);
  assert.ok(sessionSchema.safeParse(s).success);
});
test("作業ごとの一時停止中は残った作業へ100%配分", () => {
  let s = parallel();
  s = controlWork(s, "pause", "a", base + 40 * minute);
  s = controlWork(s, "end", "", base + 60 * minute);
  assert.deepEqual(
    [...allocations(s, 0)],
    [
      ["a", 30 * minute],
      ["b", 30 * minute],
    ],
  );
});
test("全作業一時停止中は実時間も配分も増えず、再開で続ける", () => {
  let s = controlWork(session, "pause", "a", base + 10 * minute);
  assert.equal(realTime(s, base + 50 * minute), 10 * minute);
  assert.equal(s.endedAt, null);
  s = controlWork(s, "resume", "a", base + 50 * minute);
  s = controlWork(s, "end", "", base + 60 * minute);
  assert.equal(realTime(s, 0), 20 * minute);
  assert.equal(s.endedAt, base + 60 * minute);
});
test("終了後の再打刻は以前のメモを残し新しい記録を追加する", () => {
  let s = parallel();
  s = setMemo(s, memoKey(s, "b"), "B memo");
  s = controlWork(s, "finish", "b", base + 30 * minute);
  s = controlWork(s, "join", "b", base + 50 * minute);
  s = controlWork(s, "end", "", base + 60 * minute);
  assert.equal(s.work!.members.length, 3);
  assert.equal(s.work!.members[1].memo, "B memo");
  assert.equal(s.work!.members[2].memo, "");
  assert.deepEqual(
    [...allocations(s, 0)],
    [
      ["a", 50 * minute],
      ["b", 10 * minute],
    ],
  );
});
test("手動計上は実時間から独立し、比率モードでは合計を維持", () => {
  const s = closed(),
    w = s.work!;
  assert.deepEqual(
    [
      ...allocations(
        {
          ...s,
          work: {
            ...w,
            mode: "manual",
            members: w.members.map((m, i) => ({ ...m, manualMs: (i ? 45 : 60) * minute })),
          },
        },
        0,
      ),
    ],
    [
      ["a", 60 * minute],
      ["b", 45 * minute],
    ],
  );
  assert.deepEqual(
    [
      ...allocations(
        {
          ...s,
          work: {
            ...w,
            mode: "ratio",
            members: w.members.map((m, i) => ({ ...m, weight: i ? 1 : 2 })),
          },
        },
        0,
      ),
    ],
    [
      ["a", 40 * minute],
      ["b", 20 * minute],
    ],
  );
});
test("ミリ秒の端数でも配分合計が実時間と一致", () => {
  let s = controlWork(session, "join", "b", base);
  s = controlWork(s, "join", "c", base);
  s = controlWork(s, "end", "", base + 1001);
  assert.equal(
    [...allocations(s, 0).values()].reduce((a, b) => a + b, 0),
    1001,
  );
});
test("遅れた構造差分は作業ごとのメモを巻き戻さない", () => {
  const old = setMemo(parallel(), memoKey(parallel(), "b"), "fresh");
  const next = controlWork(parallel(), "end", "", base + 60 * minute);
  assert.equal(preserveMemos(next, old).work!.members[1].memo, "fresh");
});
test("不正な区間・共通時刻の範囲外を拒否", () => {
  const s = closed();
  assert.equal(
    sessionSchema.safeParse({
      ...s,
      work: { ...s.work, intervals: [{ start: base - 1, end: base + 10, categoryIds: ["a"] }] },
    }).success,
    false,
  );
  assert.equal(
    sessionSchema.safeParse({
      ...s,
      work: { ...s.work, intervals: [{ start: base, end: base + 10, categoryIds: ["unknown"] }] },
    }).success,
    false,
  );
});
test("テンプレート複製は入れ子のIDを更新し本文と表を保つ", async () => {
  const doc = {
    format: "blocknote" as const,
    version: 1 as const,
    blocks: [
      {
        id: "one",
        type: "bulletListItem",
        content: [{ type: "text", text: "template", styles: {} }],
        children: [{ id: "two", type: "paragraph", content: [], children: [] }],
      },
    ],
  };
  const a = cloneDocument(doc),
    b = cloneDocument(doc);
  assert.notEqual(a.blocks[0].id, doc.blocks[0].id);
  assert.notEqual(a.blocks[0].id, b.blocks[0].id);
  assert.equal(await documentFingerprint(a), await documentFingerprint(doc));
  assert.deepEqual(doc.blocks[0].children[0].id, "two");
});

test("比率0の作業に端数を配分しない", () => {
  let s = controlWork(session, "join", "b", base);
  s = controlWork(s, "join", "c", base);
  s = controlWork(s, "end", "", base + 1);
  s = {
    ...s,
    work: {
      ...s.work!,
      mode: "ratio",
      members: s.work!.members.map((m, i) => ({ ...m, weight: i === 2 ? 0 : 1 })),
    },
  };
  assert.equal(allocations(s, 0).get("c"), 0);
  assert.equal(
    [...allocations(s, 0).values()].reduce((a, b) => a + b, 0),
    1,
  );
});

test("作業別の実時間はその作業が参加した区間だけ数える", () => {
  const s = closed();
  assert.equal(realTime(s, 0, "a"), 60 * minute);
  assert.equal(realTime(s, 0, "b"), 40 * minute);
  assert.equal(realTime(s, 0, "unknown"), 0);
  assert.equal(allocations(s, 0).get("b"), 20 * minute);
});
