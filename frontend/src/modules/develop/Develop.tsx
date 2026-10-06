import { useEffect, useState } from "react";
import { ExportDialog } from "../../components/ExportDialog";
import { Filmstrip } from "../../components/Filmstrip";
import type { Hist } from "../../components/Histogram";
import { Stars } from "../../components/Rating";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useDevelop } from "../../store/develop";
import { useLibrary } from "../../store/library";
import { DevelopCanvas } from "./DevelopCanvas";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";

export function Develop() {
  const lib = useLibrary();
  const dev = useDevelop();
  const [hist, setHist] = useState<Hist | null>(null);
  const [exporting, setExporting] = useState(false);
  const photo = lib.photos.find((p) => p.id === lib.active) ?? null;

  useEffect(() => { if (photo) void dev.open(photo.id); }, [photo?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { void dev.flushNow(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useHotkeys((e) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); e.shiftKey ? dev.redo() : dev.undo(); }
    else if (mod && k === "y") { e.preventDefault(); dev.redo(); }
    else if (mod && e.shiftKey && k === "c") { e.preventDefault(); dev.copy(); }
    else if (mod && e.shiftKey && k === "v") { e.preventDefault(); dev.paste(); }
    else if (mod) return;
    else if (k === "\\") dev.setBefore(!dev.before);
    else if (k === "arrowright") { lib.move(1); e.preventDefault(); }
    else if (k === "arrowleft") { lib.move(-1); e.preventDefault(); }
    else if (/^[0-5]$/.test(k) && photo) void lib.patch([photo.id], { rating: Number(k) });
    else if (k === "p" && photo) void lib.patch([photo.id], { flag: 1 });
    else if (k === "x" && photo) void lib.patch([photo.id], { flag: -1 });
    else if (k === "g") { lib.setView("grid"); lib.setModule("library"); }
    else if (k === "e") { lib.setView("loupe"); lib.setModule("library"); }
  }, [dev.before, photo?.id, dev.index, dev.history, dev.params, dev.clipboard]);

  if (!photo) return <div className="flex-1 grid place-items-center text-lr-dim">Select a photo in Library first</div>;

  return (
    <div className="flex-1 flex min-h-0">
      <LeftPanel photoId={photo.id} />
      <main className="flex-1 flex flex-col min-w-0">
        <DevelopCanvas photoId={photo.id} onHistogram={setHist} />
        <div className="h-8 shrink-0 bg-lr-panel border-t border-lr-border flex items-center gap-4 px-3">
          <button className={`px-2 py-0.5 rounded ${dev.before ? "bg-lr-line text-lr-hi" : "hover:text-lr-hi"}`} onClick={() => dev.setBefore(!dev.before)}>
            Before / After (\)
          </button>
          <Stars value={photo.rating} size={14} onChange={(n) => void lib.patch([photo.id], { rating: n })} />
          <div className="flex-1" />
          <span className="text-lr-dim">
            {dev.saveState === "saving" ? "Saving…" : dev.saveState === "saved" ? "Saved" : dev.saveState === "error" ? "Save failed" : ""}
          </span>
        </div>
        <Filmstrip />
      </main>
      <div className="flex flex-col">
        <div className="flex-1 min-h-0 flex"><RightPanel hist={hist} /></div>
        <div className="shrink-0 bg-lr-panel border-l border-t border-lr-border p-2 grid grid-cols-3 gap-1 w-[290px]">
          <button className="bg-lr-panel2 hover:bg-lr-line py-1 rounded" onClick={dev.copy}>Copy</button>
          <button className="bg-lr-panel2 hover:bg-lr-line py-1 rounded disabled:opacity-40" disabled={!dev.clipboard} onClick={dev.paste}>Paste</button>
          <button className="bg-lr-panel2 hover:bg-lr-line py-1 rounded" onClick={dev.reset}>Reset</button>
          <button className="bg-lr-panel2 hover:bg-lr-line py-1 rounded" onClick={dev.undo}>Undo</button>
          <button className="bg-lr-panel2 hover:bg-lr-line py-1 rounded" onClick={dev.redo}>Redo</button>
          <button className="bg-lr-accent text-black py-1 rounded" onClick={() => setExporting(true)}>Export…</button>
        </div>
      </div>
      {exporting && <ExportDialog photoIds={[photo.id]} onClose={() => setExporting(false)} />}
    </div>
  );
}
