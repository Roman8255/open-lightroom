import { Panel } from "../../components/Panel";
import { Slider } from "../../components/Slider";
import { type MaskAdj, MAX_MASKS, defaultMaskAdj } from "../../gl/params";
import { CROP_ASPECTS, type CropAspect, MASK_TOOLS, type Tool, lockedRatio, useDevelop } from "../../store/develop";
import { fitCropToRatio } from "./Overlays";

export const TOOLS: { id: Tool; label: string; icon: string; key: string; hint: string }[] = [
  { id: "crop", label: "Crop & Straighten", icon: "⛶", key: "R", hint: "Drag handles, Enter to apply" },
  { id: "spot", label: "Spot Removal", icon: "◎", key: "Q", hint: "Click to heal, drag the dashed circle to pick the source, scroll to resize" },
  { id: "redeye", label: "Red Eye", icon: "◉", key: "Shift+Q", hint: "Click an eye, scroll to resize" },
  { id: "linear", label: "Graduated Filter", icon: "▤", key: "M", hint: "Drag to create a gradient mask" },
  { id: "radial", label: "Radial Filter", icon: "◌", key: "Shift+M", hint: "Drag from the center outwards" },
  { id: "brush", label: "Adjustment Brush", icon: "✎", key: "K", hint: "Paint a mask · hold Alt to erase" },
];

export function ToolStrip() {
  const tool = useDevelop((s) => s.tool);
  const setTool = useDevelop((s) => s.setTool);
  return (
    <div className="flex justify-between mt-2 px-1">
      {TOOLS.map((t) => (
        <button key={t.id} title={`${t.label} (${t.key})`} onClick={() => setTool(tool === t.id ? null : t.id)}
          className={`w-7 h-6 grid place-items-center rounded-sm text-[15px] ${tool === t.id ? "bg-[#555] text-lr-hi" : "text-lr-dim hover:text-lr-hi"}`}>
          {t.icon}
        </button>
      ))}
    </div>
  );
}

const MASK_NAMES: Record<string, string> = { linear: "Graduated", radial: "Radial", brush: "Brush" };
const ADJ: { key: keyof MaskAdj; label: string; min: number; max: number; step?: number }[] = [
  { key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.05 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "temperature", label: "Temp", min: -100, max: 100 },
  { key: "tint", label: "Tint", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
];

export function ToolOptions({ imgAspect }: { imgAspect: number }) {
  const st = useDevelop();
  const { tool, params } = st;
  if (!tool) return null;
  const meta = TOOLS.find((t) => t.id === tool)!;
  const done = <button className="lr-btn w-full mt-2" onClick={() => st.setTool(null)}>Done (Enter)</button>;

  let body: React.ReactNode = null;
  if (tool === "crop") {
    const setAspect = (a: CropAspect, flip = st.cropFlip) => {
      st.setCropAspect(a);
      const r = lockedRatio(a, flip, imgAspect);
      if (r) { st.setParams({ ...params, crop: fitCropToRatio(params.crop, r / imgAspect) }); st.commit(`Crop ${a}`); }
    };
    body = (
      <>
        <div className="flex items-center justify-between mb-1">
          <span className="text-lr-dim">Aspect</span>
          <span className="flex gap-1">
            <select className="bg-lr-bar rounded-sm px-1 py-0.5 w-24" value={st.cropAspect} onChange={(e) => setAspect(e.target.value as CropAspect)}>
              {CROP_ASPECTS.map((a) => <option key={a} value={a}>{a === "free" ? "Free" : a === "original" ? "Original" : a}</option>)}
            </select>
            <button className="lr-btn !py-0" title="Swap orientation (X)" disabled={st.cropAspect === "free" || st.cropAspect === "1:1"}
              onClick={() => { st.flipCropAspect(); setAspect(st.cropAspect, !st.cropFlip); }}>⇄</button>
          </span>
        </div>
        <Slider label="Angle" value={params.crop.angle} min={-45} max={45} step={0.1} defaultValue={0}
          onChange={(v) => st.setParams({ ...params, crop: { ...params.crop, angle: v } })} onCommit={st.commit} />
        <button className="lr-btn w-full mt-1" onClick={() => { st.setParams({ ...params, crop: { x: 0, y: 0, w: 1, h: 1, angle: 0 } }); st.commit("Reset crop"); }}>Reset crop</button>
      </>
    );
  } else if (tool === "spot") {
    const s = st.selSpot !== null ? params.spots[st.selSpot] : null;
    body = s ? (
      <>
        <div className="flex gap-3 mb-1">
          {(["clone", "heal"] as const).map((m) => (
            <button key={m} className={s.mode === m ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"}
              onClick={() => { st.updateSpot(st.selSpot!, { mode: m }); st.commit(`Spot ${m}`); }}>{m === "clone" ? "Clone" : "Heal"}</button>
          ))}
        </div>
        <Slider label="Size" value={+(s.r * 100).toFixed(1)} min={0.3} max={30} step={0.1} defaultValue={4} onChange={(v) => st.updateSpot(st.selSpot!, { r: v / 100 })} onCommit={st.commit} />
        <Slider label="Feather" value={Math.round(s.feather * 100)} min={0} max={100} defaultValue={50} onChange={(v) => st.updateSpot(st.selSpot!, { feather: v / 100 })} onCommit={st.commit} />
        <Slider label="Opacity" value={Math.round(s.opacity * 100)} min={0} max={100} defaultValue={100} onChange={(v) => st.updateSpot(st.selSpot!, { opacity: v / 100 })} onCommit={st.commit} />
        <button className="lr-btn w-full mt-1" onClick={() => st.removeSpot(st.selSpot!)}>Delete spot (Del)</button>
      </>
    ) : <div className="text-lr-dim">{params.spots.length} spot(s) · click the photo to add one</div>;
  } else if (tool === "redeye") {
    const e = st.selEye !== null ? params.red_eyes[st.selEye] : null;
    body = e ? (
      <>
        <Slider label="Size" value={+(e.r * 100).toFixed(1)} min={0.3} max={10} step={0.1} defaultValue={2} onChange={(v) => st.updateEye(st.selEye!, { r: v / 100 })} onCommit={st.commit} />
        <Slider label="Darken" value={Math.round(e.amount * 100)} min={0} max={100} defaultValue={80} onChange={(v) => st.updateEye(st.selEye!, { amount: v / 100 })} onCommit={st.commit} />
        <button className="lr-btn w-full mt-1" onClick={() => st.removeEye(st.selEye!)}>Delete (Del)</button>
      </>
    ) : <div className="text-lr-dim">{params.red_eyes.length} fix(es) · click on an eye</div>;
  } else {
    const m = st.selMask !== null ? params.masks[st.selMask] : null;
    body = (
      <>
        <div className="flex gap-1 mb-2">
          {MASK_TOOLS.map((t) => (
            <button key={t} className={`lr-btn flex-1 !px-1 ${tool === t ? "lr-btn-active" : ""}`} onClick={() => st.setTool(t)}>{MASK_NAMES[t!]}</button>
          ))}
        </div>
        <div className="text-lr-dim mb-1">Masks ({params.masks.length}/{MAX_MASKS}) · Alt+1–{MAX_MASKS} select · [ ] cycle</div>
        {params.masks.map((mk, i) => (
          <div key={i} className={`flex items-center gap-1 px-1 py-0.5 rounded-sm cursor-pointer ${i === st.selMask ? "bg-[#4a4a4a] text-lr-hi" : "hover:bg-[#3a3a3a]"}`} onClick={() => st.selectMask(i)}>
            <span className="w-4 text-lr-dim">{i + 1}</span>
            <span className={`flex-1 ${mk.enabled ? "" : "line-through text-lr-dim"}`}>{MASK_NAMES[mk.type]}{mk.invert ? " (inverted)" : ""}</span>
            <button className="px-1 hover:text-lr-hi" title="Show / hide (H)" onClick={(e) => { e.stopPropagation(); st.toggleMask(i); }}>{mk.enabled ? "👁" : "◌"}</button>
            <button className="px-1 hover:text-lr-hi" title="Invert (Shift+I)" onClick={(e) => { e.stopPropagation(); st.invertMask(i); }}>◐</button>
            <button className="px-1 hover:text-red-400" title="Delete (Del)" onClick={(e) => { e.stopPropagation(); st.removeMask(i); }}>✕</button>
          </div>
        ))}
        {m && st.selMask !== null && (
          <div className="mt-2 pt-2 border-t border-lr-border">
            {ADJ.map((a) => (
              <Slider key={a.key} label={a.label} value={m.adj[a.key]} min={a.min} max={a.max} step={a.step} defaultValue={defaultMaskAdj()[a.key]}
                onChange={(v) => st.updateMaskAdj(st.selMask!, a.key, v)} onCommit={(l) => st.commit(`Mask ${st.selMask! + 1} ${l}`)} />
            ))}
            {m.type === "radial" && (
              <Slider label="Feather" value={m.feather} min={0} max={100} defaultValue={50} onChange={(v) => st.updateMask(st.selMask!, { feather: v })} onCommit={st.commit} />
            )}
            <button className="lr-btn w-full mt-1" onClick={() => { st.updateMask(st.selMask!, { adj: defaultMaskAdj() }); st.commit("Reset mask"); }}>Reset mask adjustments</button>
          </div>
        )}
        {tool === "brush" && (
          <div className="mt-2 pt-2 border-t border-lr-border">
            <Slider label="Size" value={+(st.brush.size * 100).toFixed(1)} min={0.3} max={30} step={0.1} defaultValue={5} onChange={(v) => st.setBrush({ size: v / 100 })} onCommit={() => undefined} />
            <Slider label="Feather" value={Math.round(st.brush.feather * 100)} min={0} max={100} defaultValue={50} onChange={(v) => st.setBrush({ feather: v / 100 })} onCommit={() => undefined} />
            <label className="flex items-center gap-2 mt-1"><input type="checkbox" checked={st.brush.erase} onChange={(e) => st.setBrush({ erase: e.target.checked })} /> Erase (or hold Alt)</label>
          </div>
        )}
        <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={st.showMaskOverlay} onChange={(e) => st.setShowMaskOverlay(e.target.checked)} /> Show mask overlay (O)</label>
      </>
    );
  }

  return (
    <Panel title={meta.label}>
      <div className="text-lr-dim mb-2 leading-4">{meta.hint}</div>
      {body}
      {done}
    </Panel>
  );
}

