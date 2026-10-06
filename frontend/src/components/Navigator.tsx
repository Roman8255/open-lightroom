import { useEffect, useRef, useState } from "react";
import { fileUrl } from "../api/client";

export interface NavRect { x: number; y: number; w: number; h: number }

/** Lightroom-style Navigator: thumbnail with the visible area outlined while zoomed. Click to move the view. */
export function Navigator({ photo, rect, onPick }: {
  photo: { id: number; width: number; height: number } | null;
  rect?: NavRect | null; // in source-image uv
  onPick?: (u: number, v: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(216);
  useEffect(() => {
    const ro = new ResizeObserver(() => setCw(box.current?.clientWidth ?? 216));
    ro.observe(box.current!);
    return () => ro.disconnect();
  }, []);
  const H = 110;
  const aspect = photo ? photo.width / photo.height : 1.5;
  const w = Math.min(cw, H * aspect), h = w / aspect;
  return (
    <div ref={box} className="relative h-[110px] bg-lr-bar overflow-hidden flex items-center justify-center">
      {photo && (
        <div className="relative" style={{ width: w, height: h, cursor: onPick && rect ? "crosshair" : undefined }}
          onPointerDown={(e) => {
            if (!onPick || !rect) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }}>
          <img src={fileUrl(photo.id, "thumb")} className="absolute inset-0 w-full h-full" draggable={false} />
          {rect && (
            <div className="absolute border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] pointer-events-none"
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />
          )}
        </div>
      )}
    </div>
  );
}
