import { type ReactNode, useEffect, useState } from "react";
import { api } from "../api/client";
import { useLibrary } from "../store/library";

type Fmt = "jpeg" | "png" | "tiff" | "webp";
type ResizeMode = "none" | "width_height" | "long" | "short" | "megapixels" | "percent";
type Template = "filename" | "custom" | "custom_seq" | "filename_seq" | "date_filename" | "custom_xofy";

export interface ExportState {
  format: Fmt; quality: number; limitOn: boolean; limitKb: number;
  resizeMode: ResizeMode; width: number; height: number; longEdge: number; shortEdge: number; megapixels: number; percent: number;
  noEnlarge: boolean; ppi: number;
  sharpenTarget: "none" | "screen" | "matte" | "glossy"; sharpenAmount: "low" | "standard" | "high";
  metadata: "all" | "copyright" | "none"; removeLocation: boolean; copyright: string;
  wmOn: boolean; wmText: string; wmSize: number; wmOpacity: number; wmPos: "tl" | "tr" | "bl" | "br" | "center";
  template: Template; customText: string; startNumber: number;
}

const DEFAULTS: ExportState = {
  format: "jpeg", quality: 90, limitOn: false, limitKb: 500,
  resizeMode: "none", width: 2048, height: 2048, longEdge: 2048, shortEdge: 1080, megapixels: 4, percent: 100, noEnlarge: true, ppi: 300,
  sharpenTarget: "none", sharpenAmount: "standard", metadata: "all", removeLocation: false, copyright: "",
  wmOn: false, wmText: "© Your Name", wmSize: 4, wmOpacity: 60, wmPos: "br",
  template: "filename", customText: "Photo", startNumber: 1,
};

const STATE_KEY = "olr.export", PRESETS_KEY = "olr.exportPresets";
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const BUILTIN: Record<string, Partial<ExportState>> = {
  "Full-size JPEG (q 90)": {},
  "Web 2048 px": { resizeMode: "long", longEdge: 2048, quality: 82, sharpenTarget: "screen", sharpenAmount: "standard", metadata: "copyright" },
  "Instagram 1080 px": { resizeMode: "long", longEdge: 1080, quality: 85, sharpenTarget: "screen", sharpenAmount: "standard", metadata: "none" },
  "Email ≤ 500 KB": { resizeMode: "long", longEdge: 1600, limitOn: true, limitKb: 500, metadata: "copyright" },
  "Print TIFF": { format: "tiff", ppi: 300, sharpenTarget: "matte", sharpenAmount: "standard" },
  "Lossless PNG": { format: "png" },
};

export const buildBody = (s: ExportState, photoIds: number[]) => ({
  photo_ids: photoIds,
  settings: {
    format: s.format, quality: s.quality, limit_kb: s.limitOn && (s.format === "jpeg" || s.format === "webp") ? s.limitKb : null,
    resize: {
      mode: s.resizeMode, width: s.width || null, height: s.height || null, long_edge: s.longEdge || null, short_edge: s.shortEdge || null,
      megapixels: s.megapixels || null, percent: s.percent || null, no_enlarge: s.noEnlarge,
    },
    ppi: s.ppi, sharpen: { target: s.sharpenTarget, amount: s.sharpenAmount },
    metadata: s.metadata, remove_location: s.removeLocation, copyright: s.copyright.trim() || null,
    watermark: s.wmOn && s.wmText.trim() ? { text: s.wmText, size_pct: s.wmSize, opacity: s.wmOpacity, position: s.wmPos } : null,
  },
  naming: { template: s.template, custom_text: s.customText, start_number: s.startNumber },
});

const EXT: Record<Fmt, string> = { jpeg: "jpg", png: "png", tiff: "tif", webp: "webp" };
function sampleName(s: ExportState, filename: string, i: number, total: number) {
  const stem = filename.replace(/\.[^.]+$/, ""), n = s.startNumber + i, pad = String(n).padStart(Math.max(3, String(s.startNumber + total - 1).length), "0");
  const custom = s.customText || "photo";
  const base = {
    filename: stem, custom, custom_seq: `${custom}-${pad}`, filename_seq: `${stem}-${pad}`,
    date_filename: `${new Date().toISOString().slice(0, 10)}-${stem}`, custom_xofy: `${custom} (${i + 1} of ${total})`,
  }[s.template];
  return `${base}.${EXT[s.format]}`;
}

function Section({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="border-b border-lr-border">
      <header className="flex items-center justify-between h-7 px-3 bg-gradient-to-b from-[#3b3b3b] to-[#323232] cursor-pointer hover:text-lr-hi" onClick={() => setOpen(!open)}>
        <span>{title}</span><span className="text-[9px] text-lr-dim">{open ? "▼" : "◀"}</span>
      </header>
      {open && <div className="px-4 py-3 bg-lr-panel flex flex-col gap-2">{children}</div>}
    </section>
  );
}
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex items-center justify-between gap-3"><span className="text-lr-dim shrink-0">{label}</span><span className="flex items-center gap-2 justify-end">{children}</span></label>
);
const inp = "bg-lr-bar rounded-sm px-1.5 py-0.5 text-right text-lr-hi outline-none focus:ring-1 ring-lr-accent select-text";
const num = (v: string, min = 0) => Math.max(min, Number(v.replace(/[^\d.]/g, "")) || 0);

export function ExportDialog({ photoIds, onClose }: { photoIds: number[]; onClose: () => void }) {
  const photos = useLibrary((s) => s.photos);
  const setError = useLibrary((s) => s.setError);
  const [s, setS] = useState<ExportState>(() => ({ ...DEFAULTS, ...read<Partial<ExportState>>(STATE_KEY, {}) }));
  const [presets, setPresets] = useState<Record<string, ExportState>>(() => read(PRESETS_KEY, {}));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof ExportState>(k: K, v: ExportState[K]) => setS((p) => ({ ...p, [k]: v }));
  useEffect(() => write(STATE_KEY, s), [s]);

  const names = photoIds.map((id) => photos.find((p) => p.id === id)?.filename ?? `photo-${id}.jpg`);
  const lossy = s.format === "jpeg" || s.format === "webp";

  const applyPreset = (name: string) => {
    if (!name) return;
    setS(presets[name] ?? { ...DEFAULTS, ...BUILTIN[name] });
  };
  const savePreset = () => {
    const name = prompt("Export preset name")?.trim();
    if (!name) return;
    const next = { ...presets, [name]: s };
    setPresets(next); write(PRESETS_KEY, next);
  };
  const deletePreset = (name: string) => {
    if (!presets[name]) return;
    const { [name]: _gone, ...rest } = presets;
    setPresets(rest); write(PRESETS_KEY, rest);
  };

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const { blob, filename } = await api.exportBatch(buildBody(s, photoIds));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const sizeFields = (() => {
    switch (s.resizeMode) {
      case "width_height": return (
        <Row label="Fit within (px)">
          <input className={`${inp} w-16`} value={s.width} onChange={(e) => set("width", num(e.target.value))} /> ×
          <input className={`${inp} w-16`} value={s.height} onChange={(e) => set("height", num(e.target.value))} />
        </Row>);
      case "long": return <Row label="Long edge (px)"><input className={`${inp} w-20`} value={s.longEdge} onChange={(e) => set("longEdge", num(e.target.value))} /></Row>;
      case "short": return <Row label="Short edge (px)"><input className={`${inp} w-20`} value={s.shortEdge} onChange={(e) => set("shortEdge", num(e.target.value))} /></Row>;
      case "megapixels": return <Row label="Megapixels"><input className={`${inp} w-20`} value={s.megapixels} onChange={(e) => set("megapixels", num(e.target.value))} /></Row>;
      case "percent": return <Row label="Percent"><input className={`${inp} w-20`} value={s.percent} onChange={(e) => set("percent", num(e.target.value))} /> %</Row>;
      default: return null;
    }
  })();

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={onClose}>
      <div className="w-[520px] max-h-[88vh] bg-lr-panel rounded shadow-2xl flex flex-col text-[11px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 h-10 flex items-center justify-between bg-lr-bar rounded-t">
          <span className="text-lr-hi text-[13px]">Export {photoIds.length} photo{photoIds.length > 1 ? "s" : ""}</span>
          <span className="flex items-center gap-1">
            <select className="bg-lr-panel2 rounded-sm px-1 py-0.5" value="" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">Preset…</option>
              <optgroup label="Lightroom-style">{Object.keys(BUILTIN).map((n) => <option key={n}>{n}</option>)}</optgroup>
              {Object.keys(presets).length > 0 && <optgroup label="Mine">{Object.keys(presets).map((n) => <option key={n}>{n}</option>)}</optgroup>}
            </select>
            <button className="lr-btn !py-0.5" onClick={savePreset}>Add</button>
            {Object.keys(presets).length > 0 && (
              <select className="bg-lr-panel2 rounded-sm px-1 py-0.5" value="" onChange={(e) => { if (e.target.value && confirm(`Delete preset "${e.target.value}"?`)) deletePreset(e.target.value); }}>
                <option value="">Remove…</option>{Object.keys(presets).map((n) => <option key={n}>{n}</option>)}
              </select>
            )}
          </span>
        </div>

        <div className="overflow-y-auto flex-1">
          <Section title="Export Location" open>
            <Row label="Export To"><span className="text-lr-hi">Download ({photoIds.length > 1 ? "ZIP archive" : "single file"})</span></Row>
          </Section>

          <Section title="File Naming" open>
            <Row label="Rename To">
              <select className={inp} value={s.template} onChange={(e) => set("template", e.target.value as Template)}>
                <option value="filename">Filename</option><option value="custom">Custom Name</option>
                <option value="custom_seq">Custom Name - Sequence</option><option value="filename_seq">Filename - Sequence</option>
                <option value="date_filename">Date - Filename</option><option value="custom_xofy">Custom Name (x of y)</option>
              </select>
            </Row>
            {s.template.startsWith("custom") && <Row label="Custom Text"><input className={`${inp} w-44`} value={s.customText} maxLength={100} onChange={(e) => set("customText", e.target.value)} /></Row>}
            {s.template.endsWith("_seq") && <Row label="Start Number"><input className={`${inp} w-20`} value={s.startNumber} onChange={(e) => set("startNumber", Math.floor(num(e.target.value)))} /></Row>}
            <div className="text-lr-dim">Example: <span className="text-lr-hi">{sampleName(s, names[0] ?? "photo.jpg", 0, photoIds.length)}</span></div>
          </Section>

          <Section title="File Settings" open>
            <Row label="Image Format">
              <select className={inp} value={s.format} onChange={(e) => set("format", e.target.value as Fmt)}>
                <option value="jpeg">JPEG</option><option value="png">PNG</option><option value="tiff">TIFF</option><option value="webp">WebP</option>
              </select>
            </Row>
            {lossy && <Row label={`Quality ${s.quality}`}><input type="range" className="lr-slider !w-44" min={1} max={100} value={s.quality} onChange={(e) => set("quality", Number(e.target.value))} /></Row>}
            <Row label="Color Space"><span className="text-lr-hi" title="Only sRGB output is supported">sRGB</span></Row>
            {lossy && (
              <Row label="Limit File Size To">
                <input type="checkbox" checked={s.limitOn} onChange={(e) => set("limitOn", e.target.checked)} />
                <input className={`${inp} w-20`} disabled={!s.limitOn} value={s.limitKb} onChange={(e) => set("limitKb", Math.max(10, num(e.target.value)))} /> K
              </Row>
            )}
          </Section>

          <Section title="Image Sizing" open>
            <Row label="Resize to Fit">
              <select className={inp} value={s.resizeMode} onChange={(e) => set("resizeMode", e.target.value as ResizeMode)}>
                <option value="none">Don't resize</option><option value="width_height">Width & Height</option><option value="long">Long Edge</option>
                <option value="short">Short Edge</option><option value="megapixels">Megapixels</option><option value="percent">Percentage</option>
              </select>
            </Row>
            {sizeFields}
            {s.resizeMode !== "none" && <Row label="Don't Enlarge"><input type="checkbox" checked={s.noEnlarge} onChange={(e) => set("noEnlarge", e.target.checked)} /></Row>}
            <Row label="Resolution"><input className={`${inp} w-16`} value={s.ppi} onChange={(e) => set("ppi", Math.min(1200, Math.max(72, num(e.target.value, 72))))} /> pixels per inch</Row>
          </Section>

          <Section title="Output Sharpening">
            <Row label="Sharpen For">
              <select className={inp} value={s.sharpenTarget} onChange={(e) => set("sharpenTarget", e.target.value as ExportState["sharpenTarget"])}>
                <option value="none">None</option><option value="screen">Screen</option><option value="matte">Matte Paper</option><option value="glossy">Glossy Paper</option>
              </select>
            </Row>
            {s.sharpenTarget !== "none" && (
              <Row label="Amount">
                <select className={inp} value={s.sharpenAmount} onChange={(e) => set("sharpenAmount", e.target.value as ExportState["sharpenAmount"])}>
                  <option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option>
                </select>
              </Row>
            )}
          </Section>

          <Section title="Metadata">
            <Row label="Include">
              <select className={inp} value={s.metadata} onChange={(e) => set("metadata", e.target.value as ExportState["metadata"])}>
                <option value="all">All Metadata</option><option value="copyright">Copyright Only</option><option value="none">None</option>
              </select>
            </Row>
            {s.metadata === "all" && <Row label="Remove Location Info"><input type="checkbox" checked={s.removeLocation} onChange={(e) => set("removeLocation", e.target.checked)} /></Row>}
            <Row label="Copyright"><input className={`${inp} w-52`} value={s.copyright} maxLength={200} placeholder="© Your Name" onChange={(e) => set("copyright", e.target.value)} /></Row>
          </Section>

          <Section title="Watermarking">
            <Row label="Watermark"><input type="checkbox" checked={s.wmOn} onChange={(e) => set("wmOn", e.target.checked)} /></Row>
            {s.wmOn && (
              <>
                <Row label="Text"><input className={`${inp} w-52`} value={s.wmText} maxLength={120} onChange={(e) => set("wmText", e.target.value)} /></Row>
                <Row label={`Size ${s.wmSize}%`}><input type="range" className="lr-slider !w-44" min={1} max={20} value={s.wmSize} onChange={(e) => set("wmSize", Number(e.target.value))} /></Row>
                <Row label={`Opacity ${s.wmOpacity}%`}><input type="range" className="lr-slider !w-44" min={5} max={100} value={s.wmOpacity} onChange={(e) => set("wmOpacity", Number(e.target.value))} /></Row>
                <Row label="Position">
                  <select className={inp} value={s.wmPos} onChange={(e) => set("wmPos", e.target.value as ExportState["wmPos"])}>
                    <option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option><option value="center">Center</option>
                  </select>
                </Row>
              </>
            )}
          </Section>
        </div>

        <div className="px-4 py-3 flex items-center justify-between border-t border-lr-border">
          <span className="text-red-400 truncate max-w-[260px]">{err}</span>
          <span className="flex gap-2">
            <button className="lr-btn" onClick={onClose}>Cancel</button>
            <button className="px-4 py-1 rounded-sm bg-lr-accent text-black disabled:opacity-50" disabled={busy} onClick={run}>{busy ? "Exporting…" : "Export"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
