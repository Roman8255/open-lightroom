import { useEffect, useRef, useState } from "react";
import { type Photo, fileUrl } from "../../api/client";
import { ExportDialog } from "../../components/ExportDialog";
import { Filmstrip } from "../../components/Filmstrip";
import { Panel } from "../../components/Panel";
import { FlagIcon, LABELS, LABEL_COLOR, Stars } from "../../components/Rating";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useLibrary } from "../../store/library";

const COLS: Record<string, string> = { captured_at: "Capture time", created_at: "Added", rating: "Rating", filename: "File name" };

export function Library() {
  const lib = useLibrary();
  const { photos, selected, active, view, filter, thumbSize } = lib;
  const [exporting, setExporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const activePhoto = photos.find((p) => p.id === active) ?? null;
  const ids = () => [...selected];

  useEffect(() => { void lib.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gridCols = Math.max(1, Math.floor(((window.innerWidth - 480) as number) / thumbSize));

  useHotkeys((e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "a") { e.preventDefault(); lib.selectAll(); return; }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (k === "arrowright") { lib.move(1, e.shiftKey); e.preventDefault(); }
    else if (k === "arrowleft") { lib.move(-1, e.shiftKey); e.preventDefault(); }
    else if (k === "arrowdown") { lib.move(view === "grid" ? gridCols : 1, e.shiftKey); e.preventDefault(); }
    else if (k === "arrowup") { lib.move(view === "grid" ? -gridCols : -1, e.shiftKey); e.preventDefault(); }
    else if (/^[0-5]$/.test(k)) void lib.patch(ids(), { rating: Number(k) });
    else if (k === "p") void lib.patch(ids(), { flag: 1 });
    else if (k === "x") void lib.patch(ids(), { flag: -1 });
    else if (k === "u") void lib.patch(ids(), { flag: 0 });
    else if (/^[6-9]$/.test(k)) void lib.patch(ids(), { color_label: LABELS[Number(k) - 6] });
    else if (k === "g") lib.setView("grid");
    else if (k === "e" || k === "enter") lib.setView("loupe");
    else if (k === "d") lib.setModule("develop");
    else if (k === "delete" || k === "backspace") {
      if (selected.size && confirm(`Delete ${selected.size} photo(s) permanently?`)) void lib.remove(ids());
    }
  }, [selected, view, gridCols, photos]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) void lib.upload(files);
  };

  return (
    <div className="flex-1 flex min-h-0" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {/* Left panel */}
      <aside className="w-[220px] shrink-0 bg-lr-panel border-r border-lr-border overflow-y-auto">
        <Panel title="Catalog">
          {[
            ["All Photographs", () => lib.setFilter({ rating_min: undefined, flag: undefined, color_label: undefined })],
            ["Picked", () => lib.setFilter({ flag: 1 })],
            ["Rejected", () => lib.setFilter({ flag: -1 })],
            ["4+ stars", () => lib.setFilter({ rating_min: 4 })],
          ].map(([name, fn]) => (
            <button key={name as string} className="block w-full text-left py-1 hover:text-lr-hi" onClick={fn as () => void}>{name as string}</button>
          ))}
          <div className="text-lr-dim mt-1">{photos.length} photos</div>
        </Panel>
        <Panel title="Color labels">
          <div className="flex gap-2">
            {LABELS.map((l) => (
              <button key={l} title={l} className="w-4 h-4 rounded-sm border border-black/50"
                style={{ background: LABEL_COLOR[l], outline: filter.color_label === l ? "2px solid #fff" : "none" }}
                onClick={() => lib.setFilter({ color_label: filter.color_label === l ? undefined : l })} />
            ))}
          </div>
        </Panel>
        <Panel title="Collections"><span className="text-lr-dim">Coming soon</span></Panel>
        <div className="p-3 flex flex-col gap-2">
          <button className="bg-lr-panel2 hover:bg-lr-line py-1.5 rounded text-lr-hi" onClick={() => fileInput.current?.click()}>Import…</button>
          <input ref={fileInput} type="file" multiple accept="image/*" hidden
            onChange={(e) => { if (e.target.files) void lib.upload([...e.target.files]); e.target.value = ""; }} />
          <button className="bg-lr-panel2 hover:bg-lr-line py-1.5 rounded text-lr-hi disabled:opacity-40" disabled={!selected.size}
            onClick={() => setExporting(true)}>Export…</button>
          {lib.uploading && <div className="text-lr-dim">Importing {lib.uploading.done}/{lib.uploading.total}…</div>}
        </div>
      </aside>

      {/* Center */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-8 shrink-0 bg-lr-panel border-b border-lr-border flex items-center gap-4 px-3">
          <div className="flex gap-1">
            {(["grid", "loupe"] as const).map((v) => (
              <button key={v} className={`px-2 py-0.5 rounded ${view === v ? "bg-lr-line text-lr-hi" : "hover:text-lr-hi"}`} onClick={() => lib.setView(v)}>
                {v === "grid" ? "Grid (G)" : "Loupe (E)"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1">Sort
            <select className="bg-lr-bar rounded px-1 py-0.5" value={filter.sort}
              onChange={(e) => lib.setFilter({ sort: e.target.value as never })}>
              {Object.entries(COLS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => lib.setFilter({ order: filter.order === "asc" ? "desc" : "asc" })}>{filter.order === "asc" ? "↑" : "↓"}</button>
          </label>
          <label className="flex items-center gap-1">Rating ≥
            <Stars value={filter.rating_min ?? 0} size={14} onChange={(n) => lib.setFilter({ rating_min: n || undefined })} />
          </label>
          <div className="flex-1" />
          {view === "grid" && (
            <label className="flex items-center gap-2">Thumbnails
              <input type="range" className="lr-slider w-28" min={100} max={400} value={thumbSize} onChange={(e) => lib.setThumbSize(Number(e.target.value))} />
            </label>
          )}
        </div>

        {photos.length === 0 ? (
          <div className="flex-1 grid place-items-center text-lr-dim text-sm">
            {lib.loading ? "Loading…" : "Drop photos here or click Import… to get started"}
          </div>
        ) : view === "grid" ? (
          <div className="flex-1 overflow-y-auto p-2 grid gap-1 content-start"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>
            {photos.map((p, i) => (
              <Cell key={p.id} photo={p} index={i + 1} size={thumbSize} selected={selected.has(p.id)} active={p.id === active}
                onClick={(e) => lib.select(p.id, e.metaKey || e.ctrlKey ? "toggle" : e.shiftKey ? "range" : "single")}
                onOpen={() => { lib.select(p.id); lib.setModule("develop"); }}
                onRate={(n) => void lib.patch([p.id], { rating: n })} />
            ))}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center bg-lr-bg p-4">
            {activePhoto && <img src={fileUrl(activePhoto.id, "preview")} className="max-w-full max-h-full object-contain" draggable={false}
              onDoubleClick={() => lib.setModule("develop")} />}
          </div>
        )}
        {view === "loupe" && <Filmstrip />}
      </main>

      {/* Right panel */}
      <aside className="w-[260px] shrink-0 bg-lr-panel border-l border-lr-border overflow-y-auto">
        <Panel title="Quick Info">
          {activePhoto ? <Meta photo={activePhoto} onRate={(n) => void lib.patch(ids(), { rating: n })} /> : <span className="text-lr-dim">No photo selected</span>}
        </Panel>
        <Panel title="Keyword & Rating" defaultOpen={false}>
          <div className="text-lr-dim leading-5">
            <b className="text-lr-text">Keys:</b> 0–5 rate · P pick · X reject · U unflag · 6–9 color label · G grid · E loupe · D develop ·
            ←→↑↓ navigate · ⌘/Ctrl+A all · Del delete
          </div>
        </Panel>
      </aside>
      {exporting && <ExportDialog photoIds={ids()} onClose={() => setExporting(false)} />}
    </div>
  );
}

function Cell({ photo, index, size, selected, active, onClick, onOpen, onRate }: {
  photo: Photo; index: number; size: number; selected: boolean; active: boolean;
  onClick: (e: React.MouseEvent) => void; onOpen: () => void; onRate: (n: number) => void;
}) {
  return (
    <div className={`group relative bg-[#232323] cursor-pointer ${selected ? (active ? "outline outline-2 outline-lr-hi" : "outline outline-1 outline-lr-dim") : ""}`}
      style={{ height: size }} onClick={onClick} onDoubleClick={onOpen}>
      <span className="absolute top-1 left-1.5 text-lr-dim text-[10px]">{index}</span>
      <img src={fileUrl(photo.id, "thumb")} loading="lazy" draggable={false} className="w-full h-full object-contain p-4" />
      <div className="absolute top-1 right-1.5 flex items-center gap-1">
        {photo.has_edits && <span title="Edited" className="text-lr-dim">✎</span>}
        <FlagIcon flag={photo.flag} />
        {photo.color_label && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: LABEL_COLOR[photo.color_label] }} />}
      </div>
      <div className="absolute bottom-1 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100">
        <Stars value={photo.rating} onChange={onRate} size={12} />
      </div>
      {photo.rating > 0 && <div className="absolute bottom-1 left-0 right-0 flex justify-center group-hover:hidden"><Stars value={photo.rating} size={10} /></div>}
    </div>
  );
}

function Meta({ photo, onRate }: { photo: Photo; onRate: (n: number) => void }) {
  const e = photo.exif as Record<string, string | number>;
  const fmtShutter = (v: number) => (v >= 1 ? `${v}s` : `1/${Math.round(1 / v)}s`);
  const rows: [string, string | undefined][] = [
    ["File", photo.filename],
    ["Size", `${photo.width} × ${photo.height} · ${(photo.size_bytes / 1048576).toFixed(1)} MB`],
    ["Captured", photo.captured_at ? new Date(photo.captured_at).toLocaleString() : undefined],
    ["Camera", [e.make, e.model].filter(Boolean).join(" ") || undefined],
    ["Lens", e.lens as string | undefined],
    ["Exposure", e.shutter ? `${fmtShutter(Number(e.shutter))}  f/${e.aperture ?? "–"}  ISO ${e.iso ?? "–"}` : undefined],
    ["Focal length", e.focal_length ? `${e.focal_length} mm` : undefined],
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <Stars value={photo.rating} onChange={onRate} size={16} />
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2"><span className="text-lr-dim shrink-0">{k}</span><span className="text-lr-hi text-right break-all">{v}</span></div>
      ))}
    </div>
  );
}
