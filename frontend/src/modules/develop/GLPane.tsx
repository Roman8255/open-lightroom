import { type ReactNode, useEffect, useRef, useState } from "react";
import { fileUrl } from "../../api/client";
import type { Hist } from "../../components/Histogram";
import type { EditParams } from "../../gl/params";
import { FULL, GLRenderer, type Region, type View } from "../../gl/renderer";

const HI_RES_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface PaneSize { w: number; h: number; aspect: number }
interface Props {
  photoId: number; mime: string; params: EditParams; view: View; label?: string;
  zoom: boolean; pan: [number, number]; clip: boolean; interactive: boolean;
  onHistogram?: (h: Hist) => void;
  onZoom?: (on: boolean, center?: [number, number]) => void;
  onPan?: (c: [number, number]) => void;
  onRegion?: (r: Region | null) => void;
  children?: (s: PaneSize) => ReactNode;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "use-credentials"; // API may live on another subdomain
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

/** One WebGL canvas that renders a photo, with Lightroom-style fit / 100% zoom and drag-to-pan. */
export function GLPane(props: Props) {
  const { photoId, mime, label, interactive, children } = props;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gl = useRef<GLRenderer | null>(null);
  const raf = useRef(0);
  const latest = useRef(props);
  latest.current = props;
  const preview = useRef<HTMLImageElement | null>(null);
  const original = useRef<{ id: number; img: HTMLImageElement } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState<PaneSize>({ w: 0, h: 0, aspect: 1 });
  const drag = useRef<{ x: number; y: number; moved: boolean; pan: [number, number] } | null>(null);

  const paint = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = gl.current, b = box.current, c = canvas.current;
      if (!r || !b || !c || !r.width) return;
      const { params: p, view, zoom, pan, clip, onHistogram } = latest.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const crop = view === "normal" ? p.crop : { w: 1, h: 1 };
      const framePxW = r.width * crop.w, framePxH = r.height * crop.h;
      let region: Region = FULL, cssW: number, cssH: number, pxW: number, pxH: number;
      if (!zoom) {
        const M = 20; // breathing room so overlay handles at the frame edge stay grabbable
        const aspect = r.frameAspect(p, view);
        const scale = Math.min(Math.max(1, b.clientWidth - 2 * M) / aspect, Math.max(1, b.clientHeight - 2 * M));
        cssW = Math.max(1, Math.floor(scale * aspect)); cssH = Math.max(1, Math.floor(scale));
        const k = Math.min(1, Math.max(r.width, r.height) / Math.max(cssW * dpr, cssH * dpr)); // never exceed source pixels
        pxW = cssW * dpr * k; pxH = cssH * dpr * k;
      } else {
        pxW = Math.min(b.clientWidth * dpr, framePxW); pxH = Math.min(b.clientHeight * dpr, framePxH);
        cssW = Math.max(1, Math.floor(pxW / dpr)); cssH = Math.max(1, Math.floor(pxH / dpr));
        const rw = Math.min(1, pxW / framePxW), rh = Math.min(1, pxH / framePxH);
        region = { w: rw, h: rh, x: clamp(pan[0] - rw / 2, 0, 1 - rw), y: clamp(pan[1] - rh / 2, 0, 1 - rh) };
      }
      c.style.width = `${cssW}px`; c.style.height = `${cssH}px`;
      r.resize(pxW, pxH);
      setSize((s) => (s.w === cssW && s.h === cssH ? s : { w: cssW, h: cssH, aspect: r.width / r.height }));
      r.draw(p, view, 1, region, clip);
      latest.current.onRegion?.(zoom ? region : null);
      onHistogram?.(r.histogram());
    });
  };

  useEffect(() => {
    try { gl.current = new GLRenderer(canvas.current!); } catch (e) { setError((e as Error).message); }
    const ro = new ResizeObserver(() => paint());
    ro.observe(box.current!);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); gl.current?.dispose(); gl.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // new photo → load the preview
  useEffect(() => {
    setReady(false); setError("");
    preview.current = null; original.current = null;
    let cancelled = false;
    loadImage(fileUrl(photoId, "preview")).then((img) => {
      if (cancelled || !gl.current) return;
      preview.current = img;
      gl.current.setImage(img);
      setReady(true);
      paint();
    }).catch((e: Error) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [photoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // zoomed in → swap in the original so 100% really is 1 image pixel per screen pixel
  const wantHi = props.zoom && HI_RES_TYPES.has(mime);
  useEffect(() => {
    if (!ready || !gl.current) return;
    let cancelled = false;
    const useImg = (img: HTMLImageElement) => { if (!cancelled && gl.current) { gl.current.setImage(img); paint(); } };
    if (!wantHi) { if (preview.current) useImg(preview.current); return; }
    if (original.current?.id === photoId) { useImg(original.current.img); return; }
    loadImage(fileUrl(photoId, "original")).then((img) => {
      const p = preview.current;
      if (p && Math.abs(img.naturalWidth / img.naturalHeight - p.naturalWidth / p.naturalHeight) > 0.01) return; // orientation mismatch → keep preview
      original.current = { id: photoId, img };
      useImg(img);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [wantHi, ready, photoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready) paint(); }, [props.params, props.view, props.zoom, props.pan, props.clip, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── click toggles zoom, drag pans ──
  const down = (e: React.PointerEvent) => {
    if (!interactive) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false, pan: latest.current.pan };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current, r = gl.current;
    if (!d || !r) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 3) d.moved = true;
    const { zoom, params: p, view } = latest.current;
    if (!zoom || !d.moved) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const crop = view === "normal" ? p.crop : { w: 1, h: 1 };
    latest.current.onPan?.([clamp(d.pan[0] - (dx * dpr) / (r.width * crop.w), 0, 1), clamp(d.pan[1] - (dy * dpr) / (r.height * crop.h), 0, 1)]);
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const { zoom } = latest.current;
    if (zoom) { latest.current.onZoom?.(false); return; }
    const rect = canvas.current!.getBoundingClientRect();
    latest.current.onZoom?.(true, [clamp((e.clientX - rect.left) / rect.width, 0, 1), clamp((e.clientY - rect.top) / rect.height, 0, 1)]);
  };

  return (
    <div ref={box} className="flex-1 min-h-0 min-w-0 relative flex items-center justify-center overflow-hidden lr-stage"
      style={{ cursor: interactive ? (props.zoom ? "grab" : "zoom-in") : undefined }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <div className="relative" style={{ width: size.w || undefined, height: size.h || undefined }}>
        <canvas ref={canvas} className="block" />
        {ready && children?.(size)}
      </div>
      {!ready && !error && <div className="absolute text-lr-dim">Loading…</div>}
      {error && <div className="absolute text-red-400">{error}</div>}
      {label && <div className="absolute top-2 left-2 bg-black/60 px-2 py-0.5 rounded text-lr-hi pointer-events-none">{label}</div>}
    </div>
  );
}
