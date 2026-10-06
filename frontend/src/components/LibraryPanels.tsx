import { useCallback, useEffect, useRef, useState } from "react";
import { type Counted, type ExportOpts, type Photo, type PhotoComment, api } from "../api/client";
import { useLibrary } from "../store/library";
import { Panel } from "./Panel";
import { Stars } from "./Rating";

function useCounted(load: () => Promise<Counted[]>) {
  const version = useLibrary((s) => s.sidebarVersion);
  const [rows, setRows] = useState<Counted[]>([]);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => { loader.current().then(setRows).catch(() => setRows([])); }, [version]);
  return rows;
}

const download = (blob: Blob, name: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

const Row = ({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) => (
  <div onClick={onClick} className={`group flex items-center gap-1 py-[3px] px-1 rounded-sm cursor-pointer ${active ? "bg-[#4a4a4a] text-lr-hi" : "hover:text-lr-hi hover:bg-[#363636]"}`}>{children}</div>
);
const Mini = ({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
  <button title={title} className={`px-1 text-lr-dim ${danger ? "hover:text-red-400" : "hover:text-lr-hi"}`} onClick={(e) => { e.stopPropagation(); onClick(); }}>{children}</button>
);

// ───────────────────────── left side ─────────────────────────
export function FoldersPanel() {
  const lib = useLibrary();
  const folders = useCounted(api.folders);
  const dirInput = useRef<HTMLInputElement>(null);
  const importFolder = async (files: FileList) => {
    const groups = new Map<string, File[]>();
    [...files].filter((f) => f.type.startsWith("image/")).forEach((f) => {
      const top = (f as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "Uploads";
      groups.set(top, [...(groups.get(top) ?? []), f]);
    });
    for (const [name, list] of groups) await lib.upload(list, name);
  };
  return (
    <Panel title="Folders" defaultOpen>
      {folders.map((f) => (
        <Row key={f.name} active={lib.filter.folder === f.name} onClick={() => lib.setFilter({ folder: lib.filter.folder === f.name ? undefined : f.name })}>
          <span className="flex-1 truncate">📁 {f.name}</span><span className="text-lr-dim">{f.count}</span>
        </Row>
      ))}
      {folders.length === 0 && <span className="text-lr-dim">No folders yet</span>}
      <button className="text-lr-accent mt-1 block" onClick={() => dirInput.current?.click()}>+ Import folder…</button>
      <input ref={dirInput} type="file" hidden multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => { if (e.target.files) void importFolder(e.target.files); e.target.value = ""; }} />
    </Panel>
  );
}

export function CollectionsPanel() {
  const lib = useLibrary();
  const cols = useCounted(api.collections);
  const ids = [...lib.selected];
  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); lib.bumpSidebars(); await lib.load(); } catch (e) { lib.setError((e as Error).message); }
  };
  const activeId = lib.filter.collection_id;
  return (
    <Panel title="Collections">
      {cols.map((c) => (
        <Row key={c.id} active={activeId === c.id} onClick={() => lib.setFilter({ collection_id: activeId === c.id ? undefined : c.id! })}>
          <span className="flex-1 truncate">▤ {c.name}</span>
          <span className="hidden group-hover:flex">
            <Mini title="Add selected photos" onClick={() => ids.length && void act(() => api.addToCollection(c.id!, ids))}>＋</Mini>
            <Mini title="Rename" onClick={() => { const n = prompt("Rename collection", c.name); if (n?.trim()) void act(() => api.renameCollection(c.id!, n.trim())); }}>✎</Mini>
            <Mini title="Delete collection" danger onClick={() => {
              if (confirm(`Delete collection "${c.name}"? Photos stay in the library.`)) void act(async () => { await api.deleteCollection(c.id!); if (activeId === c.id) await lib.setFilter({ collection_id: undefined }); });
            }}>✕</Mini>
          </span>
          <span className="text-lr-dim">{c.count}</span>
        </Row>
      ))}
      {cols.length === 0 && <span className="text-lr-dim">No collections yet</span>}
      <div className="flex gap-2 mt-1">
        <button className="text-lr-accent" onClick={() => {
          const n = prompt("New collection name", ids.length ? "New collection" : "");
          if (n?.trim()) void act(async () => { const c = await api.createCollection(n.trim()); if (ids.length) await api.addToCollection(c.id!, ids); });
        }}>{ids.length ? `+ New from ${ids.length} selected` : "+ New collection"}</button>
        {activeId !== undefined && ids.length > 0 && (
          <button className="text-lr-dim hover:text-lr-hi" onClick={() => void act(() => api.removeFromCollection(activeId, ids))}>− Remove selected</button>
        )}
      </div>
    </Panel>
  );
}

export function PublishPanel() {
  const cols = useCounted(api.collections);
  const setError = useLibrary((s) => s.setError);
  const [opts, setOpts] = useState<ExportOpts>({ format: "jpeg", quality: 90 });
  const [busy, setBusy] = useState<number | null>(null);
  const publish = async (id: number, name: string) => {
    setBusy(id);
    try { download(await api.publishCollection(id, opts), `${name}.zip`); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Panel title="Publish Services" defaultOpen={false}>
      <div className="text-lr-dim mb-1">Hard Drive · renders a collection to a ZIP</div>
      <div className="flex items-center gap-1 mb-2">
        <select className="bg-lr-bar rounded-sm px-1 py-0.5" value={opts.format} onChange={(e) => setOpts({ ...opts, format: e.target.value as "jpeg" | "png" })}>
          <option value="jpeg">JPEG</option><option value="png">PNG</option>
        </select>
        <input className="bg-lr-bar rounded-sm px-1 py-0.5 w-12 text-right" title="Quality" value={opts.quality} inputMode="numeric"
          onChange={(e) => setOpts({ ...opts, quality: Math.min(100, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) })} />
        <input className="bg-lr-bar rounded-sm px-1 py-0.5 w-16 text-right" title="Long edge px" placeholder="px" value={opts.max_size ?? ""} inputMode="numeric"
          onChange={(e) => setOpts({ ...opts, max_size: e.target.value ? Math.max(16, Number(e.target.value.replace(/\D/g, ""))) : undefined })} />
      </div>
      {cols.map((c) => (
        <Row key={c.id}>
          <span className="flex-1 truncate">{c.name}</span>
          <button className="lr-btn !py-0 h-5" disabled={busy !== null || c.count === 0} onClick={() => void publish(c.id!, c.name)}>
            {busy === c.id ? "Publishing…" : `Publish ${c.count}`}
          </button>
        </Row>
      ))}
      {cols.length === 0 && <span className="text-lr-dim">Create a collection first</span>}
    </Panel>
  );
}

// ───────────────────────── right side ─────────────────────────
export function KeywordingPanel({ photo }: { photo: Photo | null }) {
  const lib = useLibrary();
  const [text, setText] = useState("");
  const ids = [...lib.selected];
  const apply = async (add: string[], remove: string[] = []) => {
    if (!ids.length) return;
    try { await api.applyKeywords(ids, add, remove); await lib.load(); lib.bumpSidebars(); } catch (e) { lib.setError((e as Error).message); }
  };
  return (
    <Panel title="Keywording">
      <div className="text-lr-dim mb-1">Add keywords to {ids.length || "no"} selected photo{ids.length === 1 ? "" : "s"} (comma separated)</div>
      <input className="w-full bg-lr-bar rounded-sm px-2 py-1 outline-none focus:ring-1 ring-lr-accent text-lr-hi select-text" value={text} placeholder="beach, sunset…"
        disabled={!ids.length} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { const add = text.split(",").map((s) => s.trim()).filter(Boolean); if (add.length) { void apply(add); setText(""); } } }} />
      <div className="flex flex-wrap gap-1 mt-2">
        {photo?.keywords.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 bg-[#444] rounded-sm px-1.5 py-0.5 text-lr-hi">
            {k}<button className="text-lr-dim hover:text-red-400" title="Remove from selection" onClick={() => void apply([], [k])}>×</button>
          </span>
        ))}
        {photo && photo.keywords.length === 0 && <span className="text-lr-dim">No keywords</span>}
      </div>
    </Panel>
  );
}

export function KeywordListPanel() {
  const lib = useLibrary();
  const kws = useCounted(api.keywords);
  return (
    <Panel title="Keyword List" defaultOpen={false}>
      {kws.map((k) => (
        <Row key={k.id} active={lib.filter.keyword_id === k.id} onClick={() => lib.setFilter({ keyword_id: lib.filter.keyword_id === k.id ? undefined : k.id! })}>
          <span className="flex-1 truncate">{k.name}</span>
          <span className="hidden group-hover:block">
            <Mini title="Delete keyword" danger onClick={() => { if (confirm(`Delete keyword "${k.name}" from all photos?`)) void api.deleteKeyword(k.id!).then(() => { lib.bumpSidebars(); return lib.setFilter({ keyword_id: undefined }); }); }}>✕</Mini>
          </span>
          <span className="text-lr-dim">{k.count}</span>
        </Row>
      ))}
      {kws.length === 0 && <span className="text-lr-dim">No keywords yet</span>}
    </Panel>
  );
}

export function MetadataPanel({ photo, onRate }: { photo: Photo | null; onRate: (n: number) => void }) {
  const lib = useLibrary();
  if (!photo) return <Panel title="Metadata"><span className="text-lr-dim">No photo selected</span></Panel>;
  const e = photo.exif as Record<string, string | number>;
  const fmtShutter = (v: number) => (v >= 1 ? `${v}s` : `1/${Math.round(1 / v)}s`);
  const rows: [string, string | undefined][] = [
    ["File Name", photo.filename], ["Folder", photo.folder],
    ["Dimensions", `${photo.width} × ${photo.height}`], ["File Size", `${(photo.size_bytes / 1048576).toFixed(1)} MB`],
    ["Capture Time", photo.captured_at ? new Date(photo.captured_at).toLocaleString() : undefined],
    ["Camera", [e.make, e.model].filter(Boolean).join(" ") || undefined], ["Lens", e.lens as string | undefined],
    ["Exposure", e.shutter ? `${fmtShutter(Number(e.shutter))} at f/${e.aperture ?? "–"}` : undefined],
    ["ISO", e.iso ? String(e.iso) : undefined], ["Focal Length", e.focal_length ? `${e.focal_length} mm` : undefined],
  ];
  const save = (field: "title" | "caption", value: string) => {
    if ((photo[field] ?? "") === value) return;
    lib.updatePhoto(photo.id, { [field]: value || null });
    void api.patchPhoto(photo.id, { [field]: value }).catch((err) => lib.setError((err as Error).message));
  };
  const field = "w-full bg-lr-bar rounded-sm px-2 py-1 outline-none focus:ring-1 ring-lr-accent text-lr-hi select-text";
  return (
    <Panel title="Metadata">
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center"><span className="text-lr-dim">Rating</span><Stars value={photo.rating} onChange={onRate} size={14} /></div>
        <label className="text-lr-dim">Title</label>
        <input key={`t${photo.id}`} className={field} defaultValue={photo.title ?? ""} maxLength={255} onBlur={(ev) => save("title", ev.target.value)} />
        <label className="text-lr-dim">Caption</label>
        <textarea key={`c${photo.id}`} className={`${field} resize-none h-14`} defaultValue={photo.caption ?? ""} maxLength={5000} onBlur={(ev) => save("caption", ev.target.value)} />
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2"><span className="text-lr-dim shrink-0">{k}</span><span className="text-lr-hi text-right break-all">{v}</span></div>
        ))}
      </div>
    </Panel>
  );
}

export function CommentsPanel({ photo }: { photo: Photo | null }) {
  const setError = useLibrary((s) => s.setError);
  const [items, setItems] = useState<PhotoComment[]>([]);
  const [text, setText] = useState("");
  const id = photo?.id ?? null;
  const reload = useCallback(() => { if (id !== null) api.comments(id).then(setItems).catch(() => setItems([])); else setItems([]); }, [id]);
  useEffect(reload, [reload]);
  const add = async () => {
    if (id === null || !text.trim()) return;
    try { await api.addComment(id, text.trim()); setText(""); reload(); } catch (e) { setError((e as Error).message); }
  };
  return (
    <Panel title="Comments" defaultOpen={false}>
      {items.map((c) => (
        <div key={c.id} className="group mb-1.5">
          <div className="text-lr-dim text-[10px] flex justify-between">
            <span>{new Date(c.created_at).toLocaleString()}</span>
            <button className="hidden group-hover:block hover:text-red-400" onClick={() => void api.deleteComment(c.id).then(reload)}>✕</button>
          </div>
          <div className="text-lr-hi select-text whitespace-pre-wrap break-words">{c.text}</div>
        </div>
      ))}
      {photo ? (
        <div className="flex gap-1">
          <input className="flex-1 bg-lr-bar rounded-sm px-2 py-1 outline-none focus:ring-1 ring-lr-accent text-lr-hi select-text" placeholder="Add a note…" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />
          <button className="lr-btn" onClick={() => void add()}>Add</button>
        </div>
      ) : <span className="text-lr-dim">No photo selected</span>}
    </Panel>
  );
}
