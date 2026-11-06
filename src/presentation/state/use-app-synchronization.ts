"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppActionName } from "../../application/contracts/app-action";
import type { AppState, PendingPunch } from "../../application/contracts/app-state";
import type { AppActionRequest } from "../../application/contracts/client-action";
import { createClientServices } from "../../bootstrap/client-services";
import { findWorkEntryMemo, updateWorkEntryMemo } from "../../domain/tracking/work-entry-memo";
import { applyPunchDelta, projectPunch } from "./tracking-projection";

export function useAppSynchronization(initial: AppState, draftScope: string) {
  // Keep confirmed data separate from the provisional result shown during a punch.
  const [savedState, setState] = useState(initial);

  const [pendingPunch, setPendingPunch] = useState<PendingPunch | null>(null);

  const state = useMemo(
    () => (pendingPunch ? projectPunch(savedState, pendingPunch) : savedState),
    [savedState, pendingPunch],
  );

  const stateRef = useRef(savedState);

  // A memo save can arrive before the next full snapshot; preserve its acknowledgement.
  const memoAcknowledgements = useRef(
    new Map<
      string,
      {
        memo: string;
        revision: number;
      }
    >(),
  );

  const applyMemo = useCallback((id: string, memo: string, revision?: number) => {
    const current = stateRef.current;
    const old = current.sessions.find((s) => findWorkEntryMemo(s, id) !== undefined);
    if (revision !== undefined && revision < (current.memoRevision ?? 0))
      return old ? findWorkEntryMemo(old, id) : undefined;
    if (revision !== undefined) memoAcknowledgements.current.set(id, { memo, revision });
    else memoAcknowledgements.current.delete(id);
    if (!old || findWorkEntryMemo(old, id) === memo) return;
    const next = {
      ...current,
      sessions: current.sessions.map((s) => (s === old ? updateWorkEntryMemo(s, id, memo) : s)),
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const [services] = useState(() => createClientServices(draftScope, applyMemo));
  const memoStore = services.memos;
  useEffect(() => {
    const sync = () => {
      if (!document.hidden) void memoStore.flushAll();
    };
    const hide = () => {
      memoStore.persistAll();
      void memoStore.flushAll();
    };
    const leave = (event: BeforeUnloadEvent) => {
      memoStore.persistAll();
      if (memoStore.hasUnsaved()) {
        void memoStore.flushAll();
        event.preventDefault();
      }
    };
    window.addEventListener("online", sync);
    window.addEventListener("pagehide", hide);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("beforeunload", leave);
      memoStore.dispose();
    };
  }, [memoStore]);

  const refreshing = useRef(false);

  const [now, setNow] = useState(initial.serverNow);

  const [initialOffset] = useState(() => initial.serverNow - Date.now());

  const offset = useRef(initialOffset);

  const [pending, setPending] = useState(false);

  const busy = useRef(false);

  const [toast, setToast] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [retry, setRetry] = useState<AppActionRequest | null>(null);

  // Ignore delayed snapshots and retain memo values already acknowledged by the server.
  const update = useCallback((next: AppState) => {
    if (next.revision < stateRef.current.revision) return;
    const acknowledgements = memoAcknowledgements.current;
    for (const [id, ack] of acknowledgements)
      if (ack.revision <= (next.memoRevision ?? 0)) acknowledgements.delete(id);
    if (acknowledgements.size)
      next = {
        ...next,
        sessions: next.sessions.map((s) => {
          let result = s;
          for (const [key, ack] of acknowledgements)
            if (findWorkEntryMemo(result, key) !== undefined)
              result = updateWorkEntryMemo(result, key, ack.memo);
          return result;
        }),
      };
    offset.current = next.serverNow - Date.now();
    setNow(next.serverNow);
    if (
      next.revision > stateRef.current.revision ||
      (next.memoRevision ?? 0) > (stateRef.current.memoRevision ?? 0)
    ) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      if (!force && (busy.current || refreshing.current || document.hidden)) return false;
      refreshing.current = true;
      try {
        const sentAt = Date.now();
        const response = await services.api.readState(
          force ? undefined : stateRef.current.revision,
          stateRef.current.memoRevision ?? 0,
        );
        if (!force && busy.current) return false;
        if (response.status === 304) {
          const serverNow = response.serverNow;
          if (serverNow > 0) {
            offset.current = serverNow - (sentAt + Date.now()) / 2;
            setNow(Date.now() + offset.current);
          }
          return true;
        }
        if (response.state) {
          update(response.state);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        refreshing.current = false;
      }
    },
    [update],
  );

  useEffect(() => {
    void refresh();
    const tick = setInterval(() => setNow(Date.now() + offset.current), 1000);
    const poll = setInterval(() => void refresh(), 15000);
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast || toast.error) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // Retries reuse the original mutation identity so a lost response cannot duplicate a punch.
  async function execute(job: AppActionRequest, success?: string) {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setRetry(null);
    let retryable = true;
    if (
      job.action === "work" &&
      ["join", "pause", "resume", "finish", "end", "pauseAll", "resumeAll"].includes(
        (
          job.payload as {
            control: string;
          }
        ).control,
      )
    ) {
      const p = job.payload as {
        id: string;
        categoryId?: string;
        control: import("../../domain/tracking/work-entry").TrackingControl;
      };
      setPendingPunch({
        categoryId: p.categoryId ?? "",
        workId: p.id,
        control: p.control,
        mutationId: job.mutationId,
        baseRevision: job.expectedRevision,
        at: job.pressedAt ?? Math.round(Date.now() + offset.current),
      });
    }
    if (job.action === "punch") {
      const at = job.pressedAt ?? Math.round(Date.now() + offset.current);
      setNow(Date.now() + offset.current);
      setPendingPunch({
        categoryId: (
          job.payload as {
            categoryId: string;
          }
        ).categoryId,
        mutationId: job.mutationId,
        baseRevision: job.expectedRevision,
        at,
      });
    }
    try {
      if (job.action === "work" || job.action === "punch") {
        const current =
          job.action === "work"
            ? stateRef.current.sessions.find(
                (s) =>
                  s.id ===
                  (
                    job.payload as {
                      id: string;
                    }
                  ).id,
              )
            : stateRef.current.sessions.find(
                (s) =>
                  s.endedAt === null &&
                  s.categoryId !==
                    (
                      job.payload as {
                        categoryId: string;
                      }
                    ).categoryId,
              );
        if (current && !current.work && !(await memoStore.flush(current.id))) {
          retryable = false;
          throw new Error("メモの保存を確認してください");
        }
      }
      const r = await services.api.executeAction(job);
      const result = r.result;
      if (!r.ok) {
        retryable = r.status >= 500;
        setPendingPunch(null);
        if (r.status === 409) await refresh(true);
        throw new Error(result.error || "保存できませんでした");
      }
      if (result.punchDelta) {
        const next = applyPunchDelta(stateRef.current, result.punchDelta);
        if (next && next !== stateRef.current) update(next);
        else if (!next && !(await refresh(true))) {
          retryable = false;
          throw new Error(
            "保存は完了しましたが、表示を更新できませんでした。再読み込みしてください",
          );
        }
      }
      if (result.state) update(result.state);
      if (success) setToast({ text: success });
      return result;
    } catch (e) {
      setPendingPunch(null);
      const timedOut =
        e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      setToast({
        text: timedOut
          ? "保存結果を確認できませんでした。再試行してください"
          : e instanceof TypeError
            ? "通信できませんでした。接続を確認して再試行してください"
            : e instanceof SyntaxError
              ? "保存結果を確認できませんでした。再試行してください"
              : e instanceof Error
                ? e.message
                : "保存できませんでした",
        error: true,
      });
      setRetry(retryable ? job : null);
      if (retryable && job.action === "punch") void refresh(true);
      return null;
    } finally {
      setPendingPunch(null);
      busy.current = false;
      setPending(false);
    }
  }

  function mutate(action: AppActionName, payload: unknown, success?: string) {
    return execute(
      {
        action,
        payload,
        mutationId: crypto.randomUUID(),
        expectedRevision: stateRef.current.revision,
        ...(action === "punch" || action === "work"
          ? { responseMode: "delta" as const, pressedAt: Math.round(Date.now() + offset.current) }
          : {}),
      },
      success,
    );
  }

  return {
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
    getConfirmedState: () => stateRef.current,
    memoStore,
    getCurrentServerTime: () => Math.round(Date.now() + offset.current),
    forgetSavedMemo: (key: string) => memoAcknowledgements.current.delete(key),
  };
}
