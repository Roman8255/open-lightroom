import { useState } from "react";
import { CurveEditor } from "../../components/CurveEditor";
import { Histogram, type Hist } from "../../components/Histogram";
import { Panel } from "../../components/Panel";
import { Slider } from "../../components/Slider";
import { HSL_BANDS, type HslBandName, type NumericKey, defaultParams } from "../../gl/params";
import { useDevelop } from "../../store/develop";
import { autoTone } from "./auto";

const BAND_COLOR: Record<HslBandName, string> = {
  red: "#e5484d", orange: "#f08a24", yellow: "#f5c518", green: "#46a758", aqua: "#2bb6b6", blue: "#3e8fe0", purple: "#9d5bd2", magenta: "#d6409f",
};

type SliderDef = { key: NumericKey; label: string; min: number; max: number; step?: number; track?: string };

const WB: SliderDef[] = [
  { key: "temperature", label: "Temp", min: -100, max: 100, track: "linear-gradient(90deg,#2a6fdb,#cfcfcf,#e6b422)" },
  { key: "tint", label: "Tint", min: -100, max: 100, track: "linear-gradient(90deg,#3fa34d,#cfcfcf,#c840a0)" },
];
const TONE: SliderDef[] = [
  { key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.05 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "whites", label: "Whites", min: -100, max: 100 },
  { key: "blacks", label: "Blacks", min: -100, max: 100 },
];
const PRESENCE: SliderDef[] = [
  { key: "clarity", label: "Clarity", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
];

function Sliders({ defs }: { defs: SliderDef[] }) {
  const params = useDevelop((s) => s.params);
  const setNum = useDevelop((s) => s.setNum);
  const commit = useDevelop((s) => s.commit);
  return (
    <>
      {defs.map((d) => (
        <Slider key={d.key} label={d.label} value={params[d.key]} min={d.min} max={d.max} step={d.step} track={d.track}
          onChange={(v) => setNum(d.key, v)} onCommit={commit} />
      ))}
    </>
  );
}

const TOOLS = ["Crop", "Spot Removal", "Red Eye", "Graduated Filter", "Radial Filter", "Adjustment Brush"];
const TOOL_ICON = ["⛶", "◎", "◉", "▤", "◌", "✎"];

export function RightPanel({ hist }: { hist: Hist | null }) {
  const { params, setParams, commit, apply, previous, applyPrevious, reset } = useDevelop();
  const [hslMode, setHslMode] = useState<"hue" | "sat" | "lum">("hue");
  const d = defaultParams();
  const resetKeys = (keys: NumericKey[], label: string) => apply({ ...params, ...Object.fromEntries(keys.map((k) => [k, d[k]])) }, label);
  const asShot = params.temperature === 0 && params.tint === 0;

  return (
    <aside className="w-[290px] shrink-0 bg-lr-panel border-l border-lr-border flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <Panel title="Histogram">
          <Histogram data={hist} />
          <div className="flex justify-between mt-2 px-1 text-[15px] text-lr-dim">
            {TOOLS.map((t, i) => <span key={t} title={`${t} – coming soon`} className="cursor-not-allowed">{TOOL_ICON[i]}</span>)}
          </div>
        </Panel>
        <Panel title="Basic" onReset={() => apply({ ...params, bw: false, ...Object.fromEntries([...WB, ...TONE, ...PRESENCE].map((s) => [s.key, d[s.key]])) }, "Reset Basic")}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-lr-dim">Treatment:</span>
            <span className="flex gap-3">
              {([false, true] as const).map((bw) => (
                <button key={String(bw)} className={params.bw === bw ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"}
                  onClick={() => apply({ ...params, bw }, bw ? "Black & White" : "Color")}>{bw ? "Black & White" : "Color"}</button>
              ))}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 mb-1">
            <span className="text-lr-dim">WB:</span>
            <select className="bg-lr-bar rounded-sm px-1 py-0.5 w-28" value={asShot ? "as-shot" : "custom"}
              onChange={(e) => e.target.value === "as-shot" && apply({ ...params, temperature: 0, tint: 0 }, "White balance: As Shot")}>
              <option value="as-shot">As Shot</option><option value="custom">Custom</option>
            </select>
          </div>
          <Sliders defs={WB} />
          <div className="flex items-center justify-between mt-3 mb-1">
            <span className="text-lr-dim">Tone</span>
            <button className="text-lr-hi hover:underline disabled:opacity-40" disabled={!hist}
              onClick={() => hist && apply(autoTone(hist, params), "Auto Tone")}>Auto</button>
          </div>
          <Sliders defs={TONE} />
          <div className="text-lr-dim mt-3 mb-1">Presence</div>
          <Sliders defs={PRESENCE} />
        </Panel>
        <Panel title="Tone Curve" onReset={() => apply({ ...params, curve: d.curve }, "Reset curve")}>
          <CurveEditor points={params.curve} onChange={(curve) => setParams({ ...params, curve })} onCommit={() => commit("Tone curve")} />
          <div className="text-lr-dim mt-1">Click to add a point · double-click to remove</div>
        </Panel>
        <Panel title={params.bw ? "B&W" : "HSL / Color"} defaultOpen={false} onReset={() => apply({ ...params, hsl: d.hsl }, "Reset HSL")}>
          <div className="flex gap-3 mb-2">
            {(["hue", "sat", "lum"] as const).map((m) => (
              <button key={m} className={hslMode === m ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"} onClick={() => setHslMode(m)}>
                {m === "hue" ? "Hue" : m === "sat" ? "Saturation" : "Luminance"}
              </button>
            ))}
          </div>
          {HSL_BANDS.map((b) => (
            <Slider key={`${hslMode}-${b}`} label={b[0].toUpperCase() + b.slice(1)} value={params.hsl[b][hslMode]} min={-100} max={100}
              track={`linear-gradient(90deg,#1a1a1a,${BAND_COLOR[b]})`}
              onChange={(v) => setParams({ ...params, hsl: { ...params.hsl, [b]: { ...params.hsl[b], [hslMode]: v } } })}
              onCommit={() => commit(`HSL ${b} ${hslMode}`)} />
          ))}
        </Panel>
        <Panel title="Color Grading" disabled />
        <Panel title="Detail" onReset={() => resetKeys(["sharpening"], "Reset Detail")}>
          <Sliders defs={[{ key: "sharpening", label: "Sharpening", min: 0, max: 150 }]} />
        </Panel>
        <Panel title="Lens Corrections" disabled />
        <Panel title="Transform" disabled />
        <Panel title="Effects" onReset={() => resetKeys(["vignette", "grain"], "Reset Effects")}>
          <Sliders defs={[
            { key: "vignette", label: "Vignette", min: -100, max: 100 },
            { key: "grain", label: "Grain", min: 0, max: 100 },
          ]} />
        </Panel>
        <Panel title="Calibration" disabled />
      </div>
      <div className="shrink-0 p-2 flex gap-2 border-t border-lr-border">
        <button className="lr-btn flex-1" disabled={!previous} onClick={applyPrevious}>Previous</button>
        <button className="lr-btn flex-1" onClick={reset}>Reset</button>
      </div>
    </aside>
  );
}
