import { useState } from "react";
import { COPY_SECTIONS, allItems, loadCopySelection, pickSettings, saveCopySelection } from "../gl/copyGroups";
import { useDevelop } from "../store/develop";

/** Lightroom's "Copy Settings" dialog: choose exactly which settings go to the clipboard. */
export function CopyDialog() {
  const source = useDevelop((s) => s.copyDialog);
  const close = useDevelop((s) => s.closeCopy);
  const setClipboard = useDevelop((s) => s.setClipboard);
  const [sel, setSel] = useState(loadCopySelection);
  if (!source) return null;

  const setAll = (v: boolean) => setSel(Object.fromEntries(allItems().map((i) => [i.id, v])));
  const toggleSection = (ids: string[], v: boolean) => setSel({ ...sel, ...Object.fromEntries(ids.map((id) => [id, v])) });
  const count = allItems().filter((i) => sel[i.id]).length;

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={close}>
      <div className="w-[440px] max-h-[88vh] bg-lr-panel rounded shadow-2xl flex flex-col text-[11px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 h-10 flex items-center bg-lr-bar rounded-t text-lr-hi text-[13px]">Copy Settings</div>
        <div className="px-4 py-2 flex gap-3 border-b border-lr-border">
          <button className="text-lr-accent" onClick={() => setAll(true)}>Check All</button>
          <button className="text-lr-accent" onClick={() => setAll(false)}>Check None</button>
          <span className="flex-1" />
          <span className="text-lr-dim">{count} selected</span>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {COPY_SECTIONS.map((sec) => {
            const ids = sec.items.map((i) => i.id);
            const on = ids.filter((id) => sel[id]).length;
            return (
              <div key={sec.id} className="mb-2">
                <label className="flex items-center gap-2 text-lr-hi py-0.5">
                  <input type="checkbox" checked={on === ids.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < ids.length; }}
                    onChange={(e) => toggleSection(ids, e.target.checked)} />
                  {sec.label}
                </label>
                {(sec.items.length > 1 || sec.items[0].label !== sec.label) && sec.items.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 pl-6 py-0.5">
                    <input type="checkbox" checked={!!sel[i.id]} onChange={(e) => setSel({ ...sel, [i.id]: e.target.checked })} />
                    {i.label}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-3 flex justify-end gap-2 border-t border-lr-border">
          <button className="lr-btn" onClick={close}>Cancel</button>
          <button className="px-4 py-1 rounded-sm bg-lr-accent text-black disabled:opacity-50" disabled={count === 0}
            onClick={() => { saveCopySelection(sel); setClipboard(pickSettings(source, sel)); close(); }}>Copy</button>
        </div>
      </div>
    </div>
  );
}
