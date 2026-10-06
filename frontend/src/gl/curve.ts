/** Monotone cubic (Fritsch–Carlson) curve sampled into n entries. Mirrors backend render.curve_lut. */
export function curveLut(points: [number, number][], n = 256): Float32Array {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const k = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < k - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array<number>(k).fill(0);
  m[0] = d[0];
  m[k - 1] = d[k - 2];
  for (let i = 1; i < k - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < k - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  const out = new Float32Array(n);
  let idx = 0;
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1);
    while (idx < k - 2 && x >= xs[idx + 1]) idx++;
    const t = Math.min(1, Math.max(0, (x - xs[idx]) / h[idx]));
    const t2 = t * t, t3 = t2 * t;
    const v =
      (2 * t3 - 3 * t2 + 1) * ys[idx] + (t3 - 2 * t2 + t) * h[idx] * m[idx] +
      (-2 * t3 + 3 * t2) * ys[idx + 1] + (t3 - t2) * h[idx] * m[idx + 1];
    out[j] = Math.min(1, Math.max(0, v));
  }
  return out;
}
