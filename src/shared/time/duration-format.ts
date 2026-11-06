export function formatDurationSeconds(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Presentation only: aggregate precise durations before converting to minutes. */
export function formatDurationMinutes(ms: number) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function durationLabel(ms: number) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return ms > 0 && m === 0
    ? "1分未満"
    : m < 60
      ? `${m}分`
      : `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ""}`;
}

export function formatDurationInWords(ms: number) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  return `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, "0")}分`;
}
