import { useEffect, useRef } from "react";

export interface Hist { r: Uint32Array; g: Uint32Array; b: Uint32Array }

export function Histogram({ data }: { data: Hist | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!data) return;
    const max = Math.max(1, ...[...data.r, ...data.g, ...data.b].map((v) => v)) ;
    const cap = max * 0.6; // clip tall spikes like LR does
    ctx.globalCompositeOperation = "lighter";
    for (const [arr, color] of [[data.r, "#b4282a"], [data.g, "#28a050"], [data.b, "#2a50c8"]] as const) {
      ctx.fillStyle = color;
      for (let i = 0; i < 256; i++) {
        const h = Math.min(1, arr[i] / cap) * c.height;
        ctx.fillRect(i, c.height - h, 1, h);
      }
    }
  }, [data]);
  return <canvas ref={ref} width={256} height={100} className="w-full h-[100px] bg-lr-bar rounded-sm" />;
}
