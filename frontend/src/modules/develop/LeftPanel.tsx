import { useEffect, useState } from "react";
import { type HistoryEntry, type Preset as UserPreset, api } from "../../api/client";
import { Navigator } from "../../components/Navigator";
import { CollectionsPanel, FoldersPanel } from "../../components/LibraryPanels";
import { Panel } from "../../components/Panel";
import { useDevelop } from "../../store/develop";
import { useLibrary } from "../../store/library";
import { PRESETS, applyPreset, lookOf } from "./presets";

const SHORTCUTS: [string, string][] = [
  ["R", "Crop"], ["Q / Shift+Q", "Spot / Red eye"], ["M / Shift+M", "Graduated / Radial mask"], ["K", "Brush mask"],
  ["Alt+1…4", "Select mask 1–4"], ["[ ]", "Prev / next mask · brush & spot size"], ["H", "Show / hide selected mask"],
  ["Shift+I", "Invert mask"], ["O", "Mask overlay"], ["Del", "Delete mask / spot"], ["Alt (brush)", "Erase"],
  ["Enter / Esc", "Finish tool"], ["X (crop)", "Swap crop orientation"], ["\\", "Before / after"], ["⌘Z / ⌘⇧Z", "Undo / redo"],
  ["⌘⇧C / ⌘⇧V", "Copy / paste settings"],
];

export function LeftPanel({ photo, onExport }: { photo: { id: number; width: number; height: number }; onExport: () => void }) {
  const photoId = photo.id;
  const { history, index, jump, params, apply, openCopy, paste, clipboard, region, setPan } = useDevelop();
  const crop = params.crop;
  const setError = useLibrary((s) => s.setError);
  const [snaps, setSnaps] = useState<HistoryEntry[]>([]);
  const [mine, setMine] = useState<UserPreset[]>([]);
  const loadSnaps = () => api.listHistory(photoId).then(setSnaps).catch(() => setSnaps([]));
  const loadMine = () => api.presets().then(setMine).catch(() => setMine([]));
  useEffect(() => { void loadSnaps(); }, [photoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadMine(); }, []);

  const savePreset = async () => {
    const name = prompt("Preset name (saves tone, color, curves, grading, detail, effects)");
    if (!name?.trim()) return;
    try { await api.savePreset(name.trim(), lookOf(params)); await loadMine(); } catch (e) { setError((e as Error).message); }
  };

  return (
    <aside className="lr-side w-[240px] shrink-0 bg-lr-panel border-r border-lr-border flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <Panel title="Navigator">
          <Navigator photo={photo} rect={region && { x: crop.x + region.x * crop.w, y: crop.y + region.y * crop.h, w: region.w * crop.w, h: region.h * crop.h }}
            onPick={(u, v) => setPan([Math.min(1, Math.max(0, (u - crop.x) / crop.w)), Math.min(1, Math.max(0, (v - crop.y) / crop.h))])} />
        </Panel>
        <Panel title="Presets">
          <div className="flex items-center justify-between mb-1">
            <span className="text-lr-dim">User Presets</span>
            <button className="text-lr-accent" title="Save current look as preset" onClick={() => void savePreset()}>＋</button>
          </div>
          {mine.map((p) => (
            <div key={p.id} className="group flex items-center">
              <button className="flex-1 text-left py-[3px] pl-3 hover:text-lr-hi truncate" onClick={() => apply(applyPreset(params, p), `Preset: ${p.name}`)}>{p.name}</button>
              <button className="hidden group-hover:block px-1 text-lr-dim hover:text-red-400" title="Delete preset"
                onClick={() => confirm(`Delete preset "${p.name}"?`) && void api.deletePreset(p.id).then(loadMine)}>✕</button>
            </div>
          ))}
          {mine.length === 0 && <div className="pl-3 text-lr-dim">None yet</div>}
          <div className="text-lr-dim mt-2 mb-1">Built-in</div>
          {PRESETS.map((p) => (
            <button key={p.name} className="block w-full text-left py-[3px] pl-3 hover:text-lr-hi"
              onClick={() => apply(applyPreset(params, p), `Preset: ${p.name}`)}>{p.name}</button>
          ))}
        </Panel>
        <Panel title="Snapshots" defaultOpen={false}>
          {snaps.map((s) => (
            <button key={s.id} className="block w-full text-left py-[3px] hover:text-lr-hi" onClick={() => apply(s.params, `Snapshot: ${s.label}`)}>{s.label}</button>
          ))}
          <button className="text-lr-accent mt-1" onClick={async () => {
            const label = prompt("Snapshot name");
            if (label) { await useDevelop.getState().flushNow(); await api.addSnapshot(photoId, label); void loadSnaps(); }
          }}>+ Create Snapshot</button>
        </Panel>
        <Panel title="History">
          {[...history].map((h, i) => ({ h, i })).reverse().map(({ h, i }) => (
            <button key={i} className={`block w-full text-left py-[2px] px-1 truncate ${i === index ? "text-lr-hi bg-[#555]" : "hover:text-lr-hi"}`} onClick={() => jump(i)}>
              {h.label}
            </button>
          ))}
        </Panel>
        <FoldersPanel />
        <CollectionsPanel />
        <Panel title="Shortcuts" defaultOpen={false}>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-lr-dim">
            {SHORTCUTS.map(([k, v]) => (<><span key={k} className="text-lr-hi">{k}</span><span key={k + v}>{v}</span></>))}
          </div>
        </Panel>
      </div>
      <div className="shrink-0 p-2 grid grid-cols-3 gap-2 border-t border-lr-border">
        <button className="lr-btn" onClick={() => openCopy(params)}>Copy…</button>
        <button className="lr-btn" disabled={!clipboard} onClick={paste}>Paste</button>
        <button className="lr-btn" onClick={onExport}>Export…</button>
      </div>
    </aside>
  );
}
