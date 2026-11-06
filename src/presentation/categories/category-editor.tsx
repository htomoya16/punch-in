import { Check, LoaderCircle, Palette } from "lucide-react";
import { useState } from "react";
import type { WorkCategory } from "../../domain/categories/work-category";
import { PALETTE } from "../../shared/colors/category-palette";
import { contrastText } from "../../shared/colors/color-contrast";
import { Modal } from "../components/modal";

export function CategoryEditor({
  value,
  pending,
  errorMessage,
  close,
  save,
}: {
  value: WorkCategory;
  pending: boolean;
  errorMessage?: string;
  close: () => void;
  save: (c: WorkCategory) => Promise<void>;
}) {
  const [c, setC] = useState(value);
  return (
    <Modal title={value.name ? "作業を編集" : "作業を追加"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(c);
        }}
      >
        <label className="field">
          作業名
          <input
            autoFocus
            required
            maxLength={40}
            placeholder="作業名"
            value={c.name}
            onChange={(e) => setC({ ...c, name: e.target.value })}
          />
        </label>
        <div className="field">
          <span>カラー</span>
          <div className="palette">
            {PALETTE.map((color) => (
              <button
                type="button"
                key={color}
                aria-label={color}
                aria-pressed={c.color === color}
                className={c.color === color ? "selected" : ""}
                style={{ background: color, color: contrastText(color) }}
                onClick={() => setC({ ...c, color })}
              >
                {c.color === color && <Check size={16} />}
              </button>
            ))}
            <label
              className={`custom-swatch ${!PALETTE.includes(c.color) ? "selected" : ""}`}
              style={
                !PALETTE.includes(c.color)
                  ? { background: c.color, color: contrastText(c.color) }
                  : undefined
              }
            >
              <Palette size={16} />
              <input
                type="color"
                aria-label="カスタムカラー"
                value={c.color}
                onChange={(e) => setC({ ...c, color: e.target.value })}
              />
            </label>
          </div>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!c.hidden}
            onChange={(e) => setC({ ...c, hidden: !e.target.checked })}
          />
          打刻画面に表示
        </label>
        {errorMessage && (
          <p role="alert" className="form-error">
            {errorMessage}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="outline-button" onClick={close}>
            キャンセル
          </button>
          <button className="primary-button" disabled={pending || !c.name.trim()}>
            {pending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}保存する
          </button>
        </div>
      </form>
    </Modal>
  );
}
