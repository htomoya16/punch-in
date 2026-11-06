import assert from "node:assert/strict";
import test from "node:test";
import { formatHistoryCsv } from "../src/application/export/history-csv";
import { formatStatisticsCsv } from "../src/application/export/statistics-csv";
import type { WorkCategory } from "../src/domain/categories/work-category";
import type { TrackingSession } from "../src/domain/tracking/tracking-session";

const start = Date.parse("2026-11-06T04:00:23.456Z");
const categories: WorkCategory[] = [
  { id: "a", name: '=A,"B"', color: "#168ab5", hidden: false, archived: false, position: 0 },
];
const session: TrackingSession = {
  id: "record",
  categoryId: "a",
  startedAt: start,
  endedAt: start + 90_001,
  businessDay: "2026-11-06",
  dayStart: 300,
  timezone: "Asia/Tokyo",
  memo: "line one\nline two",
  createdAt: start,
  updatedAt: start + 90_001,
};

test("履歴CSVは数式を無効化して引用符と改行を保持し、保存値を分単位で書き出す", () => {
  const csv = formatHistoryCsv([session], categories, start + 100_000);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=A,""B"""'));
  assert.ok(csv.includes('"2026-11-06T04:00Z","2026-11-06T04:01Z","1"'));
  assert.ok(csv.includes('"line one\nline two"'));
  assert.equal(session.startedAt, start);
});

test("集計CSVは各記録を丸めず合算し、分数列・HH:mm・計測中を出力する", () => {
  const live = { ...session, id: "live", startedAt: start + 100_000, endedAt: null };
  const csv = formatStatisticsCsv({
    categories,
    categoryFilter: "a",
    period: "day",
    from: "2026-11-06",
    to: "2026-11-06",
    sessions: [session, live],
    now: start + 130_001,
    totalMs: 120_002,
    includesRunning: true,
  });
  assert.ok(csv.includes('"2","00:02","はい"'));
  assert.ok(csv.includes('"作業時間","2","00:02","はい"'));
});
