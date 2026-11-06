"use client";

import { Download, Search } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppState } from "../../application/contracts/app-state";

type Props = {
  exportRecords: () => Promise<void>;
  filter: string;
  historyDay: string;
  historyRange: boolean;
  historyTo: string;
  query: string;
  setFilter: Dispatch<SetStateAction<string>>;
  setHistoryDay: (day: string) => void;
  setHistoryRange: Dispatch<SetStateAction<boolean>>;
  setHistoryTo: Dispatch<SetStateAction<string>>;
  setQuery: Dispatch<SetStateAction<string>>;
  state: AppState;
  visibleHistoryDay: string;
};

export function HistoryToolbar({
  exportRecords,
  filter,
  historyDay,
  historyRange,
  historyTo,
  query,
  setFilter,
  setHistoryDay,
  setHistoryRange,
  setHistoryTo,
  setQuery,
  state,
  visibleHistoryDay,
}: Props) {
  return (
    <>
      <div className="toolbar">
        <div className="date-navigation">
          <input
            aria-label={historyRange ? "履歴の開始日" : "履歴の日付"}
            type="date"
            value={historyRange ? historyDay : visibleHistoryDay}
            onChange={(e) => {
              if (!e.target.value) return;
              setHistoryDay(e.target.value);
              if (!historyRange || e.target.value > historyTo) setHistoryTo(e.target.value);
            }}
          />
          {historyRange && (
            <>
              <span className="date-dash">—</span>
              <input
                aria-label="履歴の終了日"
                type="date"
                value={historyTo}
                min={historyDay}
                onChange={(e) => {
                  if (e.target.value) setHistoryTo(e.target.value);
                }}
              />
            </>
          )}
          <button
            className="subtle-button"
            aria-pressed={historyRange}
            onClick={() => {
              setHistoryRange((v) => !v);
              setHistoryTo(historyDay);
            }}
          >
            期間
          </button>
        </div>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="作業・メモを検索"
            aria-label="作業・メモを検索"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
        </label>
        <select
          aria-label="作業で絞り込み"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        >
          <option value="">すべての作業</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.archived ? "（削除済み）" : ""}
            </option>
          ))}
        </select>
        <button className="text-button export-button" onClick={exportRecords}>
          <Download size={16} />
          CSV
        </button>
      </div>
    </>
  );
}
