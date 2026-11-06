export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-input">
      <input
        type="color"
        aria-label="色を選択"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{value.toUpperCase()}</span>
    </div>
  );
}
