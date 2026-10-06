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
    const d = useDevelop.getState();
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const inMaskTool = d.tool === "linear" || d.tool === "radial" || d.tool === "brush";

    if (mod && k === "z") { e.preventDefault(); e.shiftKey ? d.redo() : d.undo(); return; }
    if (mod && k === "y") { e.preventDefault(); d.redo(); return; }
    if (mod && e.shiftKey && k === "c") { e.preventDefault(); d.copy(); return; }
    if (mod && e.shiftKey && k === "v") { e.preventDefault(); d.paste(); return; }
    if (mod) return;

    // Alt+1..4 → select mask N (works even when Alt changes the produced character)
    const digit = /^Digit([1-4])$/.exec(e.code)?.[1] ?? (/^[1-4]$/.test(e.key) ? e.key : null);
    if (e.altKey && digit) {
      e.preventDefault();
      const i = Number(digit) - 1;
      const mk = d.params.masks[i];
      if (mk) { d.setTool(mk.type); d.selectMask(i); }
      return;
    }
    if (e.altKey) return;

    // tool switches
    const toggle = (t: NonNullable<typeof d.tool>) => { e.preventDefault(); d.setTool(d.tool === t ? null : t); };
    if (k === "r") return toggle("crop");
    if (k === "q") return toggle(e.shiftKey ? "redeye" : "spot");
    if (k === "m") return toggle(e.shiftKey ? "radial" : "linear");
    if (k === "k") return toggle("brush");
    if (d.tool && (k === "escape" || k === "enter")) { e.preventDefault(); d.setTool(null); return; }

    // mask selection / state
    if (k === "[" || k === "]") {
      e.preventDefault();
      if (d.tool === "spot" || d.tool === "redeye") {
        const f = k === "]" ? 1.15 : 1 / 1.15;
        if (d.tool === "spot" && d.selSpot !== null) { d.updateSpot(d.selSpot, { r: Math.min(0.3, Math.max(0.003, d.params.spots[d.selSpot].r * f)) }); d.commit("Spot size"); }
        if (d.tool === "redeye" && d.selEye !== null) { d.updateEye(d.selEye, { r: Math.min(0.1, Math.max(0.003, d.params.red_eyes[d.selEye].r * f)) }); d.commit("Red-eye size"); }
        return;
      }
      if (d.tool === "brush" && d.selMask === null) { d.setBrush({ size: Math.min(0.3, Math.max(0.003, d.brush.size * (k === "]" ? 1.15 : 1 / 1.15))) }); return; }
      if (d.params.masks.length) { d.cycleMask(k === "]" ? 1 : -1); const sm = d.params.masks[useDevelop.getState().selMask ?? 0]; if (!inMaskTool && sm) d.setTool(sm.type); }
      return;
    }
    if (d.selMask !== null && (inMaskTool || d.tool === null)) {
      if (k === "h") { e.preventDefault(); d.toggleMask(d.selMask); return; }
      if (k === "i" && e.shiftKey) { e.preventDefault(); d.invertMask(d.selMask); return; }
    }
    if (k === "o" && (inMaskTool || d.params.masks.length)) { e.preventDefault(); d.setShowMaskOverlay(!d.showMaskOverlay); return; }
    if (k === "delete" || k === "backspace") {
      if (d.tool === "spot" && d.selSpot !== null) { e.preventDefault(); d.removeSpot(d.selSpot); return; }
      if (d.tool === "redeye" && d.selEye !== null) { e.preventDefault(); d.removeEye(d.selEye); return; }
      if (inMaskTool && d.selMask !== null) { e.preventDefault(); d.removeMask(d.selMask); return; }
    }
    if (d.tool === "crop" && k === "x") { d.flipCropAspect(); return; }

    if (k === "\\") d.setBefore(!d.before);
    else if (k === "arrowright") { lib.move(1); e.preventDefault(); }
    else if (k === "arrowleft") { lib.move(-1); e.preventDefault(); }
    else if (/^[0-5]$/.test(k) && photo) void lib.patch([photo.id], { rating: Number(k) });
    else if (k === "p" && photo) void lib.patch([photo.id], { flag: 1 });
    else if (k === "x" && photo) void lib.patch([photo.id], { flag: -1 });
    else if (k === "g") { lib.setView("grid"); lib.setModule("library"); }
    else if (k === "e") { lib.setView("loupe"); lib.setModule("library"); }
  }, [photo?.id]);

  if (!photo) return <div className="flex-1 grid place-items-center text-lr-dim">Select a photo in Library first</div>;

  return (
    <div className="flex-1 flex min-h-0">
      <LeftPanel photoId={photo.id} onExport={() => setExporting(true)} />
      <main className="flex-1 flex flex-col min-w-0">
        <DevelopCanvas photoId={photo.id} onHistogram={setHist} />
        <div className="h-[30px] shrink-0 bg-lr-panel border-t border-lr-border flex items-center gap-4 px-3">
          <div className="flex gap-0.5">
            <button className={`lr-btn !py-0 h-5 ${!dev.before ? "lr-btn-active" : ""}`} title="Loupe view" onClick={() => dev.setBefore(false)}>▭</button>
            <button className={`lr-btn !py-0 h-5 ${dev.before ? "lr-btn-active" : ""}`} title="Before (\\ toggles)" onClick={() => dev.setBefore(!dev.before)}>Y|Y</button>
          </div>
          <label className="flex items-center gap-1.5 text-lr-dim"><input type="checkbox" disabled /> Soft Proofing</label>
          <Stars value={photo.rating} size={14} onChange={(n) => void lib.patch([photo.id], { rating: n })} />
          <div className="flex-1" />
          <button className="lr-btn !py-0 h-5" disabled={dev.index === 0} onClick={dev.undo}>Undo</button>
          <button className="lr-btn !py-0 h-5" disabled={dev.index >= dev.history.length - 1} onClick={dev.redo}>Redo</button>
          <span className="text-lr-dim w-14 text-right">
            {dev.saveState === "saving" ? "Saving…" : dev.saveState === "saved" ? "Saved" : dev.saveState === "error" ? "Save failed" : ""}
          </span>
        </div>
        <Filmstrip />
      </main>
      <RightPanel hist={hist} imgAspect={photo.width / photo.height} />
      {exporting && <ExportDialog photoIds={[photo.id]} onClose={() => setExporting(false)} />}
    </div>
  );
}
