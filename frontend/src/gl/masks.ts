import type { Mask } from "./params";

export const MASK_RES = 1024;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Coverage 0..1 in source space (mh rows × mw cols). Same algorithm as backend/app/services/render.py raster_mask. */
export function rasterMask(m: Mask, mw: number, mh: number): Float32Array {
  const v = new Float32Array(mw * mh);
  const aspect = mw / mh;
  if (m.type === "linear") {
    const dx = (m.x2 - m.x1) * aspect, dy = m.y2 - m.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 >= 1e-8) {
      for (let y = 0; y < mh; y++) {
        const Y = (y + 0.5) / mh;
        for (let x = 0; x < mw; x++) {
          const X = (x + 0.5) / mw;
          const t = ((X - m.x1) * aspect * dx + (Y - m.y1) * dy) / len2;
          v[y * mw + x] = 1 - smoothstep(0, 1, t);
        }
      }
    }
  } else if (m.type === "radial") {
    const inner = Math.min(1 - m.feather / 100, 0.98);
    for (let y = 0; y < mh; y++) {
      const Y = (y + 0.5) / mh;
      for (let x = 0; x < mw; x++) {
        const X = (x + 0.5) / mw;
        v[y * mw + x] = 1 - smoothstep(inner, 1, Math.hypot((X - m.cx) / m.rx, (Y - m.cy) / m.ry));
      }
    }
  } else {
    let budget = 20000;
    for (const st of m.strokes) {
      const r = Math.max(1, st.size * mh);
      const inner = Math.min(1 - st.feather, 0.98);
      const pts = st.points.map(([x, y]) => [x * mw, y * mh] as const);
      const stamps: [number, number][] = [];
      pts.forEach(([x, y], i) => {
        if (i === 0) { stamps.push([x, y]); return; }
        const [px, py] = pts[i - 1];
        const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / (0.25 * r)));
        for (let k = 1; k <= n; k++) stamps.push([px + ((x - px) * k) / n, py + ((y - py) * k) / n]);
      });
      for (const [cx, cy] of stamps.slice(0, Math.max(0, budget))) {
        const x0 = Math.max(0, Math.trunc(cx - r)), x1 = Math.min(mw, Math.trunc(cx + r) + 2);
        const y0 = Math.max(0, Math.trunc(cy - r)), y1 = Math.min(mh, Math.trunc(cy + r) + 2);
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const a = 1 - smoothstep(inner, 1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r);
            const i = y * mw + x;
            v[i] = st.erase ? v[i] * (1 - a) : v[i] + a - v[i] * a;
          }
        }
      }
      budget -= stamps.length;
    }
  }
  if (m.invert) for (let i = 0; i < v.length; i++) v[i] = 1 - v[i];
  return v;
}

export function maskDims(W: number, H: number): [number, number] {
  const k = Math.min(1, MASK_RES / Math.max(W, H));
  return [Math.max(2, Math.round(W * k)), Math.max(2, Math.round(H * k))];
}

/** RGBA8 texture data with up to 4 masks in the channels. */
export function maskTextureData(masks: Mask[], W: number, H: number): { data: Uint8Array; w: number; h: number } {
  const [w, h] = maskDims(W, H);
  const data = new Uint8Array(w * h * 4);
  masks.slice(0, 4).forEach((m, ch) => {
    if (!m.enabled) return;
    const v = rasterMask(m, w, h);
    for (let i = 0; i < v.length; i++) data[i * 4 + ch] = Math.round(v[i] * 255);
  });
  return { data, w, h };
}
