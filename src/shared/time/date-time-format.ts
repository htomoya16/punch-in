import { getLocalDateTimeParts } from "./calendar";

export function formatDateTimeInput(ms: number, timezone: string) {
  const p = getLocalDateTimeParts(ms, timezone);
  return `${p.date}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(p.second).padStart(2, "0")}`;
}

export function parseDateTimeInput(value: string, timezone: string) {
  const target = Date.parse(`${value.length === 16 ? value + ":00" : value}Z`);
  if (!Number.isFinite(target)) throw new Error("日時を確認してください");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const local = Date.parse(`${formatDateTimeInput(guess, timezone)}Z`);
    const delta = target - local;
    if (delta === 0) return guess;
    guess += delta;
  }
  throw new Error("このタイムゾーンでは存在しない日時です");
}

export function formatMinuteDateTimeInput(ms: number, timezone: string) {
  return formatDateTimeInput(ms, timezone).slice(0, 16);
}

export function formatMinuteIsoTime(ms: number) {
  return new Date(ms).toISOString().slice(0, 16) + "Z";
}

export function formatClockTime(ms: number, timezone: string, seconds = false) {
  const p = getLocalDateTimeParts(ms, timezone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}${seconds ? `:${String(p.second).padStart(2, "0")}` : ""}`;
}

export function formatDayStartTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatRecordDate(day: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
