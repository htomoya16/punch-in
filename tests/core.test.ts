import assert from "node:assert/strict";
import test from "node:test";
import type { AppState } from "../src/application/contracts/app-state";
import type { Backup } from "../src/application/contracts/backup";
import { assertNoOverlap, planImport } from "../src/application/usecases/backup/plan-backup-import";
import { backupSchema } from "../src/application/validation/backup-schema";
import { getRecordedDuration } from "../src/domain/tracking/recorded-duration";
import type { TrackingSession } from "../src/domain/tracking/tracking-session";
import { contrastText, readableColor } from "../src/shared/colors/color-contrast";
import { periodRange, resolveBusinessDay, shiftPeriod } from "../src/shared/time/calendar";
import {
  formatDateTimeInput,
  formatMinuteDateTimeInput,
  formatMinuteIsoTime,
  parseDateTimeInput,
} from "../src/shared/time/date-time-format";
import {
  durationLabel,
  formatDurationMinutes,
  formatDurationSeconds,
} from "../src/shared/time/duration-format";
const tz = "Asia/Tokyo";
const stamp = (s: string) => Date.parse(s);
function session(id: string, start: string, end: string | null): TrackingSession {
  const startedAt = stamp(start);
  return {
    id,
    categoryId: "research",
    startedAt,
    endedAt: end === null ? null : stamp(end),
    businessDay: resolveBusinessDay(startedAt, 300, tz),
    dayStart: 300,
    timezone: tz,
    memo: "",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}
const state: AppState = {
  preferences: {
    timezone: tz,
    dayStart: 300,
    accent: "#168ab5",
    sidebar: "#272c34",
    reminderEnabled: false,
    reminderMinutes: 360,
  },
  categories: [
    { id: "research", name: "研究", color: "#168ab5", position: 0, hidden: false, archived: false },
  ],
  sessions: [],
  revision: 0,
  serverNow: Date.now(),
};
function backup(sessions: TrackingSession[]): Backup {
  return {
    format: "punch-in",
    version: 1,
    exportedAt: new Date().toISOString(),
    preferences: state.preferences,
    categories: state.categories,
    sessions,
  };
}

test("5時の直前は前日、境界ぴったりから当日", () => {
  assert.equal(resolveBusinessDay(stamp("2026-11-02T04:59:59+09:00"), 300, tz), "2026-11-01");
  assert.equal(resolveBusinessDay(stamp("2026-11-02T05:00:00+09:00"), 300, tz), "2026-11-02");
});
test("ユーザーごとに異なる区切り・年またぎ・うるう年", () => {
  const t = stamp("2027-01-01T06:00:00+09:00");
  assert.equal(resolveBusinessDay(t, 300, tz), "2027-01-01");
  assert.equal(resolveBusinessDay(t, 420, tz), "2026-12-31");
  assert.equal(resolveBusinessDay(stamp("2024-03-01T02:00:00+09:00"), 300, tz), "2024-02-29");
});
test("タイムゾーンは端末の設定から独立する", () => {
  const t = stamp("2026-11-01T20:30:00Z");
  assert.equal(resolveBusinessDay(t, 0, "Asia/Tokyo"), "2026-11-02");
  assert.equal(resolveBusinessDay(t, 0, "America/New_York"), "2026-11-01");
});
test("区切りをまたいでも開始日のまま全時間を計算", () => {
  const s = session("a", "2026-11-02T03:00:00+09:00", "2026-11-02T06:00:00+09:00");
  assert.equal(s.businessDay, "2026-11-01");
  assert.equal(getRecordedDuration(s, 0), 10800000);
});
test("24時間を超える時間を丸めず保持", () => {
  assert.equal(formatDurationSeconds(90061000), "25:01:01");
  assert.equal(formatDurationSeconds(360000000), "100:00:00");
});
test("週は月曜始まりで年をまたげる", () => {
  assert.deepEqual(periodRange("week", "2027-01-01"), ["2026-12-28", "2027-01-03"]);
});
test("月末から前期間に移動しても月を飛ばさない", () => {
  assert.equal(shiftPeriod("month", "2026-03-31", -1), "2026-02-01");
  assert.deepEqual(periodRange("month", "2024-02-20"), ["2024-02-01", "2024-02-29"]);
  assert.deepEqual(periodRange("year", "2026-11-01"), ["2026-01-01", "2026-12-31"]);
});
test("日時の入力とUTC保存を秒単位で往復できる", () => {
  const t = stamp("2026-11-02T03:04:05+09:00");
  assert.equal(parseDateTimeInput(formatDateTimeInput(t, tz), tz), t);
});
test("夏時間に存在しない日時を拒否する", () => {
  assert.throws(() => parseDateTimeInput("2026-03-08T02:30:00", "America/New_York"), /存在しない/);
});
test("終了直後の次の開始は許可し、重複時間を拒否", () => {
  const a = session("a", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z");
  const b = session("b", "2026-10-01T11:00:00Z", null);
  assert.doesNotThrow(() => assertNoOverlap([a, b]));
  assert.throws(() => assertNoOverlap([a, { ...b, startedAt: b.startedAt - 1 }]));
});
test("同時に2件の計測と、計測中に重なる手動記録を拒否", () => {
  const a = session("a", "2026-10-01T10:00:00Z", null),
    b = session("b", "2026-10-01T11:00:00Z", null);
  assert.throws(() => assertNoOverlap([a, b]));
});
test("移行データから個人設定と所属日を復元できる", () => {
  const s = session("a", "2026-10-01T18:00:00Z", "2026-10-01T21:00:00Z");
  const p = planImport(state, backup([s]));
  assert.equal(p.preview.sessions, 1);
  assert.equal(p.sessions[0].businessDay, "2026-10-01");
  assert.equal(p.backup.preferences.dayStart, 300);
});
test("再インポートは同じIDの記録を重複させない", () => {
  const s = session("a", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z");
  const p = planImport({ ...state, sessions: [s] }, backup([s]));
  assert.equal(p.preview.sessions, 0);
  assert.equal(p.preview.skippedSessions, 1);
});
test("同じバックアップ内の重複・参照切れ・不正な所属日を拒否", () => {
  const s = session("a", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z");
  assert.equal(backupSchema.safeParse(backup([s, s])).success, false);
  assert.equal(backupSchema.safeParse(backup([{ ...s, categoryId: "missing" }])).success, false);
  assert.equal(
    backupSchema.safeParse(backup([{ ...s, businessDay: "2026-09-30" }])).success,
    false,
  );
});
test("バージョン不一致と計測の重複は取り込まない", () => {
  assert.throws(() => planImport(state, { ...backup([]), version: 2 }));
  const a = session("a", "2026-10-01T10:00:00Z", "2026-10-01T12:00:00Z"),
    b = session("b", "2026-10-01T11:00:00Z", "2026-10-01T13:00:00Z");
  assert.throws(() => planImport({ ...state, sessions: [a] }, backup([b])));
});
test("背景の明るさに合わせて文字色を選ぶ", () => {
  assert.equal(contrastText("#ffffff"), "#182631");
  assert.equal(contrastText("#000000"), "#ffffff");
});

test("白い設定色でも文字と枠線が白い背景に埋もれない", () => {
  assert.notEqual(readableColor("#ffffff"), "#ffffff");
  assert.equal(readableColor("#000000"), "#000000");
});

test("分表示は合算後に端数を除き、24時間を超えても時を維持する", () => {
  assert.equal(formatDurationMinutes(40000 + 40000 + 40000), "00:02");
  assert.equal(formatDurationMinutes(90061000), "25:01");
  assert.equal(durationLabel(40000), "1分未満");
  assert.equal(durationLabel(9000000), "2時間30分");
  assert.equal(durationLabel(3600000), "1時間");
  assert.equal(durationLabel(0), "0分");
});
test("表示とCSVの日時だけ分単位にし、入力元の時刻は変えない", () => {
  const at = Date.parse("2026-11-04T12:34:56.789+09:00");
  assert.equal(formatMinuteDateTimeInput(at, "Asia/Tokyo"), "2026-11-04T12:34");
  assert.equal(formatMinuteIsoTime(at), "2026-11-04T03:34Z");
  assert.equal(new Date(at).toISOString(), "2026-11-04T03:34:56.789Z");
});
