"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AppState } from "../../application/contracts/app-state";
import type { NoteTarget } from "../../domain/notes/daily-note";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import HistoryFeed from "./components/history-feed";

type Props = {
  addSession: (day: string) => void;
  editSession: (session: TrackingSession) => Promise<void>;
  filter: string;
  history: TrackingSession[];
  historyDay: string;
  historyFocus: number;
  historyLanding: "day" | "overview";
  historyPage: string;
  historyRange: boolean;
  historyTo: string;
  noteTarget: NoteTarget;
  now: number;
  onHistoryActive: (day: string) => void;
  openNotes: (day: string) => void;
  recordTable: (list: TrackingSession[], showIntervals?: boolean) => React.JSX.Element;
  setHistoryFocus: Dispatch<SetStateAction<number>>;
  setHistoryLanding: Dispatch<SetStateAction<"day" | "overview">>;
  setHistoryPage: Dispatch<SetStateAction<string>>;
  setHistoryRange: Dispatch<SetStateAction<boolean>>;
  state: AppState;
  timelineSessions: TrackingSession[];
  today: string;
};

export function HistoryRecords({
  addSession,
  editSession,
  filter,
  history,
  historyDay,
  historyFocus,
  historyLanding,
  historyPage,
  historyRange,
  historyTo,
  noteTarget,
  now,
  onHistoryActive,
  openNotes,
  recordTable,
  setHistoryFocus,
  setHistoryLanding,
  setHistoryPage,
  setHistoryRange,
  state,
  timelineSessions,
  today,
}: Props) {
  return (
    <HistoryFeed
      sessions={history}
      timelineSessions={timelineSessions}
      categoryFilter={filter}
      dayStart={state.preferences.dayStart}
      timezone={state.preferences.timezone}
      categories={state.categories}
      addRecord={addSession}
      anchor={historyPage}
      focusRequest={historyFocus}
      focusMode={historyLanding}
      now={now}
      range={historyRange ? [historyDay, historyTo] : undefined}
      onToday={() => {
        setHistoryLanding("overview");
        setHistoryRange(false);
        setHistoryPage(today);
        setHistoryFocus((v) => v + 1);
      }}
      openedDay={noteTarget.open ? noteTarget.day : undefined}
      onActiveDay={onHistoryActive}
      onPage={(day) => {
        setHistoryLanding("overview");
        setHistoryPage(day);
      }}
      openNotes={openNotes}
      onEdit={editSession}
      renderRecords={(rows) => recordTable(rows, true)}
    />
  );
}
