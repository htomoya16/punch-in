"use client";

import { ChevronDown, ChevronUp, Clock3, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppActionName } from "../../application/contracts/app-action";
import type { AppActionResult } from "../../application/contracts/client-action";
import type { WorkCategory } from "../../domain/categories/work-category";
import CategoriesReorder from "../components/categories-reorder";
import { Empty } from "../components/empty-records";

type Props = {
  activeCats: WorkCategory[];
  addCategory: () => void;
  memberState: (id: string) => "active" | "paused" | "finished" | undefined;
  mutate: (
    action: AppActionName,
    payload: unknown,
    success?: string,
  ) => Promise<AppActionResult | null>;
  pending: boolean;
  reorder: (id: string, direction: number) => Promise<void>;
  setConfirm: Dispatch<
    SetStateAction<{ title: string; text: string; run: () => void | Promise<boolean> } | null>
  >;
  setEditingCategory: Dispatch<SetStateAction<WorkCategory | null>>;
};

export function CategoriesScreen({
  activeCats,
  addCategory,
  memberState,
  mutate,
  pending,
  reorder,
  setConfirm,
  setEditingCategory,
}: Props) {
  return (
    <>
      <div className="toolbar">
        <span>{activeCats.length}種類</span>
        <button className="primary-button" onClick={addCategory}>
          <Plus size={16} />
          作業を追加
        </button>
      </div>
      {activeCats.length ? (
        <CategoriesReorder
          items={activeCats}
          pending={pending}
          save={async (ids) => !!(await mutate("reorder", { ids }))}
          renderItem={(c, i, handle) => (
            <div className={`category-row ${c.hidden ? "is-hidden" : ""}`} key={c.id}>
              <div className="category-order">
                {handle}
                <button
                  className="icon-button"
                  disabled={pending || i === 0}
                  onClick={() => void reorder(c.id, -1)}
                  aria-label={`${c.name}を上へ`}
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  className="icon-button"
                  disabled={pending || i === activeCats.length - 1}
                  onClick={() => void reorder(c.id, 1)}
                  aria-label={`${c.name}を下へ`}
                >
                  <ChevronDown size={15} />
                </button>
              </div>
              <span className="category-swatch" style={{ borderColor: c.color, color: c.color }}>
                <Clock3 size={24} strokeWidth={1.3} />
              </span>
              <strong>{c.name}</strong>
              {(memberState(c.id) === "active" || memberState(c.id) === "paused") && (
                <span className="live-tag">計測中</span>
              )}
              <div className="category-row-actions">
                <button
                  className="icon-button"
                  disabled={pending}
                  onClick={() => void mutate("category", { ...c, hidden: !c.hidden })}
                  aria-label={`${c.name}を${c.hidden ? "表示" : "非表示"}`}
                  title={c.hidden ? "表示する" : "非表示にする"}
                >
                  {c.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <button
                  className="icon-button"
                  onClick={() => setEditingCategory(c)}
                  aria-label={`${c.name}を編集`}
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="icon-button danger"
                  disabled={pending}
                  onClick={() =>
                    setConfirm({
                      title: "作業を削除",
                      text: `「${c.name}」を削除します。過去の記録は残ります。`,
                      run: async () =>
                        !!(await mutate("archiveCategory", { id: c.id }, "作業を削除しました")),
                    })
                  }
                  aria-label={`${c.name}を削除`}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          )}
        />
      ) : (
        <Empty text="作業を追加してください" />
      )}
    </>
  );
}
