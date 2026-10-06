import { useEffect, useState } from "react";
import { fileUrl } from "../api/client";
import { Histogram, type Hist } from "./Histogram";

/** Histogram of a photo's thumbnail (Library module; Develop uses the live GPU histogram). */
export function ThumbHistogram({ photoId }: { photoId: number | null }) {
  const [hist, setHist] = useState<Hist | null>(null);
  useEffect(() => {
    setHist(null);
    if (photoId === null) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "use-credentials";
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = Math.max(1, Math.round((160 * img.naturalHeight) / img.naturalWidth));
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
      for (let i = 0; i < px.length; i += 4) { r[px[i]]++; g[px[i + 1]]++; b[px[i + 2]]++; }
      setHist({ r, g, b });
    };
    img.src = fileUrl(photoId, "thumb");
    return () => { cancelled = true; };
  }, [photoId]);
  return <Histogram data={hist} />;
}
