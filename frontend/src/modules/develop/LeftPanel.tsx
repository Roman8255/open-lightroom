import { useEffect, useState } from "react";
import { type HistoryEntry, api, fileUrl } from "../../api/client";
import { Panel } from "../../components/Panel";
import { useDevelop } from "../../store/develop";
import { PRESETS, applyPreset } from "./presets";

export function LeftPanel({ photoId }: { photoId: number }) {
  const { history, index, jump, params, apply } = useDevelop();
  const [snaps, setSnaps] = useState<HistoryEntry[]>([]);
  const loadSnaps = () => api.listHistory(photoId).then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => { void loadSnaps(); }, [photoId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="w-[220px] shrink-0 bg-lr-panel border-r border-lr-border overflow-y-auto">
      <Panel title="Navigator">
        <img src={fileUrl(photoId, "thumb")} className="w-full max-h-40 object-contain bg-lr-bar" draggable={false} />
      </Panel>
      <Panel title="Presets">
        {PRESETS.map((p) => (
          <button key={p.name} className="block w-full text-left py-1 hover:text-lr-hi"
            onClick={() => apply(applyPreset(params, p), `Preset: ${p.name}`)}>{p.name}</button>
        ))}
      </Panel>
      <Panel title="Snapshots" defaultOpen={false}>
        <button className="text-lr-accent mb-1" onClick={async () => {
          const label = prompt("Snapshot name");
          if (label) { await useDevelop.getState().flushNow(); await api.addSnapshot(photoId, label); void loadSnaps(); }
        }}>+ Add snapshot</button>
        {snaps.map((s) => (
          <button key={s.id} className="block w-full text-left py-1 hover:text-lr-hi" onClick={() => apply(s.params, `Snapshot: ${s.label}`)}>{s.label}</button>
        ))}
      </Panel>
      <Panel title="History">
        {[...history].map((h, i) => ({ h, i })).reverse().map(({ h, i }) => (
          <button key={i} className={`block w-full text-left py-0.5 truncate ${i === index ? "text-lr-hi bg-lr-line px-1 rounded" : "hover:text-lr-hi"}`} onClick={() => jump(i)}>
            {h.label}
          </button>
        ))}
      </Panel>
    </aside>
  );
}
