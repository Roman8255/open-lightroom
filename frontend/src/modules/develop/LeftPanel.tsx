import { useEffect, useState } from "react";
import { type HistoryEntry, api, fileUrl } from "../../api/client";
import { Panel } from "../../components/Panel";
import { useDevelop } from "../../store/develop";
import { PRESETS, applyPreset } from "./presets";

export function LeftPanel({ photoId, onExport }: { photoId: number; onExport: () => void }) {
  const { history, index, jump, params, apply, copy, paste, clipboard } = useDevelop();
  const [snaps, setSnaps] = useState<HistoryEntry[]>([]);
  const loadSnaps = () => api.listHistory(photoId).then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => { void loadSnaps(); }, [photoId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="w-[240px] shrink-0 bg-lr-panel border-r border-lr-border flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <Panel title="Navigator">
          <div className="h-[110px] bg-lr-bar grid place-items-center">
            <img src={fileUrl(photoId, "thumb")} className="w-full h-full object-contain" draggable={false} />
          </div>
        </Panel>
        <Panel title="Presets">
          <div className="text-lr-dim mb-1">User Presets (built-in)</div>
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
        <Panel title="Collections" disabled />
      </div>
      <div className="shrink-0 p-2 grid grid-cols-3 gap-2 border-t border-lr-border">
        <button className="lr-btn" onClick={copy}>Copy…</button>
        <button className="lr-btn" disabled={!clipboard} onClick={paste}>Paste</button>
        <button className="lr-btn" onClick={onExport}>Export…</button>
      </div>
    </aside>
  );
}
