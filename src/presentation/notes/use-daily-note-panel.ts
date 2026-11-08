"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteTarget } from "../../domain/notes/daily-note";
import type { AppView } from "../app/app-types";
import type { NotesHandle } from "./components/notes-dock";

export function useDailyNotePanel({ today, view }: { today: string; view: AppView }) {
  const [noteTarget, setNoteTarget] = useState<NoteTarget>({ day: today, open: false });

  const [notesActivated, setNotesActivated] = useState(false);
  const [noteError, setNoteError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const noteReturnDay = useRef<string | null>(null);

  useEffect(() => {
    noteReturnDay.current = null;
  }, [view]);

  const notesHandle = useRef<NotesHandle | null>(null);
  const noteButton = useRef<HTMLButtonElement>(null);

  const notesReady = useCallback((handle: NotesHandle) => {
    notesHandle.current = handle;
  }, []);

  const closeNotes = useCallback(() => {
    setNoteTarget((target) => ({ ...target, open: false }));
    requestAnimationFrame(() => {
      noteButton.current?.focus({ preventScroll: true });
      if (noteReturnDay.current) {
        const day = noteReturnDay.current;
        noteReturnDay.current = null;
        document
          .querySelector(`[data-history-day="${day}"]`)
          ?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    });
  }, []);

  const selectNoteDay = useCallback((day: string) => {
    noteReturnDay.current = null;
    setNotesActivated(true);
    setNoteTarget({ day, open: true, reveal: Date.now() });
  }, []);

  function openNotes(day: string) {
    selectNoteDay(day);
    if (view === "history" && matchMedia("(max-width:760px)").matches) noteReturnDay.current = day;
  }

  return {
    noteTarget,
    setNoteTarget,
    notesActivated,
    noteError,
    setNoteError,
    exporting,
    setExporting,
    notesHandle,
    noteButton,
    notesReady,
    closeNotes,
    openNotes,
    selectNoteDay,
  };
}
