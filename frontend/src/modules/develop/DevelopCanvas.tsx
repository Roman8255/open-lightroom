import { useEffect, useRef, useState } from "react";
import { fileUrl } from "../../api/client";
import type { Hist } from "../../components/Histogram";
import { GLRenderer } from "../../gl/renderer";
import { defaultParams } from "../../gl/params";
import { useDevelop } from "../../store/develop";

export function DevelopCanvas({ photoId, onHistogram }: { photoId: number; onHistogram: (h: Hist) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<GLRenderer | null>(null);
  const raf = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const params = useDevelop((s) => s.params);
  const before = useDevelop((s) => s.before);

  const layout = () => {
    const r = gl.current, b = box.current, c = canvas.current;
    if (!r || !b || !c || !r.width) return;
    const scale = Math.min(b.clientWidth / r.width, b.clientHeight / r.height);
    const cssW = Math.floor(r.width * scale), cssH = Math.floor(r.height * scale);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.resize(Math.min(cssW * dpr, r.width), Math.min(cssH * dpr, r.height));
  };

  const paint = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = gl.current;
      if (!r) return;
      const st = useDevelop.getState();
      r.draw(st.before ? defaultParams() : st.params);
      onHistogram(r.histogram());
    });
  };

  // renderer lives as long as the canvas; images are swapped per photo
  useEffect(() => {
    try {
      gl.current = new GLRenderer(canvas.current!);
    } catch (e) {
      setError((e as Error).message);
    }
    const ro = new ResizeObserver(() => { layout(); paint(); });
    ro.observe(box.current!);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
      gl.current?.dispose();
      gl.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setReady(false);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !gl.current) return;
      gl.current.setImage(img);
      layout();
      setReady(true);
      paint();
    };
    img.onerror = () => !cancelled && setError("Failed to load image");
    img.src = fileUrl(photoId, "preview");
    return () => { cancelled = true; };
  }, [photoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready) paint(); }, [params, before, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className="flex-1 min-h-0 relative flex items-center justify-center bg-lr-bg overflow-hidden">
      <canvas ref={canvas} />
      {!ready && !error && <div className="absolute text-lr-dim">Loading…</div>}
      {error && <div className="absolute text-red-400">{error}</div>}
      {before && <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-lr-hi">Before</div>}
    </div>
  );
}
