import { useEffect, useRef, useState } from "react";
import { fileUrl } from "../../api/client";
import type { Hist } from "../../components/Histogram";
import { defaultParams } from "../../gl/params";
import { GLRenderer, type View } from "../../gl/renderer";
import { useDevelop } from "../../store/develop";
import { CropOverlay, EyeOverlay, MaskOverlay, SpotOverlay } from "./Overlays";

export function DevelopCanvas({ photoId, onHistogram }: { photoId: number; onHistogram: (h: Hist) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<GLRenderer | null>(null);
  const raf = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0, aspect: 1 });
  const params = useDevelop((s) => s.params);
  const before = useDevelop((s) => s.before);
  const tool = useDevelop((s) => s.tool);
  const view: View = tool === "crop" ? "crop" : tool ? "local" : "normal";

  const layout = () => {
    const r = gl.current, b = box.current, c = canvas.current;
    if (!r || !b || !c || !r.width) return;
    const st = useDevelop.getState();
    const aspect = r.frameAspect(st.before ? defaultParams() : st.params, currentView());
    const M = 20; // breathing room so overlay handles at the frame edge stay grabbable
    const scale = Math.min(Math.max(1, b.clientWidth - 2 * M) / aspect, Math.max(1, b.clientHeight - 2 * M));
    const cssW = Math.max(1, Math.floor(scale * aspect)), cssH = Math.max(1, Math.floor(scale));
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = Math.min(1, Math.max(r.width, r.height) / Math.max(cssW * dpr, cssH * dpr)); // never exceed source pixels
    r.resize(cssW * dpr * k, cssH * dpr * k);
    setSize((s) => (s.w === cssW && s.h === cssH ? s : { w: cssW, h: cssH, aspect: r.width / r.height }));
  };
  const currentView = (): View => { const t = useDevelop.getState().tool; return t === "crop" ? "crop" : t ? "local" : "normal"; };

  const paint = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = gl.current;
      if (!r || !r.width) return;
      const st = useDevelop.getState();
      layout();
      r.draw(st.before ? defaultParams() : st.params, st.before ? "normal" : currentView());
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
    const ro = new ResizeObserver(() => paint());
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
    img.crossOrigin = "use-credentials"; // API may live on another subdomain
    img.onload = () => {
      if (cancelled || !gl.current) return;
      gl.current.setImage(img);
      setReady(true);
      paint();
    };
    img.onerror = () => !cancelled && setError("Failed to load image");
    img.src = fileUrl(photoId, "preview");
    return () => { cancelled = true; };
  }, [photoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready) paint(); }, [params, before, ready, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const imgAspect = size.aspect;
  const showOverlay = ready && !before && size.w > 0;
  return (
    <div ref={box} className="flex-1 min-h-0 relative flex items-center justify-center bg-lr-bg overflow-hidden">
      <div className="relative" style={{ width: size.w || undefined, height: size.h || undefined }}>
        <canvas ref={canvas} className="block" />
        {showOverlay && tool === "crop" && <CropOverlay w={size.w} h={size.h} imgAspect={imgAspect} />}
        {showOverlay && tool === "spot" && <SpotOverlay w={size.w} h={size.h} imgAspect={imgAspect} />}
        {showOverlay && tool === "redeye" && <EyeOverlay w={size.w} h={size.h} imgAspect={imgAspect} />}
        {showOverlay && (tool === "linear" || tool === "radial" || tool === "brush") && <MaskOverlay w={size.w} h={size.h} imgAspect={imgAspect} />}
      </div>
      {!ready && !error && <div className="absolute text-lr-dim">Loading…</div>}
      {error && <div className="absolute text-red-400">{error}</div>}
      {before && <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-lr-hi">Before</div>}
      {tool && tool !== "crop" && <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-lr-dim">Editing view (geometry preview off)</div>}
    </div>
  );
}
