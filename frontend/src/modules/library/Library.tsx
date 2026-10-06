import { useEffect, useRef, useState } from "react";
import { type Photo, fileUrl } from "../../api/client";
import { ExportDialog } from "../../components/ExportDialog";
import { Filmstrip } from "../../components/Filmstrip";
import { CollectionsPanel, CommentsPanel, FoldersPanel, KeywordListPanel, KeywordingPanel, MetadataPanel, PublishPanel } from "../../components/LibraryPanels";
import { Panel } from "../../components/Panel";
import { QuickDevelop } from "../../components/QuickDevelop";
import { FlagIcon, LABELS, LABEL_COLOR, Stars } from "../../components/Rating";
import { ThumbHistogram } from "../../components/ThumbHistogram";
import { useHotkeys } from "../../hooks/useHotkeys";
import { useLibrary } from "../../store/library";

const SORTS: Record<string, string> = { captured_at: "Capture Time", created_at: "Added Order", rating: "Rating", filename: "File Name" };
type FilterMode = "text" | "attribute" | "none";

export function Library() {
  const lib = useLibrary();
  const { photos, selected, active, view, filter, thumbSize } = lib;
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<FilterMode>("none");
  const [text, setText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const activePhoto = photos.find((p) => p.id === active) ?? null;
  const ids = () => [...selected];

  useEffect(() => { void lib.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // debounce text search
  useEffect(() => {
    const t = setTimeout(() => {
      const q = mode === "text" ? text.trim() || undefined : undefined;
      if (q !== filter.q) void lib.setFilter({ q });
    }, 250);
    return () => clearTimeout(t);
  }, [text, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const gridCols = Math.max(1, Math.floor((window.innerWidth - 520) / (thumbSize + 4)));

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

  const filterBtn = (m: FilterMode, label: string) => (
    <button className={mode === m ? "text-lr-hi" : "text-lr-dim hover:text-lr-text"} onClick={() => {
      setMode(m);
      if (m === "none") { setText(""); void lib.setFilter({ q: undefined, rating_min: undefined, flag: undefined, color_label: undefined, collection_id: undefined, keyword_id: undefined, folder: undefined }); }
    }}>{label}</button>
  );

  return (
    <div className="flex-1 flex min-h-0" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {/* ───── Left panel ───── */}
      <aside className="w-[240px] shrink-0 bg-lr-panel border-r border-lr-border flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <Panel title="Navigator">
            {activePhoto
              ? <div className="h-[110px] bg-lr-bar grid place-items-center"><img src={fileUrl(activePhoto.id, "thumb")} className="w-full h-full object-contain" draggable={false} /></div>
              : <div className="h-[110px] bg-lr-bar" />}
          </Panel>
          <Panel title="Catalog">
            {([
              ["All Photographs", () => lib.setFilter({ rating_min: undefined, flag: undefined, color_label: undefined, q: undefined, collection_id: undefined, keyword_id: undefined, folder: undefined }), photos.length],
              ["Picked", () => lib.setFilter({ flag: 1 }), null],
              ["Rejected", () => lib.setFilter({ flag: -1 }), null],
              ["4+ Stars", () => lib.setFilter({ rating_min: 4 }), null],
            ] as [string, () => void, number | null][]).map(([name, fn, n]) => (
              <button key={name} className="flex w-full justify-between py-[3px] hover:text-lr-hi" onClick={fn}>
                <span>{name}</span><span className="text-lr-dim">{n}</span>
              </button>
            ))}
          </Panel>
          <FoldersPanel />
          <CollectionsPanel />
          <PublishPanel />
        </div>
        <div className="shrink-0 p-2 flex gap-2 border-t border-lr-border">
          <button className="lr-btn flex-1" onClick={() => fileInput.current?.click()}>Import…</button>
          <button className="lr-btn flex-1" disabled={!selected.size} onClick={() => setExporting(true)}>Export…</button>
          <input ref={fileInput} type="file" multiple accept="image/*" hidden
            onChange={(e) => { if (e.target.files) void lib.upload([...e.target.files]); e.target.value = ""; }} />
        </div>
        {lib.uploading && <div className="px-3 pb-2 text-lr-dim">Importing {lib.uploading.done}/{lib.uploading.total}…</div>}
      </aside>

      {/* ───── Center ───── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Library Filter bar */}
        <div className="shrink-0 bg-lr-panel border-b border-lr-border">
          <div className="h-[26px] flex items-center justify-center gap-4 text-[12px]">
            <span className="text-lr-dim">Library Filter:</span>
            {filterBtn("text", "Text")}<span className="text-[#444]">|</span>
            {filterBtn("attribute", "Attribute")}<span className="text-[#444]">|</span>
            <span className="text-[#4a4a4a]" title="Not available yet">Metadata</span><span className="text-[#444]">|</span>
            {filterBtn("none", "None")}
          </div>
          {mode === "text" && (
            <div className="h-8 flex items-center gap-2 px-3 border-t border-lr-border">
              <span className="text-lr-dim">File name contains</span>
              <input autoFocus className="bg-lr-bar rounded-sm px-2 py-0.5 w-56 outline-none focus:ring-1 ring-lr-accent text-lr-hi select-text"
                value={text} onChange={(e) => setText(e.target.value)} placeholder="Search…" />
            </div>
          )}
          {mode === "attribute" && (
            <div className="h-8 flex items-center gap-6 px-3 border-t border-lr-border">
              <span className="flex items-center gap-1.5">Flag
                {([[1, "⚑"], [-1, "✕"]] as const).map(([f, ch]) => (
                  <button key={f} className={`lr-btn !px-1.5 !py-0 ${filter.flag === f ? "lr-btn-active" : ""}`}
                    onClick={() => lib.setFilter({ flag: filter.flag === f ? undefined : f })}>{ch}</button>
                ))}
              </span>
              <span className="flex items-center gap-1.5">Rating ≥
                <Stars value={filter.rating_min ?? 0} size={14} onChange={(n) => lib.setFilter({ rating_min: n || undefined })} />
              </span>
              <span className="flex items-center gap-1.5">Color
                {LABELS.map((l) => (
                  <button key={l} title={l} className="w-3.5 h-3.5 border border-black/50"
                    style={{ background: LABEL_COLOR[l], outline: filter.color_label === l ? "2px solid #fff" : "none" }}
                    onClick={() => lib.setFilter({ color_label: filter.color_label === l ? undefined : l })} />
                ))}
              </span>
            </div>
          )}
        </div>

        {photos.length === 0 ? (
          <div className="flex-1 grid place-items-center text-lr-dim text-sm bg-[#262626]">
            {lib.loading ? "Loading…" : "Drop photos here or click Import… to get started"}
          </div>
        ) : view === "grid" ? (
          <div className="flex-1 overflow-y-auto bg-[#262626] p-[2px] grid gap-[3px] content-start"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>
            {photos.map((p, i) => (
              <Cell key={p.id} photo={p} index={i + 1} size={thumbSize} selected={selected.has(p.id)} active={p.id === active}
                onClick={(e) => lib.select(p.id, e.metaKey || e.ctrlKey ? "toggle" : e.shiftKey ? "range" : "single")}
                onOpen={() => { lib.select(p.id); lib.setModule("develop"); }}
                onRate={(n) => void lib.patch([p.id], { rating: n })} />
            ))}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center bg-[#1e1e1e] p-4">
            {activePhoto && <img src={fileUrl(activePhoto.id, "preview")} className="max-w-full max-h-full object-contain" draggable={false}
              onDoubleClick={() => lib.setModule("develop")} />}
          </div>
        )}

        {/* Toolbar */}
        <div className="h-[30px] shrink-0 bg-lr-panel border-t border-lr-border flex items-center gap-4 px-3">
          <div className="flex gap-0.5">
            <button className={`lr-btn !py-0 h-5 ${view === "grid" ? "lr-btn-active" : ""}`} title="Grid view (G)" onClick={() => lib.setView("grid")}>▦</button>
            <button className={`lr-btn !py-0 h-5 ${view === "loupe" ? "lr-btn-active" : ""}`} title="Loupe view (E)" onClick={() => lib.setView("loupe")}>▭</button>
            <button className="lr-btn !py-0 h-5" disabled title="Compare view – coming soon">XY</button>
            <button className="lr-btn !py-0 h-5" disabled title="Survey view – coming soon">⁝⁝</button>
          </div>
          <label className="flex items-center gap-1.5">Sort:
            <select className="bg-lr-bar rounded-sm px-1 py-0.5" value={filter.sort} onChange={(e) => lib.setFilter({ sort: e.target.value as never })}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="px-1 hover:text-lr-hi" onClick={() => lib.setFilter({ order: filter.order === "asc" ? "desc" : "asc" })}>{filter.order === "asc" ? "↑" : "↓"}</button>
          </label>
          <div className="flex-1" />
          {view === "grid" && (
            <label className="flex items-center gap-2">Thumbnails
              <input type="range" className="lr-slider !w-28" min={100} max={400} value={thumbSize} onChange={(e) => lib.setThumbSize(Number(e.target.value))} />
            </label>
          )}
        </div>
        <Filmstrip />
      </main>

      {/* ───── Right panel ───── */}
      <aside className="w-[260px] shrink-0 bg-lr-panel border-l border-lr-border overflow-y-auto">
        <Panel title="Histogram"><ThumbHistogram photoId={active} /></Panel>
        <QuickDevelop />
        <KeywordingPanel photo={activePhoto} />
        <KeywordListPanel />
        <MetadataPanel photo={activePhoto} onRate={(n) => void lib.patch(ids(), { rating: n })} />
        <CommentsPanel photo={activePhoto} />
        <Panel title="Shortcuts" defaultOpen={false}>
          <div className="text-lr-dim leading-5">
            0–5 rate · P pick · X reject · U unflag · 6–9 color label · G grid · E loupe · D develop · ←→↑↓ navigate · ⌘/Ctrl+A all · Del delete
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
    <div className={`group relative cursor-pointer ${selected ? (active ? "bg-[#6e6e6e]" : "bg-[#4a4a4a]") : "bg-[#2e2e2e] hover:bg-[#363636]"}`}
      style={{ height: size }} onClick={onClick} onDoubleClick={onOpen}>
      <span className={`absolute top-1 left-2 text-[11px] ${selected ? "text-lr-hi" : "text-lr-dim"}`}>{index}</span>
      <img src={fileUrl(photo.id, "thumb")} loading="lazy" draggable={false} className="w-full h-full object-contain px-3 pt-5 pb-6" />
      <div className="absolute top-1 right-2 flex items-center gap-1.5">
        <FlagIcon flag={photo.flag} />
        {photo.color_label && <span className="w-2.5 h-2.5" style={{ background: LABEL_COLOR[photo.color_label] }} />}
      </div>
      <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-lr-dim">
        <span className="flex items-center gap-1.5">
          {photo.has_edits && <span title="Edited">✎</span>}
        </span>
        <span className={photo.rating > 0 || selected ? "" : "opacity-0 group-hover:opacity-100"}><Stars value={photo.rating} onChange={onRate} size={11} /></span>
      </div>
    </div>
  );
}
