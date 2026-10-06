import { useState } from "react";
import { CurveEditor } from "../../components/CurveEditor";
import { Histogram, type Hist } from "../../components/Histogram";
import { Panel } from "../../components/Panel";
import { Slider } from "../../components/Slider";
import {
  type Curve, type EditParams, HSL_BANDS, type HslBandName, type NumericKey, defaultParams, isGeometryDefault,
} from "../../gl/params";
import { useDevelop } from "../../store/develop";
import { autoTone } from "./auto";
import { ToolOptions, ToolStrip } from "./ToolPanel";

const BAND_COLOR: Record<HslBandName, string> = {
  red: "#e5484d", orange: "#f08a24", yellow: "#f5c518", green: "#46a758", aqua: "#2bb6b6", blue: "#3e8fe0", purple: "#9d5bd2", magenta: "#d6409f",
};
const RAINBOW = "linear-gradient(90deg,#e5484d,#f5c518,#46a758,#2bb6b6,#3e8fe0,#d6409f,#e5484d)";

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
  { key: "texture", label: "Texture", min: -100, max: 100 },
  { key: "clarity", label: "Clarity", min: -100, max: 100 },
  { key: "dehaze", label: "Dehaze", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
];
const DETAIL: SliderDef[] = [
  { key: "sharpening", label: "Amount", min: 0, max: 150 },
  { key: "sharpen_radius", label: "Radius", min: 0.5, max: 3, step: 0.1 },
  { key: "noise_reduction", label: "Noise Red.", min: 0, max: 100 },
];
const LENS: SliderDef[] = [
  { key: "distortion", label: "Distortion", min: -100, max: 100 },
  { key: "lens_vignette", label: "Vignetting", min: -100, max: 100 },
];
const TRANSFORM: SliderDef[] = [
  { key: "vertical", label: "Vertical", min: -100, max: 100 },
  { key: "horizontal", label: "Horizontal", min: -100, max: 100 },
  { key: "rotate", label: "Rotate", min: -45, max: 45, step: 0.1 },
  { key: "scale", label: "Scale", min: 50, max: 150 },
  { key: "aspect", label: "Aspect", min: -100, max: 100 },
];
const EFFECTS: SliderDef[] = [
  { key: "vignette", label: "Vignette", min: -100, max: 100 },
  { key: "grain", label: "Grain", min: 0, max: 100 },
];
const keysOf = (defs: SliderDef[]) => defs.map((d) => d.key);

const d0 = defaultParams();

function Sliders({ defs }: { defs: SliderDef[] }) {
  const params = useDevelop((s) => s.params);
  const setNum = useDevelop((s) => s.setNum);
  const commit = useDevelop((s) => s.commit);
  return (
    <>
      {defs.map((d) => (
        <Slider key={d.key} label={d.label} value={params[d.key]} min={d.min} max={d.max} step={d.step} track={d.track}
          defaultValue={d0[d.key]} onChange={(v) => setNum(d.key, v)} onCommit={commit} />
      ))}
    </>
  );
}

const CURVES = [
  { id: "curve", label: "RGB", color: "#ddd" }, { id: "curve_r", label: "R", color: "#e5484d" },
  { id: "curve_g", label: "G", color: "#46a758" }, { id: "curve_b", label: "B", color: "#3e8fe0" },
] as const;

export function RightPanel({ hist, imgAspect }: { hist: Hist | null; imgAspect: number }) {
  const { params, setParams, commit, apply, previous, applyPrevious, reset } = useDevelop();
  const [hslMode, setHslMode] = useState<"hue" | "sat" | "lum">("hue");
  const [channel, setChannel] = useState<(typeof CURVES)[number]["id"]>("curve");
  const resetKeys = (keys: NumericKey[], label: string, extra: Partial<EditParams> = {}) =>
    apply({ ...params, ...Object.fromEntries(keys.map((k) => [k, d0[k]])), ...extra }, label);
  const asShot = params.temperature === 0 && params.tint === 0;
  const g = params.grade;
  const cur = CURVES.find((c) => c.id === channel)!;

  const zone = (name: "shadows" | "midtones" | "highlights", label: string) => {
    const z = g[name];
    const set = (patch: Partial<typeof z>) => setParams({ ...params, grade: { ...g, [name]: { ...z, ...patch } } });
    return (
      <div key={name} className="mb-2">
        <div className="text-lr-dim mb-0.5">{label}</div>
        <Slider label="Hue" value={z.hue} min={0} max={360} defaultValue={0} track={RAINBOW} onChange={(v) => set({ hue: v })} onCommit={(l) => commit(`${label} ${l}`)} />
        <Slider label="Saturation" value={z.sat} min={0} max={100} defaultValue={0} onChange={(v) => set({ sat: v })} onCommit={(l) => commit(`${label} ${l}`)} />
        <Slider label="Luminance" value={z.lum} min={-100} max={100} defaultValue={0} onChange={(v) => set({ lum: v })} onCommit={(l) => commit(`${label} ${l}`)} />
      </div>
    );
  };
  const calSlider = (key: keyof typeof params.cal, label: string, track?: string) => (
    <Slider key={key} label={label} value={params.cal[key]} min={-100} max={100} defaultValue={0} track={track}
      onChange={(v) => setParams({ ...params, cal: { ...params.cal, [key]: v } })} onCommit={(l) => commit(`Calibration ${l}`)} />
  );

  return (
    <aside className="w-[290px] shrink-0 bg-lr-panel border-l border-lr-border flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <Panel title="Histogram">
          <Histogram data={hist} />
          <ToolStrip />
        </Panel>
        <ToolOptions imgAspect={imgAspect} />
        <Panel title="Basic" onReset={() => resetKeys([...keysOf(WB), ...keysOf(TONE), ...keysOf(PRESENCE)], "Reset Basic", { bw: false })}>
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
            <button className="text-lr-hi hover:underline disabled:opacity-40" disabled={!hist} onClick={() => hist && apply(autoTone(hist, params), "Auto Tone")}>Auto</button>
          </div>
          <Sliders defs={TONE} />
          <div className="text-lr-dim mt-3 mb-1">Presence</div>
          <Sliders defs={PRESENCE} />
        </Panel>
        <Panel title="Tone Curve" onReset={() => apply({ ...params, curve: d0.curve, curve_r: d0.curve_r, curve_g: d0.curve_g, curve_b: d0.curve_b }, "Reset curves")}>
          <div className="flex gap-3 mb-1">
            {CURVES.map((c) => (
              <button key={c.id} className={channel === c.id ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"} onClick={() => setChannel(c.id)}>{c.label}</button>
            ))}
          </div>
          <CurveEditor key={channel} color={cur.color} points={params[channel]}
            onChange={(pts: Curve) => setParams({ ...params, [channel]: pts })} onCommit={() => commit(`Tone curve ${cur.label}`)} />
          <div className="text-lr-dim mt-1">Click to add a point · double-click to remove</div>
        </Panel>
        <Panel title={params.bw ? "B&W" : "HSL / Color"} defaultOpen={false} onReset={() => apply({ ...params, hsl: d0.hsl }, "Reset HSL")}>
          <div className="flex gap-3 mb-2">
            {(["hue", "sat", "lum"] as const).filter((m) => !(params.bw && m !== "lum")).map((m) => (
              <button key={m} className={hslMode === m ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"} onClick={() => setHslMode(m)}>
                {m === "hue" ? "Hue" : m === "sat" ? "Saturation" : "Luminance"}
              </button>
            ))}
          </div>
          {HSL_BANDS.map((b) => {
            const mode = params.bw ? "lum" : hslMode;
            return (
              <Slider key={`${mode}-${b}`} label={b[0].toUpperCase() + b.slice(1)} value={params.hsl[b][mode]} min={-100} max={100}
                track={`linear-gradient(90deg,#1a1a1a,${BAND_COLOR[b]})`}
                onChange={(v) => setParams({ ...params, hsl: { ...params.hsl, [b]: { ...params.hsl[b], [mode]: v } } })}
                onCommit={() => commit(`HSL ${b} ${mode}`)} />
            );
          })}
        </Panel>
        <Panel title="Color Grading" defaultOpen={false} onReset={() => apply({ ...params, grade: d0.grade }, "Reset color grading")}>
          {zone("shadows", "Shadows")}
          {zone("midtones", "Midtones")}
          {zone("highlights", "Highlights")}
          <Slider label="Blending" value={g.blending} min={0} max={100} defaultValue={50} onChange={(v) => setParams({ ...params, grade: { ...g, blending: v } })} onCommit={(l) => commit(`Grading ${l}`)} />
          <Slider label="Balance" value={g.balance} min={-100} max={100} defaultValue={0} onChange={(v) => setParams({ ...params, grade: { ...g, balance: v } })} onCommit={(l) => commit(`Grading ${l}`)} />
        </Panel>
        <Panel title="Detail" onReset={() => resetKeys(keysOf(DETAIL), "Reset Detail")}>
          <Sliders defs={DETAIL} />
        </Panel>
        <Panel title="Lens Corrections" defaultOpen={false} onReset={() => resetKeys(keysOf(LENS), "Reset Lens Corrections")}>
          <div className="text-lr-dim mb-1">Manual profile</div>
          <Sliders defs={LENS} />
        </Panel>
        <Panel title="Transform" defaultOpen={false}
          onReset={() => !isGeometryDefault(params) && resetKeys(keysOf(TRANSFORM), "Reset Transform", { crop: { ...params.crop, angle: 0 } })}>
          <Sliders defs={TRANSFORM} />
        </Panel>
        <Panel title="Effects" onReset={() => resetKeys(keysOf(EFFECTS), "Reset Effects")}>
          <Sliders defs={EFFECTS} />
        </Panel>
        <Panel title="Calibration" defaultOpen={false} onReset={() => apply({ ...params, cal: d0.cal }, "Reset Calibration")}>
          {calSlider("shadow_tint", "Shadows Tint", "linear-gradient(90deg,#3fa34d,#cfcfcf,#c840a0)")}
          <div className="text-lr-dim mt-2 mb-1">Red Primary</div>
          {calSlider("red_hue", "Hue")}{calSlider("red_sat", "Saturation")}
          <div className="text-lr-dim mt-2 mb-1">Green Primary</div>
          {calSlider("green_hue", "Hue")}{calSlider("green_sat", "Saturation")}
          <div className="text-lr-dim mt-2 mb-1">Blue Primary</div>
          {calSlider("blue_hue", "Hue")}{calSlider("blue_sat", "Saturation")}
        </Panel>
      </div>
      <div className="shrink-0 p-2 flex gap-2 border-t border-lr-border">
        <button className="lr-btn flex-1" disabled={!previous} onClick={applyPrevious}>Previous</button>
        <button className="lr-btn flex-1" onClick={reset}>Reset</button>
      </div>
    </aside>
  );
}
