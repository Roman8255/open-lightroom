export const LABELS = ["red", "yellow", "green", "blue", "purple"] as const;
export const LABEL_COLOR: Record<string, string> = {
  red: "#e5484d", yellow: "#f5c518", green: "#46a758", blue: "#3e8fe0", purple: "#9d5bd2",
};

export function Stars({ value, onChange, size = 12 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <span className="inline-flex" style={{ fontSize: size, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`${onChange ? "cursor-pointer" : ""} ${n <= value ? "text-lr-hi" : "text-lr-line"}`}
          onClick={(e) => { e.stopPropagation(); onChange?.(n === value ? 0 : n); }}>★</span>
      ))}
    </span>
  );
}

export function FlagIcon({ flag }: { flag: number }) {
  if (flag === 0) return null;
  return <span className={flag > 0 ? "text-lr-hi" : "text-red-400"} title={flag > 0 ? "Picked" : "Rejected"}>{flag > 0 ? "⚑" : "✕"}</span>;
}
