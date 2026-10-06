import { Panel } from "./Panel";
import { PRESETS, applyPreset } from "../modules/develop/presets";
import { useLibrary } from "../store/library";
import type { EditParams, NumericKey } from "../gl/params";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Row { key: NumericKey; label: string; small: number; large: number; min: number; max: number }
const TONE: Row[] = [
  { key: "exposure", label: "Exposure", small: 0.33, large: 1, min: -5, max: 5 },
  { key: "contrast", label: "Contrast", small: 5, large: 20, min: -100, max: 100 },
  { key: "highlights", label: "Highlights", small: 5, large: 20, min: -100, max: 100 },
  { key: "shadows", label: "Shadows", small: 5, large: 20, min: -100, max: 100 },
  { key: "whites", label: "Whites", small: 5, large: 20, min: -100, max: 100 },
  { key: "blacks", label: "Blacks", small: 5, large: 20, min: -100, max: 100 },
];
const PRESENCE: Row[] = [
  { key: "clarity", label: "Clarity", small: 5, large: 20, min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", small: 5, large: 20, min: -100, max: 100 },
  { key: "saturation", label: "Saturation", small: 5, large: 20, min: -100, max: 100 },
];

/** Library module's Quick Develop: ‹‹ ‹ › ›› buttons adjust all selected photos. */
export function QuickDevelop() {
  const { selected, quickAdjust } = useLibrary();
  const ids = [...selected];
  const disabled = ids.length === 0;
  const bump = (r: Row, d: number) =>
    quickAdjust(ids, (p: EditParams) => ({ ...p, [r.key]: Math.round(clamp(p[r.key] + d, r.min, r.max) * 100) / 100 }));

  const group = (title: string, rows: Row[]) => (
    <>
      <div className="text-lr-dim mt-2 mb-1">{title}</div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between h-[22px]">
          <span>{r.label}</span>
          <span className="flex gap-0.5">
            {([["◀◀", -r.large], ["◀", -r.small], ["▶", r.small], ["▶▶", r.large]] as const).map(([t, d]) => (
              <button key={t} className="lr-btn !px-1.5 !py-0 text-[8px] h-4 min-w-[20px]" disabled={disabled} onClick={() => void bump(r, d)}>{t}</button>
            ))}
          </span>
        </div>
      ))}
    </>
  );

  return (
    <Panel title="Quick Develop" defaultOpen={false}>
      <div className="flex items-center justify-between">
        <span>Saved Preset</span>
        <select className="bg-lr-bar rounded-sm px-1 py-0.5 w-32" disabled={disabled} value="" onChange={(e) => {
          const pr = PRESETS.find((p) => p.name === e.target.value);
          if (pr) void quickAdjust(ids, (p) => applyPreset(p, pr));
        }}>
          <option value="">Custom</option>
          {PRESETS.map((p) => <option key={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span>Treatment</span>
        <select className="bg-lr-bar rounded-sm px-1 py-0.5 w-32" disabled={disabled} defaultValue="color"
          onChange={(e) => void quickAdjust(ids, (p) => ({ ...p, bw: e.target.value === "bw" }))}>
          <option value="color">Color</option><option value="bw">Black &amp; White</option>
        </select>
      </div>
      {group("Tone Control", TONE)}
      {group("Presence", PRESENCE)}
      <button className="lr-btn w-full mt-3" disabled={disabled} onClick={() => void quickAdjust(ids, (p) => ({ ...p, ...resetNumbers() }))}>Reset All</button>
    </Panel>
  );
}

const resetNumbers = (): Partial<EditParams> => ({
  temperature: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  clarity: 0, vibrance: 0, saturation: 0, sharpening: 0, vignette: 0, grain: 0,
});
