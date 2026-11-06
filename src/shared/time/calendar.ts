export type Period = "day" | "week" | "month" | "year" | "all";

const formatters = new Map<string, Intl.DateTimeFormat>();

export function getLocalDateTimeParts(ms: number, timezone: string) {
  let fmt = formatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(ms).map((v) => [v.type, v.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
  };
}

export function shiftDay(day: string, amount: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

export function resolveBusinessDay(ms: number, dayStart: number, timezone: string) {
  const p = getLocalDateTimeParts(ms, timezone);
  return p.hour * 60 + p.minute < dayStart ? shiftDay(p.date, -1) : p.date;
}

export function periodRange(period: Period, anchor: string): [string, string] {
  if (period === "all") return ["0000-01-01", "9999-12-31"];
  if (period === "day") return [anchor, anchor];
  if (period === "week") {
    const weekday = new Date(`${anchor}T00:00:00Z`).getUTCDay();
    const first = shiftDay(anchor, -((weekday + 6) % 7));
    return [first, shiftDay(first, 6)];
  }
  if (period === "year") return [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`];
  const next = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return [`${anchor.slice(0, 7)}-01`, shiftDay(next.toISOString().slice(0, 10), -1)];
}

export function shiftPeriod(period: Period, anchor: string, direction: number) {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (period === "month") {
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + direction);
  } else if (period === "year") {
    d.setUTCDate(1);
    d.setUTCFullYear(d.getUTCFullYear() + direction);
  } else d.setUTCDate(d.getUTCDate() + direction * (period === "week" ? 7 : 1));
  return d.toISOString().slice(0, 10);
}
