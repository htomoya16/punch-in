import {realTime} from "./work";
import type { Session } from "./model";
export type Period = "day" | "week" | "month" | "year" | "all";
const formatters = new Map<string, Intl.DateTimeFormat>();
export function wallParts(ms: number, timezone: string) {
  let fmt = formatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatters.set(timezone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(ms).map(v => [v.type, v.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute, second: +p.second };
}
export function shiftDay(day: string, amount: number) { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
export function businessDay(ms: number, dayStart: number, timezone: string) { const p = wallParts(ms, timezone); return p.hour * 60 + p.minute < dayStart ? shiftDay(p.date, -1) : p.date; }
export function timeInput(ms: number, timezone: string) { const p = wallParts(ms, timezone); return `${p.date}T${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}:${String(p.second).padStart(2,"0")}`; }
export function fromTimeInput(value: string, timezone: string) {
  const target = Date.parse(`${value.length === 16 ? value + ":00" : value}Z`);
  if (!Number.isFinite(target)) throw new Error("日時を確認してください");
  let guess = target;
  for (let i = 0; i < 4; i++) { const local = Date.parse(`${timeInput(guess, timezone)}Z`); const delta = target - local; if (delta === 0) return guess; guess += delta; }
  throw new Error("このタイムゾーンでは存在しない日時です");
}
export function periodRange(period: Period, anchor: string): [string, string] {
  if (period === "all") return ["0000-01-01", "9999-12-31"];
  if (period === "day") return [anchor, anchor];
  if (period === "week") { const weekday = new Date(`${anchor}T00:00:00Z`).getUTCDay(); const first = shiftDay(anchor, -((weekday + 6) % 7)); return [first, shiftDay(first, 6)]; }
  if (period === "year") return [`${anchor.slice(0,4)}-01-01`, `${anchor.slice(0,4)}-12-31`];
  const next = new Date(`${anchor.slice(0,7)}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  return [`${anchor.slice(0,7)}-01`, shiftDay(next.toISOString().slice(0,10), -1)];
}
export function shiftPeriod(period: Period, anchor: string, direction: number) {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (period === "month") { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + direction); }
  else if (period === "year") { d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear() + direction); }
  else d.setUTCDate(d.getUTCDate() + direction * (period === "week" ? 7 : 1));
  return d.toISOString().slice(0,10);
}
export function duration(s: Session, now: number) { return realTime(s,now); }
export function hms(ms: number) { const s = Math.floor(Math.max(0, ms) / 1000); return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s/60)%60).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }
/** Presentation only: aggregate precise durations before converting to minutes. */
export function hm(ms: number) { const m=Math.floor(Math.max(0,ms)/60000);return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`; }
export function durationLabel(ms: number) { const m=Math.floor(Math.max(0,ms)/60000);return ms>0&&m===0?'1分未満':m<60?`${m}分`:`${Math.floor(m/60)}時間${m%60?`${m%60}分`:''}`; }
export function minuteInput(ms:number,timezone:string){return timeInput(ms,timezone).slice(0,16);}
export function minuteIso(ms:number){return new Date(ms).toISOString().slice(0,16)+'Z';}
export function hoursMinutes(ms: number) { const m = Math.floor(Math.max(0,ms)/60000); return `${Math.floor(m/60)}時間${String(m%60).padStart(2,"0")}分`; }
export function clock(ms: number, timezone: string, seconds = false) { const p = wallParts(ms,timezone); return `${String(p.hour).padStart(2,"0")}:${String(p.minute).padStart(2,"0")}${seconds ? `:${String(p.second).padStart(2,"0")}` : ""}`; }
export function dayStartLabel(minutes: number) { return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`; }
export function readableDate(day: string) { return new Intl.DateTimeFormat("ja-JP", { month:"long",day:"numeric",weekday:"short",timeZone:"UTC" }).format(new Date(`${day}T00:00:00Z`)); }
export function contrastText(color: string) { const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722 > .179 ? "#182631" : "#ffffff"; }
/** Keep configurable text and outlines visible on the application's white surface. */
export function readableColor(color: string, minimumContrast = 4.5) {
  let rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
  for(let i=0;i<25;i++) {
    const linear=rgb.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
    const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
    if(1.05/(luminance+.05)>=minimumContrast)break;
    rgb=rgb.map(v=>Math.floor(v*.9));
  }
  return '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
}
