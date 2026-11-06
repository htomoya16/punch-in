import assert from "node:assert/strict";
import test from "node:test";
import type { TrackingSession } from "../src/domain/tracking/tracking-session";
import { applyTrackingCommand } from "../src/domain/tracking/tracking-transitions";
import { buildWeekTimeline, weekDayTotal } from "../src/domain/tracking/week-timeline";
const at = Date.parse("2026-11-03T01:00:00Z"),
  hour = 3600000;
const base: TrackingSession = {
  id: "one",
  categoryId: "a",
  memo: "",
  startedAt: at,
  endedAt: null,
  businessDay: "2026-11-03",
  dayStart: 300,
  timezone: "Asia/Tokyo",
  createdAt: at,
  updatedAt: at,
};
test("週タイムラインは空の日も含め月曜から7日を同じ時間軸で用意する", () => {
  const rows = buildWeekTimeline("2026-11-03", [], 300, "Asia/Tokyo");
  assert.equal(rows.length, 7);
  assert.equal(rows[0].day, "2026-11-02");
  assert.equal(rows[6].day, "2026-11-08");
  assert.equal(new Date(rows[0].start).toISOString(), "2026-11-01T20:00:00.000Z");
});
test("並行区間は別レーンへ、連続する同じ記録は結合し実時間は1回数える", () => {
  let s = applyTrackingCommand(base, "join", "b", at + hour / 3);
  s = applyTrackingCommand(s, "end", "", at + hour);
  const day = buildWeekTimeline("2026-11-03", [s], 300, "Asia/Tokyo")[1];
  assert.equal(day.segments.length, 2);
  assert.equal(day.lanes, 2);
  assert.equal(weekDayTotal(day, at + 10 * hour), hour);
});
test("一時停止の隙間を塗らず、停止中の合計も増やさない", () => {
  let s = applyTrackingCommand(base, "pause", "a", at + hour / 4);
  s = applyTrackingCommand(s, "resume", "a", at + hour / 2);
  s = applyTrackingCommand(s, "pause", "a", at + hour);
  const day = buildWeekTimeline("2026-11-03", [s], 300, "Asia/Tokyo")[1];
  assert.equal(day.segments.length, 2);
  assert.equal(weekDayTotal(day, at + 10 * hour), hour * 0.75);
});
test("日の境界・週の境界をまたぐ記録は実際の表示範囲で切り分ける", () => {
  const start = Date.parse("2026-11-02T04:30:00+09:00"),
    s = { ...base, startedAt: start, endedAt: start + hour, businessDay: "2026-11-01" };
  const rows = buildWeekTimeline("2026-11-03", [s], 300, "Asia/Tokyo");
  assert.equal(rows[0].segments[0].start, rows[0].start);
  assert.equal(weekDayTotal(rows[0], 0), hour / 2);
});
test("計測中の棒も日境界で切り、未来の日へ計上しない", () => {
  const rows = buildWeekTimeline("2026-11-03", [base], 300, "Asia/Tokyo");
  assert.equal(weekDayTotal(rows[1], at + hour), hour);
  assert.equal(weekDayTotal(rows[2], at + hour), 0);
});
test("夏時間の週も現地の日の区切りを保持し23時間の日を扱う", () => {
  const rows = buildWeekTimeline("2026-03-08", [], 0, "America/New_York");
  assert.equal(rows[6].end - rows[6].start, 23 * hour);
});

test("夏時間で存在しない2時30分の区切りは最初に存在する3時へ合わせる", () => {
  const rows = buildWeekTimeline("2026-03-08", [], 150, "America/New_York");
  assert.equal(new Date(rows[6].start).toISOString(), "2026-03-08T07:00:00.000Z");
});
test("カテゴリで絞ると棒と実時間も対象の参加区間にそろう", () => {
  const s = applyTrackingCommand(
      applyTrackingCommand(base, "join", "b", at + hour / 3),
      "end",
      "",
      at + hour,
    ),
    day = buildWeekTimeline("2026-11-03", [s], 300, "Asia/Tokyo", "b")[1];
  assert.equal(day.segments.length, 1);
  assert.equal(day.segments[0].categoryId, "b");
  assert.equal(weekDayTotal(day, 0), (hour * 2) / 3);
});
