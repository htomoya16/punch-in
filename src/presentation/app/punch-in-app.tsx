"use client";

import { lazy, Suspense, useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AppState } from "../../application/contracts/app-state";
import type { Backup } from "../../application/contracts/backup";
import type { BackupImportPreview } from "../../application/contracts/client-action";
import { formatHistoryCsv } from "../../application/export/history-csv";
import { formatStatisticsCsv } from "../../application/export/statistics-csv";
import type { WorkCategory } from "../../domain/categories/work-category";
import type { UserPreferences } from "../../domain/settings/user-preferences";
import type { UserProfile } from "../../domain/profile/user-profile";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import {
  findLatestWorkEntry,
  getWorkEntries,
  getWorkEntryId,
} from "../../domain/tracking/work-entry";
import { getWorkEntryMemoKey } from "../../domain/tracking/work-entry-memo";
import { downloadTextFile } from "../../infrastructure/browser/download-file";
import { PALETTE } from "../../shared/colors/category-palette";
import { contrastText, readableColor } from "../../shared/colors/color-contrast";
import { periodRange, resolveBusinessDay, type Period } from "../../shared/time/calendar";
import { CategoriesScreen } from "../categories/categories-screen";
import { Empty } from "../components/empty-records";
import { HistoryRecords } from "../history/history-records";
import { HistoryToolbar } from "../history/history-toolbar";
import { useHistorySelection } from "../history/use-history-selection";
import { useDailyNotePanel } from "../notes/use-daily-note-panel";
import { ProfileEditor } from "../profile/profile-editor";
import { useProfile } from "../profile/use-profile";
import { SettingsScreen } from "../settings/settings-screen";
import { useAppSynchronization } from "../state/use-app-synchronization";
import { StatisticsScreen } from "../statistics/statistics-screen";
import { useStatisticsSummary } from "../statistics/use-statistics-summary";
import WorkRecords from "../tracking/components/work-records";
import { PunchScreen } from "../tracking/punch-screen";
import { recordTimeForDay } from "../tracking/record-editor";
import { TodayRecords } from "../tracking/today-records";
import { useTimerReminders } from "../tracking/use-timer-reminders";
import { useTrackingViewModel } from "../tracking/use-tracking-view-model";
import { AppDialogs } from "./app-dialogs";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import type { AppView } from "./app-types";
import { NAV } from "./navigation-items";
import { useResponsiveNavigation } from "./use-responsive-navigation";

export const NotesDock = lazy(() => import("../notes/components/notes-dock"));

export default function PunchInApp({
  initial,
  initialProfile,
  displayName,
  draftScope,
}: {
  initial: AppState;
  initialProfile: UserProfile;
  displayName: string;
  draftScope: string;
}) {
  const {
    state,
    pendingPunch,
    now,
    pending,
    toast,
    retry,
    setRetry,
    setToast,
    execute,
    mutate,
    getConfirmedState,
    memoStore,
    getCurrentServerTime,
    forgetSavedMemo,
  } = useAppSynchronization(initial, draftScope);
  const [view, setView] = useState<AppView>("punch");
  const profile = useProfile(initialProfile);
  const currentDisplayName = profile.profile.displayName || displayName;
  const { menu, setMenu, compactNavigation, menuButton, sidebarRef, closeMenu } =
    useResponsiveNavigation();

  const [deleteTarget, setDeleteTarget] = useState<{
    session: TrackingSession;
    categoryId?: string;
  } | null>(null);
  const [editingCategory, setEditingCategory] = useState<WorkCategory | null>(null);
  const [editingSession, setEditingSession] = useState<TrackingSession | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    text: string;
    run: () => void | Promise<boolean>;
  } | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const confirmBusy = useRef(false);
  const [prefs, setPrefs] = useState<UserPreferences>(initial.preferences);
  const today = resolveBusinessDay(now, state.preferences.dayStart, state.preferences.timezone);
  const [visibleHistoryDay, setVisibleHistoryDay] = useState(today);
  const onHistoryActive = useCallback((day: string) => setVisibleHistoryDay(day), []);
  const [historyPage, setHistoryPage] = useState(today);
  const [historyFocus, setHistoryFocus] = useState(0);
  const [historyLanding, setHistoryLanding] = useState<"overview" | "day">("overview");
  const [weekFrom, weekTo] = useMemo(() => periodRange("week", historyPage), [historyPage]);
  const [historyRange, setHistoryRange] = useState(false);
  const [historyDay, updateHistoryDay] = useState(today);
  const [historyTo, setHistoryTo] = useState(today);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const {
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
  } = useDailyNotePanel({ today, view });

  function setHistoryDay(day: string) {
    updateHistoryDay(day);
    setHistoryPage(day);
    setHistoryLanding("day");
    setHistoryFocus((v) => v + 1);
  }

  async function exportBackup() {
    if (exporting) return;
    setExporting(true);
    try {
      if (!(await memoStore.flushAll()))
        throw new Error("打刻メモの保存を確認してから書き出してください");
      if (notesHandle.current && !(await notesHandle.current.flushAll()))
        throw new Error("メモの保存を確認してから書き出してください");
      const response = await fetch("/api/export", { cache: "no-store" });
      if (!response.ok) throw new Error("書き出せませんでした");
      downloadTextFile(await response.text(), `punch-in-${today}.json`, "application/json");
    } catch (error) {
      setToast({
        text: error instanceof Error ? error.message : "書き出せませんでした",
        error: true,
      });
    } finally {
      setExporting(false);
    }
  }

  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState(today);
  const [statsFilter, setStatsFilter] = useState("");
  const [backup, setBackup] = useState<Backup | null>(null);
  const [preview, setPreview] = useState<BackupImportPreview | null>(null);
  const [includePrefs, setIncludePrefs] = useState(true);

  const {
    categoryMap,
    running,
    runningCategory,
    runningEntryTimes,
    runningTimes,
    timerColors,
    displaySession,
    displayCategory,
    daily,
    visibleDaily,
    dailyTotal,
    activeCats,
    visibleCats,
    buttonPositions,
    dateFormatter,
  } = useTrackingViewModel({ state, now, today });
  const { permission, setPermission } = useTimerReminders({
    pendingPunch,
    running,
    state,
    now,
    runningCategory,
    setToast,
  });

  function go(next: AppView, historyFocusDay?: string) {
    if (next === "punch") {
      setNoteTarget((target) =>
        target.open && target.day !== today ? { ...target, day: today, reveal: undefined } : target,
      );
    }

    if (next === "history") {
      setHistoryLanding(historyFocusDay ? "day" : "overview");
      setHistoryRange(false);
      setHistoryPage(historyFocusDay ?? today);
      setVisibleHistoryDay(historyFocusDay ?? today);
      setHistoryFocus((v) => v + 1);
    }
    setView(next);
    if (next !== view && next !== "history")
      requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }),
      );
    if (menu) closeMenu();
    if (next === "settings") setPrefs(state.preferences);
  }

  const openStatsHistory = useCallback((start: string, end: string, categoryId: string) => {
    updateHistoryDay(start);
    setHistoryLanding("day");
    setHistoryPage(start);
    setVisibleHistoryDay(start);
    setHistoryFocus((v) => v + 1);
    setHistoryTo(end);
    setHistoryRange(start !== end);
    setFilter(categoryId);
    setQuery("");
    setView("history");
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);
  const editSession = useCallback(
    async (session: TrackingSession) => {
      if (
        !(
          await Promise.all(
            getWorkEntries(session).map((m) =>
              memoStore.flush(getWorkEntryMemoKey(session, getWorkEntryId(m))),
            ),
          )
        ).every(Boolean)
      ) {
        setToast({ text: "メモの保存を確認してください", error: true });
        return;
      }
      setEditingSession(getConfirmedState().sessions.find((s) => s.id === session.id) ?? session);
    },
    [memoStore],
  );

  function requestDeleteSession(session: TrackingSession, categoryId?: string) {
    setDeleteTarget({ session, categoryId });
  }

  async function deleteRecord(session: TrackingSession, categoryId?: string) {
    if (
      !(
        await Promise.all(
          getWorkEntries(session).map((m) =>
            memoStore.flush(getWorkEntryMemoKey(session, getWorkEntryId(m))),
          ),
        )
      ).every(Boolean)
    ) {
      setToast({ text: "メモの保存を確認してください", error: true });
      return false;
    }
    if (
      !(await mutate(
        categoryId ? "work" : "deleteSession",
        categoryId
          ? { id: session.id, control: "remove", memberId: categoryId }
          : { id: session.id },
        categoryId ? "作業の記録を削除しました" : "記録を削除しました",
      ))
    )
      return false;
    for (const m of getWorkEntries(session).filter(
      (m) => !categoryId || getWorkEntryId(m) === categoryId,
    )) {
      const key = getWorkEntryMemoKey(session, getWorkEntryId(m));
      memoStore.discard(key);
      forgetSavedMemo(key);
    }
    setEditingSession((current) => (current?.id === session.id ? null : current));
    return true;
  }

  function closeConfirm() {
    if (!confirmBusy.current) setConfirm(null);
  }

  async function runConfirm() {
    if (!confirm || confirmBusy.current) return;
    confirmBusy.current = true;
    setConfirmPending(true);
    try {
      if ((await confirm.run()) !== false) setConfirm(null);
    } finally {
      confirmBusy.current = false;
      setConfirmPending(false);
    }
  }

  function memberState(id: string) {
    return running ? findLatestWorkEntry(running, id)?.state : undefined;
  }

  function category(id: string) {
    return categoryMap.get(id);
  }

  function addCategory() {
    setEditingCategory({
      id: crypto.randomUUID(),
      name: "",
      color: PALETTE[state.categories.length % PALETTE.length],
      hidden: false,
      archived: false,
      position: Math.max(-1, ...state.categories.map((c) => c.position)) + 1,
    });
  }

  function addSession(day: string) {
    const stamp = recordTimeForDay(day, getCurrentServerTime(), state.preferences);
    setEditingSession({
      id: crypto.randomUUID(),
      categoryId: state.categories.find((c) => !c.archived)?.id ?? "",
      startedAt: stamp,
      endedAt: stamp,
      businessDay: day,
      dayStart: state.preferences.dayStart,
      timezone: state.preferences.timezone,
      memo: "",
      createdAt: now,
      updatedAt: now,
    });
  }

  async function reorder(id: string, direction: number) {
    const cats = state.categories.filter((c) => !c.archived);
    const i = cats.findIndex((c) => c.id === id);
    const j = i + direction;
    if (j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    await mutate("reorder", { ids: cats.map((c) => c.id) });
  }

  const { history, timelineSessions } = useHistorySelection({
    state,
    weekFrom,
    weekTo,
    historyRange,
    historyDay,
    historyTo,
    filter,
    query,
    memoStore,
    categoryMap,
  });
  const {
    from,
    to,
    selected,
    creditedTotal,
    priorTotal,
    selectedRunning,
    summaries,
    selectedActive,
    previousActive,
  } = useStatisticsSummary({ state, period, anchor, statsFilter, now });

  const theme = view === "settings" ? prefs : state.preferences;
  const style = {
    "--accent": theme.accent,
    "--accent-ink": contrastText(theme.accent),
    "--accent-link": readableColor(theme.accent),
    "--sidebar": theme.sidebar,
    "--sidebar-ink": contrastText(theme.sidebar),
  } as CSSProperties;

  function recordTable(list: TrackingSession[], showIntervals = false) {
    return list.length ? (
      <WorkRecords
        seconds={view === "punch"}
        showIntervals={showIntervals}
        sessions={list}
        categories={state.categories}
        now={now}
        store={memoStore}
        pending={pending}
        onEdit={(s) => void editSession(s)}
        onDelete={requestDeleteSession}
      />
    ) : (
      <Empty />
    );
  }

  async function exportRecords() {
    if (!(await memoStore.flushAll())) {
      setToast({ text: "メモの保存を確認してから書き出してください", error: true });
      return;
    }
    const current = new Map(getConfirmedState().sessions.map((s) => [s.id, s]));
    const rows = history.map((s) => current.get(s.id) ?? s);
    downloadTextFile(
      formatHistoryCsv(rows, state.categories, now),
      `punch-in-records-${historyDay}.csv`,
      "text/csv;charset=utf-8",
    );
  }

  function exportStats() {
    const content = formatStatisticsCsv({
      categories: state.categories,
      categoryFilter: statsFilter,
      period,
      from,
      to,
      sessions: selected,
      now,
      totalMs: creditedTotal,
      includesRunning: selectedRunning,
    });
    downloadTextFile(content, "punch-in-summary.csv", "text/csv;charset=utf-8");
  }

  async function loadBackup(file: File) {
    setBackup(null);
    setPreview(null);
    if (file.size > 16000000) {
      setToast({ text: "ファイルは16MB以内にしてください", error: true });
      return;
    }
    try {
      const value = JSON.parse(await file.text()) as Backup;
      const result = await mutate("importPreview", { backup: value });
      if (result?.preview) {
        setBackup(value);
        setPreview(result.preview);
      }
    } catch {
      setToast({ text: "JSONファイルを読み込めません", error: true });
    }
  }

  return (
    <div className={`app ${noteTarget.open ? "notes-open" : ""}`} style={style}>
      <AppHeader
        displayName={currentDisplayName}
        avatarId={profile.profile.avatarId}
        openProfile={profile.open}
        noteButton={noteButton}
        notesOpen={noteTarget.open}
        noteError={noteError}
        toggleNotes={() => (noteTarget.open ? closeNotes() : openNotes(noteTarget.day))}
        closeMenu={closeMenu}
        compactNavigation={compactNavigation}
        go={go}
        menu={menu}
        menuButton={menuButton}
        setMenu={setMenu}
      />
      {menu && (
        <button className="sidebar-backdrop" aria-label="メニューを閉じる" onClick={closeMenu} />
      )}
      <AppSidebar
        closeMenu={closeMenu}
        compactNavigation={compactNavigation}
        dailyTotal={dailyTotal}
        go={go}
        menu={menu}
        sidebarRef={sidebarRef}
        today={today}
        view={view}
      />
      <main className="main" inert={compactNavigation && menu}>
        <div className="page-heading">
          <h1>{NAV.find((n) => n.id === view)?.label}</h1>
        </div>
        <div className={`page-content ${view === "punch" ? "punch-content" : ""}`}>
          <div key={view} className="workspace-primary">
            {view === "punch" && (
              <PunchScreen
                addCategory={addCategory}
                buttonPositions={buttonPositions}
                category={category}
                dateFormatter={dateFormatter}
                displayCategory={displayCategory}
                displaySession={displaySession}
                editSession={editSession}
                go={go}
                memberState={memberState}
                mutate={mutate}
                now={now}
                pending={pending}
                pendingPunch={pendingPunch}
                running={running}
                runningCategory={runningCategory}
                runningEntryTimes={runningEntryTimes}
                setHistoryDay={setHistoryDay}
                setHistoryTo={setHistoryTo}
                state={state}
                timerColors={timerColors}
                today={today}
                visibleCats={visibleCats}
              />
            )}
            {view === "history" && (
              <HistoryToolbar
                exportRecords={exportRecords}
                filter={filter}
                historyDay={historyDay}
                historyRange={historyRange}
                historyTo={historyTo}
                query={query}
                setFilter={setFilter}
                setHistoryDay={setHistoryDay}
                setHistoryRange={setHistoryRange}
                setHistoryTo={setHistoryTo}
                setQuery={setQuery}
                state={state}
                visibleHistoryDay={visibleHistoryDay}
              />
            )}
            {view === "stats" && (
              <StatisticsScreen
                anchor={anchor}
                creditedTotal={creditedTotal}
                exportStats={exportStats}
                from={from}
                now={now}
                openStatsHistory={openStatsHistory}
                period={period}
                previousActive={previousActive}
                priorTotal={priorTotal}
                runningTimes={runningTimes}
                selected={selected}
                selectedActive={selectedActive}
                selectedRunning={selectedRunning}
                setAnchor={setAnchor}
                setPeriod={setPeriod}
                setStatsFilter={setStatsFilter}
                state={state}
                statsFilter={statsFilter}
                summaries={summaries}
                to={to}
                today={today}
              />
            )}
            {view === "categories" && (
              <CategoriesScreen
                activeCats={activeCats}
                addCategory={addCategory}
                memberState={memberState}
                mutate={mutate}
                pending={pending}
                reorder={reorder}
                setConfirm={setConfirm}
                setEditingCategory={setEditingCategory}
              />
            )}
            {view === "settings" && (
              <SettingsScreen
                backup={backup}
                exportBackup={exportBackup}
                exporting={exporting}
                includePrefs={includePrefs}
                loadBackup={loadBackup}
                mutate={mutate}
                notesHandle={notesHandle}
                pending={pending}
                permission={permission}
                prefs={prefs}
                preview={preview}
                setBackup={setBackup}
                setIncludePrefs={setIncludePrefs}
                setPermission={setPermission}
                setPrefs={setPrefs}
                setPreview={setPreview}
              />
            )}
          </div>
          {notesActivated && (
            <Suspense fallback={null}>
              <NotesDock
                scope={draftScope}
                target={noteTarget}
                selectDay={selectNoteDay}
                close={closeNotes}
                ready={notesReady}
                reportError={setNoteError}
              />
            </Suspense>
          )}
          {view === "punch" && (
            <TodayRecords
              daily={daily}
              dailyTotal={dailyTotal}
              go={go}
              recordTable={recordTable}
              setHistoryDay={setHistoryDay}
              setHistoryTo={setHistoryTo}
              today={today}
              visibleDaily={visibleDaily}
            />
          )}
          {view === "history" && (
            <HistoryRecords
              addSession={addSession}
              editSession={editSession}
              filter={filter}
              history={history}
              historyDay={historyDay}
              historyFocus={historyFocus}
              historyLanding={historyLanding}
              historyPage={historyPage}
              historyRange={historyRange}
              historyTo={historyTo}
              noteTarget={noteTarget}
              now={now}
              onHistoryActive={onHistoryActive}
              openNotes={openNotes}
              recordTable={recordTable}
              setHistoryFocus={setHistoryFocus}
              setHistoryLanding={setHistoryLanding}
              setHistoryPage={setHistoryPage}
              setHistoryRange={setHistoryRange}
              state={state}
              timelineSessions={timelineSessions}
              today={today}
            />
          )}
        </div>
      </main>
      {profile.isOpen && (
        <ProfileEditor
          profile={profile.profile}
          fallbackName={displayName}
          isSaving={profile.isSaving}
          error={profile.error}
          save={profile.save}
          close={profile.close}
        />
      )}
      <AppDialogs
        closeConfirm={closeConfirm}
        confirm={confirm}
        confirmPending={confirmPending}
        deleteRecord={deleteRecord}
        deleteTarget={deleteTarget}
        editingCategory={editingCategory}
        editingSession={editingSession}
        execute={execute}
        getCurrentServerTime={getCurrentServerTime}
        mutate={mutate}
        pending={pending}
        requestDeleteSession={requestDeleteSession}
        retry={retry}
        runConfirm={runConfirm}
        setDeleteTarget={setDeleteTarget}
        setEditingCategory={setEditingCategory}
        setEditingSession={setEditingSession}
        setRetry={setRetry}
        setToast={setToast}
        state={state}
        toast={toast}
      />
    </div>
  );
}
