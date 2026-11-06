"use client";

import { Check, Download, LoaderCircle, Upload } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AppActionName } from "../../application/contracts/app-action";
import type { Backup } from "../../application/contracts/backup";
import type {
  AppActionResult,
  BackupImportPreview,
} from "../../application/contracts/client-action";
import type { UserPreferences } from "../../domain/settings/user-preferences";
import { formatDayStartTime } from "../../shared/time/date-time-format";
import { ColorInput } from "../components/color-input";
import type { NotesHandle } from "../notes/components/notes-dock";

type Props = {
  backup: Backup | null;
  exportBackup: () => Promise<void>;
  exporting: boolean;
  includePrefs: boolean;
  loadBackup: (file: File) => Promise<void>;
  mutate: (
    action: AppActionName,
    payload: unknown,
    success?: string,
  ) => Promise<AppActionResult | null>;
  notesHandle: RefObject<NotesHandle | null>;
  pending: boolean;
  permission: string;
  prefs: UserPreferences;
  preview: BackupImportPreview | null;
  setBackup: Dispatch<SetStateAction<Backup | null>>;
  setIncludePrefs: Dispatch<SetStateAction<boolean>>;
  setPermission: Dispatch<SetStateAction<string>>;
  setPrefs: Dispatch<SetStateAction<UserPreferences>>;
  setPreview: Dispatch<SetStateAction<BackupImportPreview | null>>;
};

export function SettingsScreen({
  backup,
  exportBackup,
  exporting,
  includePrefs,
  loadBackup,
  mutate,
  notesHandle,
  pending,
  permission,
  prefs,
  preview,
  setBackup,
  setIncludePrefs,
  setPermission,
  setPrefs,
  setPreview,
}: Props) {
  return (
    <div className="settings-layout">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await mutate("preferences", prefs, "設定を保存しました");
          if (r?.state) setPrefs(r.state.preferences);
        }}
      >
        <section className="settings-section">
          <h2>時間の設定</h2>
          <label className="setting-row">
            <span>1日の開始</span>
            <input
              required
              type="time"
              value={formatDayStartTime(prefs.dayStart)}
              onChange={(e) => {
                if (e.target.value) {
                  const [h, m] = e.target.value.split(":").map(Number);
                  setPrefs({ ...prefs, dayStart: h * 60 + m });
                }
              }}
            />
          </label>
          <label className="setting-row">
            <span>タイムゾーン</span>
            <input
              required
              list="timezones"
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
            />
            <datalist id="timezones">
              {[
                "Asia/Tokyo",
                "UTC",
                "Asia/Seoul",
                "Asia/Shanghai",
                "Asia/Singapore",
                "America/New_York",
                "America/Los_Angeles",
                "Europe/London",
                "Europe/Paris",
                "Australia/Sydney",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </datalist>
          </label>
        </section>
        <section className="settings-section">
          <h2>カラー</h2>
          <label className="setting-row">
            <span>アクセント</span>
            <ColorInput
              value={prefs.accent}
              onChange={(accent) => setPrefs({ ...prefs, accent })}
            />
          </label>
          <label className="setting-row">
            <span>サイドバー</span>
            <ColorInput
              value={prefs.sidebar}
              onChange={(sidebar) => setPrefs({ ...prefs, sidebar })}
            />
          </label>
          <button
            type="button"
            className="text-button reset-colors"
            onClick={() => setPrefs({ ...prefs, accent: "#168ab5", sidebar: "#000000" })}
          >
            初期カラーに戻す
          </button>
        </section>
        <section className="settings-section">
          <h2>終了忘れの通知</h2>
          <label className="setting-row">
            <span>通知する</span>
            <input
              className="switch"
              type="checkbox"
              checked={prefs.reminderEnabled}
              onChange={async (e) => {
                const checked = e.target.checked;
                setPrefs({ ...prefs, reminderEnabled: checked });
                if (checked && "Notification" in window && Notification.permission === "default")
                  setPermission(await Notification.requestPermission());
              }}
            />
          </label>
          {prefs.reminderEnabled && (
            <>
              <label className="setting-row">
                <span>開始から</span>
                <div className="input-unit">
                  <input
                    required
                    type="number"
                    min="1"
                    max="10080"
                    value={prefs.reminderMinutes}
                    onChange={(e) =>
                      setPrefs({ ...prefs, reminderMinutes: Number(e.target.value) })
                    }
                  />
                  <span>分</span>
                </div>
              </label>
              <p className="field-note">
                アプリを開いている間に通知します。
                {permission === "denied" ? "ブラウザ通知は端末の設定で許可できます。" : ""}
              </p>
            </>
          )}
        </section>
        <div className="settings-save">
          <button className="primary-button" disabled={pending}>
            {pending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
            保存する
          </button>
        </div>
      </form>
      <section className="settings-section data-section">
        <h2>データの引き継ぎ</h2>
        <div className="data-actions">
          <button
            className="outline-button"
            disabled={exporting}
            onClick={() => void exportBackup()}
          >
            {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
            すべて書き出す（JSON）
          </button>
          <label className={`outline-button ${pending ? "disabled" : ""}`}>
            <Upload size={17} />
            取り込む（JSON）
            <input
              className="sr-only"
              type="file"
              accept=".json,application/json"
              disabled={pending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadBackup(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="field-note">記録・日別メモ・テンプレート・作業・個人設定を含みます。</p>
        {preview && backup && (
          <div className="import-preview">
            <h3>取り込み内容</h3>
            <dl>
              <div>
                <dt>新しい作業</dt>
                <dd>{preview.categories}種類</dd>
              </div>
              <div>
                <dt>新しい記録</dt>
                <dd>{preview.sessions}件</dd>
              </div>
              <div>
                <dt>新しい日別メモ</dt>
                <dd>{preview.dailyNotes}日分</dd>
              </div>
              <div>
                <dt>既存のためスキップ</dt>
                <dd>
                  作業 {preview.skippedCategories}種類 / 記録 {preview.skippedSessions}件 / メモ{" "}
                  {preview.skippedDailyNotes}日分
                </dd>
              </div>
            </dl>
            {preview.running && <p className="field-note">計測中の記録も復元されます。</p>}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includePrefs}
                onChange={(e) => setIncludePrefs(e.target.checked)}
              />
              個人設定も取り込む
            </label>
            <div className="modal-actions">
              <button
                className="outline-button"
                onClick={() => {
                  setBackup(null);
                  setPreview(null);
                }}
              >
                キャンセル
              </button>
              <button
                className="primary-button"
                disabled={pending}
                onClick={async () => {
                  const r = await mutate(
                    "import",
                    { backup, includePreferences: includePrefs },
                    "取り込みが完了しました",
                  );
                  if (r?.state) {
                    notesHandle.current?.refresh();
                    setPrefs(r.state.preferences);
                    setBackup(null);
                    setPreview(null);
                  }
                }}
              >
                取り込む
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
