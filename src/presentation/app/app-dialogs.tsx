"use client";

import { Bell, Check, LoaderCircle, RefreshCw, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppActionName } from "../../application/contracts/app-action";
import type { AppState } from "../../application/contracts/app-state";
import type { AppActionRequest, AppActionResult } from "../../application/contracts/client-action";
import type { WorkCategory } from "../../domain/categories/work-category";
import type { TrackingSession } from "../../domain/tracking/tracking-session";
import { formatMinuteDateTimeInput } from "../../shared/time/date-time-format";
import { CategoryEditor } from "../categories/category-editor";
import { Modal } from "../components/modal";
import { TrackingRecordEditor } from "../tracking/components/tracking-record-editor";
import DeleteRecord from "../tracking/components/delete-record";
import { SessionEditor } from "../tracking/components/session-editor";

type Props = {
  closeConfirm: () => void;
  confirm: { title: string; text: string; run: () => void | Promise<boolean> } | null;
  confirmPending: boolean;
  deleteRecord: (session: TrackingSession, categoryId?: string) => Promise<boolean>;
  deleteTarget: { session: TrackingSession; categoryId?: string } | null;
  editingCategory: WorkCategory | null;
  editingSession: TrackingSession | null;
  execute: (job: AppActionRequest, success?: string) => Promise<AppActionResult | null>;
  getCurrentServerTime: () => number;
  mutate: (
    action: AppActionName,
    payload: unknown,
    success?: string,
  ) => Promise<AppActionResult | null>;
  pending: boolean;
  requestDeleteSession: (session: TrackingSession, categoryId?: string) => void;
  retry: AppActionRequest | null;
  runConfirm: () => Promise<void>;
  setDeleteTarget: Dispatch<
    SetStateAction<{ session: TrackingSession; categoryId?: string } | null>
  >;
  setEditingCategory: Dispatch<SetStateAction<WorkCategory | null>>;
  setEditingSession: Dispatch<SetStateAction<TrackingSession | null>>;
  setRetry: Dispatch<SetStateAction<AppActionRequest | null>>;
  setToast: Dispatch<SetStateAction<{ text: string; error?: boolean } | null>>;
  state: AppState;
  toast: { text: string; error?: boolean } | null;
};

export function AppDialogs({
  closeConfirm,
  confirm,
  confirmPending,
  deleteRecord,
  deleteTarget,
  editingCategory,
  editingSession,
  execute,
  getCurrentServerTime,
  mutate,
  pending,
  requestDeleteSession,
  retry,
  runConfirm,
  setDeleteTarget,
  setEditingCategory,
  setEditingSession,
  setRetry,
  setToast,
  state,
  toast,
}: Props) {
  return (
    <>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <Bell size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          {toast.error && retry && (
            <button disabled={pending} onClick={() => void execute(retry, "完了しました")}>
              <RefreshCw size={14} />
              再試行
            </button>
          )}
          <button
            className="toast-close"
            onClick={() => {
              setToast(null);
              setRetry(null);
            }}
            aria-label="通知を閉じる"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {deleteTarget && (
        <Modal
          title="記録を削除"
          close={() => {
            if (!pending) setDeleteTarget(null);
          }}
        >
          <DeleteRecord
            session={deleteTarget.session}
            categoryId={deleteTarget.categoryId}
            categories={state.categories}
            pending={pending}
            close={() => setDeleteTarget(null)}
            remove={(categoryId) => deleteRecord(deleteTarget.session, categoryId)}
          />
        </Modal>
      )}
      {editingCategory && (
        <CategoryEditor
          value={editingCategory}
          pending={pending}
          errorMessage={retry?.action === "category" && toast?.error ? toast.text : undefined}
          close={() => setEditingCategory(null)}
          save={async (c) => {
            if (await mutate("category", c, "作業を保存しました")) setEditingCategory(null);
          }}
        />
      )}
      {editingSession?.work && (
        <Modal
          title="記録を編集"
          wide
          close={() => {
            if (!pending) setEditingSession(null);
          }}
        >
          <TrackingRecordEditor
            session={editingSession}
            categories={state.categories}
            pending={pending}
            errorMessage={toast?.error ? toast.text : undefined}
            now={getCurrentServerTime}
            close={() => setEditingSession(null)}
            save={async (payload) => {
              if (await mutate("work", payload, "記録を保存しました")) setEditingSession(null);
            }}
          />
        </Modal>
      )}

      {editingSession && !editingSession.work && (
        <SessionEditor
          value={editingSession}
          categories={state.categories}
          pending={pending}
          exists={state.sessions.some((s) => s.id === editingSession.id)}
          currentTime={() =>
            formatMinuteDateTimeInput(getCurrentServerTime(), editingSession.timezone)
          }
          errorMessage={retry?.action === "session" && toast?.error ? toast.text : undefined}
          close={() => setEditingSession(null)}
          save={async (s) => {
            if (await mutate("session", s, "記録を保存しました")) setEditingSession(null);
          }}
          remove={() => requestDeleteSession(editingSession)}
        />
      )}
      {confirm && (
        <Modal title={confirm.title} close={closeConfirm}>
          <p className="confirm-text">{confirm.text}</p>
          <div className="modal-actions">
            <button className="outline-button" disabled={confirmPending} onClick={closeConfirm}>
              キャンセル
            </button>
            <button
              className="danger-button"
              disabled={pending || confirmPending}
              onClick={() => void runConfirm()}
            >
              {confirmPending && <LoaderCircle size={15} className="spin" />}削除する
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
