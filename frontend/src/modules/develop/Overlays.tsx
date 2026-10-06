import { type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent, useEffect, useRef, useState } from "react";
import { maskDims, rasterMask } from "../../gl/masks";
import { type Crop, type Mask, newMask } from "../../gl/params";
import { type CropAspect, lockedRatio, useDevelop } from "../../store/develop";

export interface OverlayProps { w: number; h: number; imgAspect: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const SVG_STYLE = { touchAction: "none" } as const;

function usePointer(ref: React.RefObject<SVGSVGElement>) {
  return (e: { clientX: number; clientY: number }): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
  };
}

// ───────────────────────────── Crop ─────────────────────────────
type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

/** Pure crop-drag math (also unit-tested). `nr` = locked normalised ratio w/h, or null. */
export function dragCrop(start: Crop, handle: HandleId, p: [number, number], d: [number, number], nr: number | null): Crop {
  const MIN = 0.04;
  const { x, y, w, h } = start;
  if (handle === "move") {
    return { ...start, x: Math.min(1 - w, Math.max(0, x + d[0])), y: Math.min(1 - h, Math.max(0, y + d[1])) };
  }
  const hasW = handle.includes("w"), hasE = handle.includes("e"), hasN = handle.includes("n"), hasS = handle.includes("s");
  let l = x, t = y, r = x + w, b = y + h;
  const corner = (hasW || hasE) && (hasN || hasS);
  if (!nr) {
    if (hasW) l = Math.min(r - MIN, Math.max(0, l + d[0]));
    if (hasE) r = Math.max(l + MIN, Math.min(1, r + d[0]));
    if (hasN) t = Math.min(b - MIN, Math.max(0, t + d[1]));
    if (hasS) b = Math.max(t + MIN, Math.min(1, b + d[1]));
    return { ...start, x: l, y: t, w: r - l, h: b - t };
  }
  if (corner) {
    const ax = hasW ? r : l, ay = hasN ? b : t;
    const maxW = Math.min(hasW ? ax : 1 - ax, (hasN ? ay : 1 - ay) * nr);
    const nw = Math.max(MIN, Math.min(Math.abs(p[0] - ax), maxW));
    const nh = nw / nr;
    return { ...start, x: hasW ? ax - nw : ax, y: hasN ? ay - nh : ay, w: nw, h: nh };
  }
  const cx = x + w / 2, cy = y + h / 2;
  if (hasW || hasE) {
    const nwRaw = hasE ? p[0] - l : r - p[0];
    const maxW = Math.min(hasE ? 1 - l : r, 2 * Math.min(cy, 1 - cy) * nr);
    const nw = Math.max(MIN, Math.min(nwRaw, maxW)), nh = nw / nr;
    return { ...start, x: hasE ? l : r - nw, y: cy - nh / 2, w: nw, h: nh };
  }
  const nhRaw = hasS ? p[1] - t : b - p[1];
  const maxH = Math.min(hasS ? 1 - t : b, (2 * Math.min(cx, 1 - cx)) / nr);
  const nh = Math.max(MIN, Math.min(nhRaw, maxH)), nw = nh * nr;
  return { ...start, x: cx - nw / 2, y: hasS ? t : b - nh, w: nw, h: nh };
}

/** Largest crop with the given normalised ratio centered on the current crop. */
export function fitCropToRatio(c: Crop, nr: number): Crop {
  let w = c.w, h = c.w / nr;
  if (h > c.h) { h = c.h; w = h * nr; }
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  return { ...c, x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)), w, h };
}

export function CropOverlay({ w, h, imgAspect }: OverlayProps) {
  const svg = useRef<SVGSVGElement>(null);
  const PAD = 16; // extra hit area so edge handles can be grabbed
  const toN = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [(e.clientX - r.left - PAD) / w, (e.clientY - r.top - PAD) / h];
  };
  const params = useDevelop((s) => s.params);
  const aspect = useDevelop((s) => s.cropAspect) as CropAspect;
  const flip = useDevelop((s) => s.cropFlip);
  const setParams = useDevelop((s) => s.setParams);
  const commit = useDevelop((s) => s.commit);
  const drag = useRef<{ handle: HandleId; start: Crop; p0: [number, number] } | null>(null);
  const c = params.crop;
  const px = (v: number, dim: number) => v * dim;
  const nrOf = () => { const r = lockedRatio(aspect, flip, imgAspect); return r ? r / imgAspect : null; };

  const L = px(c.x, w), T = px(c.y, h), W = px(c.w, w), H = px(c.h, h);
  const handles: [HandleId, number, number][] = [
    ["nw", L, T], ["n", L + W / 2, T], ["ne", L + W, T], ["e", L + W, T + H / 2],
    ["se", L + W, T + H], ["s", L + W / 2, T + H], ["sw", L, T + H], ["w", L, T + H / 2],
  ];

  const down = (e: RPointerEvent) => {
    const [nx, ny] = toN(e);
    const [mx, my] = [nx * w, ny * h];
    let handle: HandleId | null = null;
    for (const [id, hx, hy] of handles) if (Math.hypot(hx - mx, hy - my) < 12) { handle = id; break; }
    if (!handle && mx > L && mx < L + W && my > T && my < T + H) handle = "move";
    if (!handle) return;
    drag.current = { handle, start: c, p0: [nx, ny] };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toN(e).map((v) => Math.min(1, Math.max(0, v))) as [number, number];
    setParams({ ...params, crop: dragCrop(d.start, d.handle, p, [p[0] - d.p0[0], p[1] - d.p0[1]], nrOf()) });
  };
  const up = () => { if (drag.current) { drag.current = null; commit("Crop"); } };

  return (
    <svg ref={svg} width={w + 2 * PAD} height={h + 2 * PAD} className="absolute" style={{ ...SVG_STYLE, left: -PAD, top: -PAD }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <g transform={`translate(${PAD},${PAD})`}>
      <path fillRule="evenodd" fill="rgba(0,0,0,0.55)" d={`M0 0H${w}V${h}H0Z M${L} ${T}h${W}v${H}h${-W}Z`} />
      <rect x={L} y={T} width={W} height={H} fill="none" stroke="#fff" strokeWidth="1" />
      {[1, 2].map((i) => (
        <g key={i} stroke="rgba(255,255,255,0.45)" strokeWidth="1">
          <line x1={L + (W * i) / 3} y1={T} x2={L + (W * i) / 3} y2={T + H} />
          <line x1={L} y1={T + (H * i) / 3} x2={L + W} y2={T + (H * i) / 3} />
        </g>
      ))}
      {handles.map(([id, hx, hy]) => <rect key={id} x={hx - 4} y={hy - 4} width={8} height={8} fill="#fff" stroke="#000" strokeWidth="0.5" />)}
      </g>
    </svg>
  );
}

// ───────────────────────────── Spots & red eye ─────────────────────────────
export function SpotOverlay({ w, h, imgAspect }: OverlayProps) {
  const svg = useRef<SVGSVGElement>(null);
  const toN = usePointer(svg);
  const st = useDevelop();
  const drag = useRef<{ kind: "dest" | "src"; i: number } | null>(null);
  const rpx = (r: number) => r * h;

  const down = (e: RPointerEvent) => {
    const [nx, ny] = toN(e);
    const [mx, my] = [nx * w, ny * h];
    const spots = st.params.spots;
    for (let i = spots.length - 1; i >= 0; i--) {
      const s = spots[i];
      if (Math.hypot(s.sx * w - mx, s.sy * h - my) <= rpx(s.r) + 4 && st.selSpot === i) { drag.current = { kind: "src", i }; break; }
      if (Math.hypot(s.x * w - mx, s.y * h - my) <= rpx(s.r) + 4) { drag.current = { kind: "dest", i }; st.selectSpot(i); break; }
    }
    if (!drag.current) {
      const r = 0.04;
      const sxRight = nx + (2.4 * r) / imgAspect;
      st.addSpot({ x: nx, y: ny, r, sx: sxRight <= 1 ? sxRight : Math.max(0, nx - (2.4 * r) / imgAspect), sy: ny, mode: "heal", feather: 0.5, opacity: 1 });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [nx, ny] = toN(e);
    st.updateSpot(d.i, d.kind === "dest" ? { x: nx, y: ny } : { sx: nx, sy: ny });
  };
  const up = () => { if (drag.current) { drag.current = null; st.commit("Move spot"); } };
  const wheel = (e: RWheelEvent) => {
    if (st.selSpot === null) return;
    const s = st.params.spots[st.selSpot];
    if (s) st.updateSpot(st.selSpot, { r: Math.min(0.3, Math.max(0.003, s.r * Math.exp(-e.deltaY / 500))) });
  };
  const wheelCommit = useRef<ReturnType<typeof setTimeout>>();
  const onWheel = (e: RWheelEvent) => { wheel(e); clearTimeout(wheelCommit.current); wheelCommit.current = setTimeout(() => st.commit("Spot size"), 300); };

  return (
    <svg ref={svg} width={w} height={h} className="absolute inset-0 cursor-crosshair" style={SVG_STYLE}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={onWheel}>
      {st.params.spots.map((s, i) => {
        const sel = st.selSpot === i;
        return (
          <g key={i}>
            <line x1={s.x * w} y1={s.y * h} x2={s.sx * w} y2={s.sy * h} stroke="#fff" strokeOpacity={sel ? 0.8 : 0.35} strokeDasharray="3 3" />
            <circle cx={s.sx * w} cy={s.sy * h} r={rpx(s.r)} fill="none" stroke="#fff" strokeOpacity={sel ? 0.9 : 0.4} strokeDasharray="4 3" />
            <circle cx={s.x * w} cy={s.y * h} r={rpx(s.r)} fill="rgba(90,160,232,0.12)" stroke={sel ? "#5aa0e8" : "#fff"} strokeWidth={sel ? 2 : 1} />
          </g>
        );
      })}
    </svg>
  );
}

export function EyeOverlay({ w, h }: OverlayProps) {
  const svg = useRef<SVGSVGElement>(null);
  const toN = usePointer(svg);
  const st = useDevelop();
  const drag = useRef<number | null>(null);

  const down = (e: RPointerEvent) => {
    const [nx, ny] = toN(e);
    const eyes = st.params.red_eyes;
    for (let i = eyes.length - 1; i >= 0; i--) {
      if (Math.hypot(eyes[i].x * w - nx * w, eyes[i].y * h - ny * h) <= eyes[i].r * h + 4) { drag.current = i; st.selectEye(i); break; }
    }
    if (drag.current === null) { st.addEye({ x: nx, y: ny, r: 0.02, amount: 0.8 }); return; }
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: RPointerEvent) => {
    if (drag.current === null) return;
    const [nx, ny] = toN(e);
    st.updateEye(drag.current, { x: nx, y: ny });
  };
  const up = () => { if (drag.current !== null) { drag.current = null; st.commit("Move red-eye fix"); } };
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const onWheel = (e: RWheelEvent) => {
    if (st.selEye === null) return;
    const s = st.params.red_eyes[st.selEye];
    if (s) st.updateEye(st.selEye, { r: Math.min(0.1, Math.max(0.003, s.r * Math.exp(-e.deltaY / 500))) });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => st.commit("Red-eye size"), 300);
  };

  return (
    <svg ref={svg} width={w} height={h} className="absolute inset-0 cursor-crosshair" style={SVG_STYLE}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={onWheel}>
      {st.params.red_eyes.map((s, i) => (
        <circle key={i} cx={s.x * w} cy={s.y * h} r={s.r * h} fill="rgba(229,72,77,0.15)" stroke={st.selEye === i ? "#5aa0e8" : "#fff"} strokeWidth={st.selEye === i ? 2 : 1} />
      ))}
    </svg>
  );
}

// ───────────────────────────── Masks ─────────────────────────────
function MaskRaster({ mask, w, h, imgAspect }: { mask: Mask; w: number; h: number; imgAspect: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const key = JSON.stringify(mask);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const c = ref.current;
      if (!c) return;
      const [mw, mh] = maskDims(Math.round(imgAspect * 1000), 1000);
      c.width = mw; c.height = mh;
      const v = rasterMask(mask, mw, mh);
      const img = new ImageData(mw, mh);
      for (let i = 0; i < v.length; i++) { img.data[i * 4] = 229; img.data[i * 4 + 1] = 40; img.data[i * 4 + 2] = 50; img.data[i * 4 + 3] = Math.round(v[i] * 140); }
      c.getContext("2d")!.putImageData(img, 0, 0);
    });
    return () => cancelAnimationFrame(raf.current);
  }, [key, imgAspect]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="absolute inset-0 pointer-events-none" style={{ width: w, height: h }} />;
}

type MDrag =
  | { kind: "p1" | "p2" | "move-lin"; i: number; start: Mask; p0: [number, number] }
  | { kind: "center" | "rx" | "ry"; i: number; start: Mask; p0: [number, number] }
  | { kind: "stroke"; i: number };

export function MaskOverlay({ w, h, imgAspect }: OverlayProps) {
  const svg = useRef<SVGSVGElement>(null);
  const toN = usePointer(svg);
  const st = useDevelop();
  const { tool, params, selMask } = st;
  const drag = useRef<MDrag | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const masks = params.masks;
  const sel = selMask !== null ? masks[selMask] : null;

  // pin = clickable anchor of each mask
  const anchor = (m: Mask): [number, number] =>
    m.type === "linear" ? [(m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2]
      : m.type === "radial" ? [m.cx, m.cy]
        : m.strokes[0]?.points[0] ?? [0.5, 0.5];

  const down = (e: RPointerEvent) => {
    const [nx, ny] = toN(e);
    const [mx, my] = [nx * w, ny * h];
    const near = (x: number, y: number, r = 12) => Math.hypot(x * w - mx, y * h - my) < r;

    // 1) handles of the selected mask
    if (sel && selMask !== null && tool !== "brush") {
      if (sel.type === "linear") {
        if (near(sel.x1, sel.y1)) drag.current = { kind: "p1", i: selMask, start: sel, p0: [nx, ny] };
        else if (near(sel.x2, sel.y2)) drag.current = { kind: "p2", i: selMask, start: sel, p0: [nx, ny] };
        else if (near((sel.x1 + sel.x2) / 2, (sel.y1 + sel.y2) / 2)) drag.current = { kind: "move-lin", i: selMask, start: sel, p0: [nx, ny] };
      } else if (sel.type === "radial") {
        if (near(sel.cx + sel.rx, sel.cy)) drag.current = { kind: "rx", i: selMask, start: sel, p0: [nx, ny] };
        else if (near(sel.cx, sel.cy + sel.ry)) drag.current = { kind: "ry", i: selMask, start: sel, p0: [nx, ny] };
        else if (near(sel.cx, sel.cy)) drag.current = { kind: "center", i: selMask, start: sel, p0: [nx, ny] };
      }
    }
    // 2) pins of other masks → select
    if (!drag.current) {
      for (let i = 0; i < masks.length; i++) {
        const [ax, ay] = anchor(masks[i]);
        if (near(ax, ay, 11) && i !== selMask) { st.selectMask(i); return; }
      }
    }
    // 3) create new mask / start a brush stroke
    if (!drag.current) {
      if (tool === "linear") {
        if (!st.addMask(newMask("linear", { x1: nx, y1: ny, x2: nx, y2: ny }))) return;
        drag.current = { kind: "p2", i: get().params.masks.length - 1, start: get().params.masks.at(-1)!, p0: [nx, ny] };
      } else if (tool === "radial") {
        if (!st.addMask(newMask("radial", { cx: nx, cy: ny, rx: 0.02, ry: 0.02 }))) return;
        drag.current = { kind: "rx", i: get().params.masks.length - 1, start: get().params.masks.at(-1)!, p0: [nx, ny] };
      } else if (tool === "brush") {
        const { brush } = st;
        const erase = brush.erase || e.altKey;
        const stroke = { size: brush.size, feather: brush.feather, erase, points: [[nx, ny]] as [number, number][] };
        let i = selMask;
        if (!sel || sel.type !== "brush") {
          if (!st.addMask(newMask("brush", { strokes: [stroke] }))) return;
          i = get().params.masks.length - 1;
        } else {
          st.updateMask(selMask!, { strokes: [...sel.strokes, stroke] });
        }
        drag.current = { kind: "stroke", i: i! };
      }
    }
    if (drag.current) (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const move = (e: RPointerEvent) => {
    const p = toN(e);
    setCursor(p);
    const d = drag.current;
    if (!d) return;
    if (d.kind === "stroke") {
      const m = get().params.masks[d.i];
      const last = m.strokes[m.strokes.length - 1];
      const prev = last.points[last.points.length - 1];
      if (Math.hypot((p[0] - prev[0]) * imgAspect, p[1] - prev[1]) < last.size * 0.25 || last.points.length >= 1500) return;
      const strokes = m.strokes.map((s, k) => (k === m.strokes.length - 1 ? { ...s, points: [...s.points, p] } : s));
      st.updateMask(d.i, { strokes });
      return;
    }
    const s = d.start;
    if (d.kind === "p1") st.updateMask(d.i, { x1: p[0], y1: p[1] });
    else if (d.kind === "p2") st.updateMask(d.i, { x2: p[0], y2: p[1] });
    else if (d.kind === "move-lin") {
      const dx = p[0] - d.p0[0], dy = p[1] - d.p0[1];
      const cl = (v: number) => Math.min(1, Math.max(0, v));
      st.updateMask(d.i, { x1: cl(s.x1 + dx), y1: cl(s.y1 + dy), x2: cl(s.x2 + dx), y2: cl(s.y2 + dy) });
    } else if (d.kind === "center") st.updateMask(d.i, { cx: p[0], cy: p[1] });
    else if (d.kind === "rx") st.updateMask(d.i, { rx: Math.max(0.02, Math.abs(p[0] - s.cx)), ...(s.rx === 0.02 && s.ry === 0.02 ? { ry: Math.max(0.02, Math.abs(p[1] - s.cy)) } : {}) });
    else if (d.kind === "ry") st.updateMask(d.i, { ry: Math.max(0.02, Math.abs(p[1] - s.cy)) });
  };

  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.kind === "p2") {
      const m = get().params.masks[d.i];
      if (Math.hypot((m.x2 - m.x1) * imgAspect, m.y2 - m.y1) < 0.02) st.updateMask(d.i, { y2: Math.min(1, m.y1 + 0.25) });
    }
    st.commit(d.kind === "stroke" ? "Brush stroke" : "Edit mask");
  };

  const brushR = st.brush.size * h;
  const isBrush = tool === "brush";
  return (
    <>
      {st.showMaskOverlay && sel && sel.enabled && <MaskRaster mask={sel} w={w} h={h} imgAspect={imgAspect} />}
      <svg ref={svg} width={w} height={h} className="absolute inset-0 cursor-crosshair" style={SVG_STYLE}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setCursor(null)}>
        {masks.map((m, i) => {
          const on = i === selMask;
          const col = !m.enabled ? "#777" : on ? "#5aa0e8" : "#fff";
          const [ax, ay] = anchor(m);
          const geo = (() => {
            if (!on) return null;
            if (m.type === "linear") {
              const dx = (m.x2 - m.x1) * imgAspect, dy = m.y2 - m.y1;
              const len = Math.hypot(dx, dy) || 1;
              // perpendicular direction in normalised coords, long enough to span the frame
              const px = (-dy / len) / imgAspect * 2, py = (dx / len) * 2;
              const line = (x: number, y: number, k: string) => (
                <line key={k} x1={(x - px) * w} y1={(y - py) * h} x2={(x + px) * w} y2={(y + py) * h} stroke={col} strokeWidth="1" strokeDasharray={k === "b" ? "5 4" : ""} />
              );
              return (
                <g>
                  {line(m.x1, m.y1, "a")}{line(m.x2, m.y2, "b")}
                  <circle cx={m.x1 * w} cy={m.y1 * h} r={5} fill="#fff" stroke="#000" />
                  <circle cx={m.x2 * w} cy={m.y2 * h} r={5} fill="#fff" stroke="#000" />
                </g>
              );
            }
            if (m.type === "radial") {
              return (
                <g>
                  <ellipse cx={m.cx * w} cy={m.cy * h} rx={m.rx * w} ry={m.ry * h} fill="none" stroke={col} />
                  <circle cx={(m.cx + m.rx) * w} cy={m.cy * h} r={5} fill="#fff" stroke="#000" />
                  <circle cx={m.cx * w} cy={(m.cy + m.ry) * h} r={5} fill="#fff" stroke="#000" />
                </g>
              );
            }
            return null;
          })();
          return (
          <g key={i}>
            {geo}
            <circle cx={ax * w} cy={ay * h} r={on ? 7 : 6} fill={on ? "#5aa0e8" : "rgba(0,0,0,0.55)"} stroke={col} strokeWidth="2" />
            <text x={ax * w} y={ay * h + 3.5} fontSize="9" textAnchor="middle" fill={on ? "#000" : col}>{i + 1}</text>
          </g>
        );
        })}
        {isBrush && cursor && (
          <circle cx={cursor[0] * w} cy={cursor[1] * h} r={brushR} fill="none" stroke="#fff" strokeOpacity="0.9" />
        )}
      </svg>
    </>
  );
}

const get = useDevelop.getState;
