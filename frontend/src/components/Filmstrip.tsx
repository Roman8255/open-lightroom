import { useEffect, useRef } from "react";
import { fileUrl } from "../api/client";
import { useLibrary } from "../store/library";
import { FlagIcon, LABEL_COLOR } from "./Rating";

/** Filmstrip with Classic's info line on top (source · counts · current file). */
export function Filmstrip({ onOpen }: { onOpen?: (id: number) => void }) {
  const { photos, selected, active, select } = useLibrary();
  const ref = useRef<HTMLDivElement>(null);
  const current = photos.find((p) => p.id === active);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);
  return (
    <div className="lr-chrome shrink-0 bg-lr-panel border-t border-lr-border">
      <div className="h-[22px] flex items-center gap-3 px-3 text-lr-dim border-b border-lr-border bg-[#303030]">
        <span className="text-lr-text">All Photographs</span>
        <span>{photos.length} photos</span>
        <span>{selected.size} selected</span>
        {current && <span className="truncate">/ {current.filename}</span>}
      </div>
      <div ref={ref} className="h-[78px] bg-lr-bar flex items-center gap-[3px] px-2 overflow-x-auto overflow-y-hidden">
        {photos.map((p) => (
          <div key={p.id} data-id={p.id} className={`relative shrink-0 w-[66px] h-[66px] cursor-pointer ${
            selected.has(p.id) ? (p.id === active ? "bg-[#6a6a6a]" : "bg-[#484848]") : "bg-[#2a2a2a] hover:bg-[#383838]"}`}
            onClick={(e) => { select(p.id, e.metaKey || e.ctrlKey ? "toggle" : e.shiftKey ? "range" : "single"); onOpen?.(p.id); }}>
            <img src={fileUrl(p.id, "thumb")} loading="lazy" draggable={false} className="w-full h-full object-contain p-1" />
            <div className="absolute top-0.5 right-1 flex gap-0.5 text-[9px]">
              <FlagIcon flag={p.flag} />
              {p.color_label && <span className="w-2 h-2" style={{ background: LABEL_COLOR[p.color_label] }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
