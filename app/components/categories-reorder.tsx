"use client";
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import type { Category } from "../../lib/model";
type Drag = {
  id: string;
  startY: number;
  y: number;
  pointer: boolean;
  active: boolean;
  frame: number;
};
export default function CategoriesReorder({
  items,
  pending,
  save,
  renderItem,
}: {
  items: Category[];
  pending: boolean;
  save(ids: string[]): Promise<boolean>;
  renderItem(item: Category, index: number, handle: ReactNode): ReactNode;
}) {
  const [order, setOrder] = useState<string[] | null>(null),
    [dragging, setDragging] = useState<string | null>(null),
    [announcement, setAnnouncement] = useState("");
  const drag = useRef<Drag | null>(null),
    root = useRef<HTMLDivElement>(null),
    orderRef = useRef<string[] | null>(null),
    saving = useRef(false),
    itemsRef = useRef(items);
  itemsRef.current = items;
  const original = items.map((i) => i.id).join("\n");
  function preview(ids: string[] | null) {
    orderRef.current = ids;
    setOrder(ids);
  }
  function cancel() {
    if (drag.current) cancelAnimationFrame(drag.current.frame);
    drag.current = null;
    setDragging(null);
    preview(null);
  }
  useEffect(() => {
    if (drag.current || !saving.current) {
      cancel();
    }
  }, [original]);
  useEffect(
    () => () => {
      if (drag.current) cancelAnimationFrame(drag.current.frame);
    },
    [],
  );
  function move(id: string, index: number) {
    const ids = orderRef.current ?? itemsRef.current.map((i) => i.id),
      next = ids.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
    if (next.join("\n") === (orderRef.current ?? itemsRef.current.map((i) => i.id)).join("\n"))
      return;
    preview(next);
    setAnnouncement(`${itemsRef.current.find((i) => i.id === id)?.name}を${index + 1}番目に移動`);
  }
  function frame() {
    const d = drag.current;
    if (!d || !d.pointer || !d.active) return;
    const rows = [...root.current!.querySelectorAll<HTMLElement>("[data-reorder-id]")].filter(
      (el) => el.dataset.reorderId !== d.id,
    );
    const index = rows.findIndex(
      (el) => d.y < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2,
    );
    move(d.id, index < 0 ? rows.length : index);
    const header = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 52;
    const step = d.y > innerHeight - 48 ? 14 : d.y < header + 48 ? -14 : 0;
    if (step) {
      window.scrollBy(0, step);
      d.frame = requestAnimationFrame(frame);
    }
  }
  function down(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (pending || saving.current || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, startY: e.clientY, y: e.clientY, pointer: true, active: false, frame: 0 };
    preview(items.map((i) => i.id));
  }
  async function finish() {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.frame);
    drag.current = null;
    setDragging(null);
    const ids = orderRef.current;
    saving.current = true;
    try {
      if (d.active && ids && ids.join("\n") !== itemsRef.current.map((i) => i.id).join("\n"))
        await save(ids);
    } finally {
      saving.current = false;
      preview(null);
    }
  }
  const shown = (order ?? items.map((i) => i.id))
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Category => !!i);
  return (
    <div className="category-list" ref={root}>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      {shown.map((item, index) => (
        <div
          key={item.id}
          data-reorder-id={item.id}
          className={`reorder-item ${dragging === item.id ? "is-dragging" : ""}`}
        >
          {renderItem(
            item,
            index,
            <button
              type="button"
              className="icon-button category-drag-handle"
              aria-label={`${item.name}を並べ替え`}
              aria-pressed={dragging === item.id}
              disabled={pending}
              onPointerDown={(e) => down(e, item.id)}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || !d.pointer) return;
                d.y = e.clientY;
                if (!d.active && Math.abs(d.y - d.startY) >= 5) {
                  d.active = true;
                  setDragging(item.id);
                }
                if (d.active) {
                  e.preventDefault();
                  cancelAnimationFrame(d.frame);
                  d.frame = requestAnimationFrame(frame);
                }
              }}
              onPointerUp={() => void finish()}
              onPointerCancel={cancel}
              onLostPointerCapture={() => {
                if (drag.current?.pointer) cancel();
              }}
              onKeyDown={(e) => {
                if (pending) return;
                const d = drag.current;
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                  return;
                }
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  if (d) void finish();
                  else {
                    drag.current = {
                      id: item.id,
                      startY: 0,
                      y: 0,
                      pointer: false,
                      active: true,
                      frame: 0,
                    };
                    preview(items.map((i) => i.id));
                    setDragging(item.id);
                    setAnnouncement(
                      `${item.name}を移動中。上下キーで移動、Enterで確定、Escapeで中止`,
                    );
                  }
                  return;
                }
                if (d && !d.pointer && ["ArrowUp", "ArrowDown"].includes(e.key)) {
                  e.preventDefault();
                  move(item.id, index + (e.key === "ArrowUp" ? -1 : 1));
                }
                if (e.key === "Tab" && d) void finish();
              }}
            >
              <GripVertical size={18} />
            </button>,
          )}
        </div>
      ))}
    </div>
  );
}
