import type { Hist } from "../../components/Histogram";
import type { EditParams } from "../../gl/params";

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;

/** Percentile (0..255) of the combined RGB histogram. */
function percentile(h: Hist, q: number): number {
  let total = 0;
  for (let i = 0; i < 256; i++) total += h.r[i] + h.g[i] + h.b[i];
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += h.r[i] + h.g[i] + h.b[i];
    if (acc >= total * q) return i;
  }
  return 255;
}

/** Simple "Auto" tone: nudge exposure to a mid-gray median and stretch blacks/whites. Idempotent-ish: repeated clicks converge. */
export function autoTone(h: Hist, p: EditParams): EditParams {
  const median = percentile(h, 0.5) / 255;
  const lo = percentile(h, 0.01);
  const hi = percentile(h, 0.99);
  const expDelta = clamp(Math.log2(lin(0.46) / Math.max(lin(median), 1e-4)) * 0.7, -2, 2);
  const blacksDelta = lo > 12 ? -Math.min(40, (lo - 12) / 2.5) : lo < 2 ? 8 : 0;
  const whitesDelta = hi < 242 ? Math.min(40, (242 - hi) / 2.5) : hi > 253 ? -12 : 0;
  return {
    ...p,
    exposure: round(clamp(p.exposure + expDelta, -5, 5)),
    blacks: round(clamp(p.blacks + blacksDelta, -100, 100)),
    whites: round(clamp(p.whites + whitesDelta, -100, 100)),
  };
}
