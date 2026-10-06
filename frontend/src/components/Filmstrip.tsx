import { useEffect, useRef } from "react";
import { fileUrl } from "../api/client";
import { useLibrary } from "../store/library";

export function Filmstrip({ onOpen }: { onOpen?: (id: number) => void }) {
  const { photos, selected, active, select } = useLibrary();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);
  return (
    <div ref={ref} className="h-[84px] shrink-0 bg-lr-bar border-t border-lr-border flex items-center gap-1 px-2 overflow-x-auto overflow-y-hidden">
      {photos.map((p) => (
        <img key={p.id} data-id={p.id} src={fileUrl(p.id, "thumb")} loading="lazy" draggable={false}
          className={`h-[68px] w-[68px] object-contain bg-lr-bg cursor-pointer shrink-0 border ${
            selected.has(p.id) ? (p.id === active ? "border-lr-hi" : "border-lr-dim") : "border-transparent opacity-80 hover:opacity-100"}`}
          onClick={(e) => { select(p.id, e.metaKey || e.ctrlKey ? "toggle" : e.shiftKey ? "range" : "single"); onOpen?.(p.id); }} />
      ))}
    </div>
  );
}
