"use client";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Keyboard, RotateCcw } from "lucide-react";
import { dateParts, daysInMonth, replaceDatePart, type DatePart } from "../../../lib/record-editor";
const ROW = 40;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

type WheelProps = {
  label: string;
  values: number[];
  value: number;
  suffix: string;
  onChange(value: number): void;
};
const Wheel = memo(function Wheel({ label, values, value, suffix, onChange }: WheelProps) {
  const list = useRef<HTMLDivElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    frame = useRef(0);
  const [center, setCenter] = useState(values.indexOf(value));
  const change = useRef(onChange);
  change.current = onChange;
  const options = useRef(values);
  options.current = values;
  const current = useRef(value);
  current.current = value;
  useLayoutEffect(() => {
    const index = values.indexOf(value);
    setCenter(index);
    const el = list.current;
    if (el && Math.abs(el.scrollTop - index * ROW) > 1) el.scrollTop = index * ROW;
  }, [value, values]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );
  function choose() {
    const el = list.current;
    if (!el) return;
    const index = Math.max(0, Math.min(options.current.length - 1, Math.round(el.scrollTop / ROW)));
    if (options.current[index] !== current.current) change.current(options.current[index]);
  }
  function scroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = list.current;
      if (el) setCenter(Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW))));
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(choose, 160);
  }
  function move(index: number) {
    clearTimeout(timer.current);
    const target = Math.max(0, Math.min(values.length - 1, index));
    change.current(values[target]);
  }
  return (
    <div className="date-wheel-column">
      <span className="date-wheel-label">{label}</span>
      <div
        ref={list}
        className="date-wheel"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={values[0]}
        aria-valuemax={values.at(-1)}
        aria-valuenow={values[center] ?? value}
        aria-valuetext={`${values[center] ?? value}${suffix}`}
        onScroll={scroll}
        onBlur={choose}
        onKeyDown={(e) => {
          const index = Math.round((list.current?.scrollTop ?? 0) / ROW),
            target =
              e.key === "ArrowUp"
                ? index + 1
                : e.key === "ArrowDown"
                  ? index - 1
                  : e.key === "PageUp"
                    ? index + 5
                    : e.key === "PageDown"
                      ? index - 5
                      : e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? values.length - 1
                          : null;
          if (target !== null) {
            e.preventDefault();
            move(target);
          }
        }}
      >
        {values.map((n, index) => (
          <div
            key={n}
            className={`date-wheel-option ${index === center ? "is-centered" : ""}`}
            aria-hidden="true"
            onClick={() => move(index)}
          >
            {String(n).padStart(2, "0")}
          </div>
        ))}
      </div>
    </div>
  );
});

type Props = {
  label: string;
  value: string;
  open: boolean;
  onOpen(open: boolean): void;
  onChange(value: string): void;
  currentTime(): string;
  allowEmpty?: boolean;
};
export default function DateTimeField({
  label,
  value,
  open,
  onOpen,
  onChange,
  currentTime,
  allowEmpty = false,
}: Props) {
  const [mode, setMode] = useState<"date" | "time">("time"),
    [manual, setManual] = useState(false);
  const fallback = useRef(currentTime());
  const draft = (value || fallback.current).slice(0, 16),
    p = dateParts(draft);
  const years = useMemo(
      () => range(Math.max(1, p.year - 75), Math.min(9999, p.year + 25)),
      [p.year],
    ),
    months = useMemo(() => range(1, 12), []),
    days = useMemo(() => range(1, daysInMonth(p.year, p.month)), [p.year, p.month]),
    hours = useMemo(() => range(0, 23), []),
    minutes = useMemo(() => range(0, 59), []);
  const fields: { part: DatePart; label: string; values: number[]; suffix: string }[] =
    mode === "date"
      ? [
          { part: "year", label: "年", values: years, suffix: "年" },
          { part: "month", label: "月", values: months, suffix: "月" },
          { part: "day", label: "日", values: days, suffix: "日" },
        ]
      : [
          { part: "hour", label: "時", values: hours, suffix: "時" },
          { part: "minute", label: "分", values: minutes, suffix: "分" },
        ];
  const field = useRef<HTMLDivElement>(null);
  return (
    <div className="date-time-field" ref={field}>
      <span className="field-caption">{label}</span>
      {manual ? (
        <div className="date-time-manual">
          <input
            type="datetime-local"
            step="60"
            required={!allowEmpty}
            value={value.slice(0, 16)}
            aria-label={`${label}日時`}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`${label}をホイールで選ぶ`}
            onClick={() => {
              setManual(false);
              onOpen(true);
            }}
          >
            <ChevronDown size={17} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`date-time-value ${open ? "is-open" : ""}`}
          aria-expanded={open}
          aria-label={`${label}日時 ${value ? value.slice(0, 16).replace("T", " ") : allowEmpty ? "計測中" : "日時を選択"}`}
          onClick={() => {
            fallback.current = currentTime();
            onOpen(!open);
          }}
        >
          <span>
            {value ? value.slice(0, 10).replaceAll("-", "/") : allowEmpty ? "計測中" : "日時を選択"}
          </span>
          <strong>{value ? value.slice(11, 16) : "—"}</strong>
          <ChevronDown size={16} />
        </button>
      )}
      {open && !manual && (
        <section className="date-time-picker" aria-label={`${label}日時を選択`}>
          <header>
            <div className="segmented">
              <button
                type="button"
                className={mode === "date" ? "selected" : ""}
                aria-pressed={mode === "date"}
                onClick={() => setMode("date")}
              >
                日付
              </button>
              <button
                type="button"
                className={mode === "time" ? "selected" : ""}
                aria-pressed={mode === "time"}
                onClick={() => setMode("time")}
              >
                時刻
              </button>
            </div>
            <button
              type="button"
              className="icon-button"
              title="直接入力"
              aria-label={`${label}日時を直接入力`}
              onClick={() => {
                setManual(true);
                onOpen(false);
                requestAnimationFrame(() => field.current?.querySelector("input")?.focus());
              }}
            >
              <Keyboard size={18} />
            </button>
          </header>
          <div className={`date-wheel-group ${mode === "time" ? "is-time" : ""}`}>
            <div className="date-wheel-selection" />
            {fields.map((f) => (
              <Wheel
                key={f.part}
                label={`${label}の${f.label}`}
                values={f.values}
                suffix={f.suffix}
                value={p[f.part]}
                onChange={(n) => onChange(replaceDatePart(draft, f.part, n).slice(0, 16))}
              />
            ))}
          </div>
          <footer>
            {allowEmpty && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onChange("");
                  onOpen(false);
                }}
              >
                計測中にする
              </button>
            )}
            <button
              type="button"
              className="text-button date-time-now"
              onClick={() => onChange(currentTime().slice(0, 16))}
            >
              <RotateCcw size={13} />
              現在
            </button>
            <button
              type="button"
              className="outline-button"
              onClick={() => {
                if (!value) onChange(draft);
                onOpen(false);
              }}
            >
              <Check size={14} />
              完了
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
