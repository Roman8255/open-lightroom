interface Props {
  label: string; value: number; min: number; max: number; step?: number; defaultValue?: number;
  track?: string; // css gradient for the track
  onChange: (v: number) => void; onCommit: (label: string) => void;
}

export function Slider({ label, value, min, max, step = 1, defaultValue = 0, track, onChange, onCommit }: Props) {
  const fmt = (v: number) => (step < 1 ? v.toFixed(2) : String(Math.round(v)));
  const changed = value !== defaultValue;
  return (
    <div className="flex items-center gap-2 h-[22px]" onDoubleClick={() => { onChange(defaultValue); onCommit(`${label} reset`); }}>
      <span className={`w-[68px] shrink-0 truncate ${changed ? "text-lr-hi" : "text-lr-text"}`} title="Double-click to reset">{label}</span>
      <input
        type="range" className="lr-slider" min={min} max={max} step={step} value={value}
        style={track ? ({ "--track": track } as React.CSSProperties) : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => onCommit(`${label} ${fmt(value)}`)}
        onKeyUp={() => onCommit(`${label} ${fmt(value)}`)}
      />
      <input
        className="w-10 shrink-0 bg-transparent text-right text-lr-hi tabular-nums outline-none focus:bg-lr-bar rounded-sm px-1"
        value={fmt(value)}
        onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n))); }}
        onBlur={() => onCommit(`${label} ${fmt(value)}`)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}
