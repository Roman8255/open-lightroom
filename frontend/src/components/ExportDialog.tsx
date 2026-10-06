import { useState } from "react";
import { api } from "../api/client";

export function ExportDialog({ photoIds, onClose }: { photoIds: number[]; onClose: () => void }) {
  const [format, setFormat] = useState<"jpeg" | "png">("jpeg");
  const [quality, setQuality] = useState(90);
  const [maxSize, setMaxSize] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      for (const id of photoIds) {
        const blob = await api.exportPhoto(id, { format, quality, max_size: maxSize ? Number(maxSize) : undefined });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `photo-${id}.${format === "png" ? "png" : "jpg"}`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={onClose}>
      <div className="w-96 bg-lr-panel rounded shadow-xl p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lr-hi text-sm">Export {photoIds.length} photo{photoIds.length > 1 ? "s" : ""}</h2>
        <label className="flex items-center justify-between">Format
          <select className="bg-lr-bar p-1 rounded" value={format} onChange={(e) => setFormat(e.target.value as "jpeg" | "png")}>
            <option value="jpeg">JPEG</option><option value="png">PNG</option>
          </select>
        </label>
        {format === "jpeg" && (
          <label className="flex items-center justify-between">Quality {quality}
            <input type="range" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
          </label>
        )}
        <label className="flex items-center justify-between">Long edge (px, empty = original)
          <input className="bg-lr-bar p-1 rounded w-20 text-right" value={maxSize} inputMode="numeric"
            onChange={(e) => setMaxSize(e.target.value.replace(/\D/g, ""))} />
        </label>
        {err && <p className="text-red-400">{err}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <button className="px-3 py-1 rounded hover:bg-lr-panel2" onClick={onClose}>Cancel</button>
          <button className="px-3 py-1 rounded bg-lr-accent text-black disabled:opacity-50" disabled={busy} onClick={run}>
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
