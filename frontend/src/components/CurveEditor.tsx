import { useRef, useState } from "react";
import { curveLut } from "../gl/curve";

type Pt = [number, number];
const S = 220;

export function CurveEditor({ points, onChange, onCommit }: {
  points: Pt[]; onChange: (p: Pt[]) => void; onCommit: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const lut = curveLut(points, 64);
  const path = Array.from(lut, (y, i) => `${i ? "L" : "M"}${(i / 63) * S},${(1 - y) * S}`).join(" ");

  const toPt = (e: React.PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toPt(e);
    let idx = points.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.045);
    if (idx < 0) {
      if (points.length >= 16) return;
      const next = [...points, p].sort((a, b) => a[0] - b[0]) as Pt[];
      idx = next.findIndex((q) => q === p);
      onChange(next);
    }
    setDrag(idx);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    const p = toPt(e);
    const next = points.map((q) => [...q] as Pt);
    const last = next.length - 1;
    if (drag === 0 || drag === last) {
      next[drag][1] = p[1]; // endpoints only move vertically
    } else {
      const lo = next[drag - 1][0] + 0.01, hi = next[drag + 1][0] - 0.01;
      next[drag] = [Math.min(hi, Math.max(lo, p[0])), p[1]];
    }
    onChange(next);
  };

  const onUp = () => { if (drag !== null) { setDrag(null); onCommit(); } };

  return (
    <svg ref={svg} viewBox={`0 0 ${S} ${S}`} className="w-full aspect-square bg-lr-bar rounded-sm touch-none"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      onDoubleClick={(e) => {
        const p = toPt(e as unknown as React.PointerEvent);
        const i = points.findIndex((q, k) => k > 0 && k < points.length - 1 && Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05);
        if (i > 0) { onChange(points.filter((_, k) => k !== i)); onCommit(); }
      }}>
      {[1, 2, 3].map((i) => (
        <g key={i} stroke="#333" strokeWidth="1">
          <line x1={(i * S) / 4} y1="0" x2={(i * S) / 4} y2={S} /><line x1="0" y1={(i * S) / 4} x2={S} y2={(i * S) / 4} />
        </g>
      ))}
      <line x1="0" y1={S} x2={S} y2="0" stroke="#444" strokeDasharray="3 3" />
      <path d={path} fill="none" stroke="#ddd" strokeWidth="1.5" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0] * S} cy={(1 - p[1]) * S} r="4" fill={drag === i ? "#4fa3ff" : "#222"} stroke="#ddd" />
      ))}
    </svg>
  );
}
