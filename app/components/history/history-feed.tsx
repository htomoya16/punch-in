"use client";
import DurationValue from "../time/duration-value";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Category, Session } from "../../../lib/model";
import { weekDays } from "../../../lib/history-week";
import { duration, readableDate, shiftDay } from "../../../lib/time";
import WeekTimeline from "./week-timeline";
type Props = {
  sessions: Session[];
  timelineSessions: Session[];
  categoryFilter: string;
  dayStart: number;
  timezone: string;
  categories: Category[];
  anchor: string;
  focusRequest: number;
  focusMode: "overview" | "day";
  now: number;
  openedDay?: string;
  range?: [string, string];
  onToday(): void;
  onActiveDay(day: string): void;
  onPage(day: string): void;
  addRecord(day: string): void;
  openNotes(day: string): void;
  onEdit(s: Session): void;
  renderRecords(rows: Session[]): ReactNode;
};
export default memo(function HistoryFeed({
  sessions,
  timelineSessions,
  categoryFilter,
  dayStart,
  timezone,
  categories,
  anchor,
  focusRequest,
  focusMode,
  now,
  openedDay,
  range,
  onToday,
  onActiveDay,
  onPage,
  addRecord,
  openNotes,
  onEdit,
  renderRecords,
}: Props) {
  const groups = useMemo(() => weekDays(anchor, sessions), [anchor, sessions]),
    from = groups[0].day,
    to = groups[6].day;
  const [active, setActive] = useState(anchor),
    [rowLimits, setRowLimits] = useState<Record<string, number>>({}),
    [bottomSpace, setBottomSpace] = useState(24);
  const feed = useRef<HTMLElement>(null),
    sticky = useRef<HTMLElement>(null),
    sections = useRef(new Map<string, HTMLElement>()),
    lock = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const align = useCallback((day?: string) => {
    const section = day ? sections.current.get(day) : feed.current,
      nav = sticky.current;
    if (section && nav) {
      const top =
        section.getBoundingClientRect().top +
        scrollY -
        (document.querySelector(".topbar")?.getBoundingClientRect().height ?? 52) -
        (day ? nav.getBoundingClientRect().height + 8 : 0);
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" as ScrollBehavior });
    }
  }, []);
  const focusDay = useCallback(
    (day: string) => {
      lock.current = performance.now() + 600;
      setActive(day);
      requestAnimationFrame(() => align(day));
    },
    [align],
  );
  function selectDay(day: string) {
    lock.current = performance.now() + 600;
    setActive(day);
    openNotes(day);
    clearTimeout(timer.current);
    if (!matchMedia("(max-width:760px)").matches) {
      requestAnimationFrame(() => align(day));
      timer.current = setTimeout(() => align(day), 280);
    }
  }
  useEffect(() => onActiveDay(active), [active, onActiveDay]);
  useLayoutEffect(() => {
    setActive(anchor);
    setRowLimits({});
    lock.current = Infinity;
    let frame = 0,
      cancelled = false;
    const place = () => {
      if (!cancelled) align(focusMode === "day" ? anchor : undefined);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const cancel = () => {
      cancelled = true;
      lock.current = 0;
      clearTimeout(settle);
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    const key = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Tab"].includes(e.key))
        cancel();
    };
    const observer = new ResizeObserver(schedule);
    if (sticky.current) observer.observe(sticky.current);
    const section = focusMode === "day" ? sections.current.get(anchor) : feed.current;
    if (section) observer.observe(section);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(place);
    });
    const settle = setTimeout(() => {
      place();
      observer.disconnect();
      frame = requestAnimationFrame(() => {
        lock.current = 0;
      });
    }, 350);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      cancel();
      clearTimeout(timer.current);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [anchor, focusRequest, focusMode, align]);
  useEffect(() => {
    const last = sections.current.get(to);
    const measure = () => {
      const footer =
          feed.current?.querySelector(".history-week-footer")?.getBoundingClientRect().height ?? 0,
        page = document.querySelector(".page-content"),
        padding = page ? parseFloat(getComputedStyle(page).paddingBottom) : 0;
      setBottomSpace(
        Math.max(
          24,
          Math.ceil(
            innerHeight -
              footer -
              padding -
              (document.querySelector(".topbar")?.getBoundingClientRect().height ?? 52) -
              (sticky.current?.getBoundingClientRect().height ?? 44) -
              (last?.getBoundingClientRect().height ?? 0) -
              8,
          ),
        ),
      );
    };
    const observer = new ResizeObserver(measure);
    if (last) observer.observe(last);
    if (sticky.current) observer.observe(sticky.current);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [to]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (performance.now() < lock.current) return;
      const threshold = (sticky.current?.getBoundingClientRect().bottom ?? 0) + 18;
      let day: string | undefined;
      for (const group of groups) {
        const el = sections.current.get(group.day);
        if (el && el.getBoundingClientRect().top <= threshold) day = group.day;
        else break;
      }
      if (day) setActive(day);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [groups]);
  const label = `${from.replaceAll("-", "/")} — ${from.slice(0, 4) === to.slice(0, 4) ? to.slice(5).replace("-", "/") : to.replaceAll("-", "/")}`;
  return (
    <section className="history-feed weekly-history" aria-label="週ごとの履歴" ref={feed}>
      <nav className="history-week-navigation history-sticky" ref={sticky} aria-label="履歴の週">
        <button
          className="icon-button"
          aria-label="前の週"
          disabled={!!range && from <= range[0]}
          onClick={() => onPage(shiftDay(from, -7))}
        >
          <ChevronLeft size={18} />
        </button>
        <time>{label}</time>
        <button
          className="icon-button"
          aria-label="次の週"
          disabled={!!range && to >= range[1]}
          onClick={() => onPage(shiftDay(from, 7))}
        >
          <ChevronRight size={18} />
        </button>
        <button className="subtle-button" onClick={onToday}>
          今週
        </button>
      </nav>
      <WeekTimeline
        anchor={anchor}
        categoryFilter={categoryFilter}
        activeDay={active}
        sessions={timelineSessions}
        categories={categories}
        dayStart={dayStart}
        timezone={timezone}
        now={now}
        onDay={focusDay}
        onEdit={onEdit}
      />
      <div className="history-days">
        {groups.map((group) => (
          <section
            key={group.day}
            className={`history-day ${active === group.day ? "is-active-day" : ""} ${openedDay === group.day ? "has-open-note" : ""} ${!group.sessions.length ? "is-empty-day" : ""}`}
            data-history-day={group.day}
            ref={(el) => {
              if (el) sections.current.set(group.day, el);
              else sections.current.delete(group.day);
            }}
            aria-label={readableDate(group.day)}
          >
            <div className="history-day-band">
              <button
                className="history-day-heading"
                aria-label={`${group.day}の日別メモを開く`}
                aria-pressed={openedDay === group.day}
                onClick={() => selectDay(group.day)}
              >
                {readableDate(group.day)}
              </button>
              <strong className="history-day-total" title="記録時間">
                <DurationValue value={group.sessions.reduce((n, s) => n + duration(s, now), 0)} />
              </strong>
              <button
                className="icon-button history-day-add"
                aria-label={`${group.day}に記録を追加`}
                title="記録を追加"
                onClick={() => addRecord(group.day)}
              >
                <Plus size={18} />
              </button>
            </div>
            {group.sessions.length ? (
              renderRecords(group.sessions.slice(0, rowLimits[group.day] ?? 40))
            ) : (
              <p className="history-day-empty">記録がありません</p>
            )}
            {group.sessions.length > (rowLimits[group.day] ?? 40) && (
              <button
                className="more-button"
                onClick={() =>
                  setRowLimits((v) => ({ ...v, [group.day]: (v[group.day] ?? 40) + 40 }))
                }
              >
                この日の記録をさらに表示
              </button>
            )}
          </section>
        ))}
      </div>
      <footer className="history-week-footer">
        <button
          className="text-button"
          disabled={!!range && from <= range[0]}
          onClick={() => onPage(shiftDay(from, -7))}
        >
          <ChevronLeft size={16} />
          前の週
        </button>
        <button
          className="text-button"
          disabled={!!range && to >= range[1]}
          onClick={() => onPage(shiftDay(from, 7))}
        >
          次の週
          <ChevronRight size={16} />
        </button>
      </footer>
      <div className="history-feed-end" style={{ height: bottomSpace }} />
    </section>
  );
});
