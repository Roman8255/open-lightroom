import { type Hist } from "../../components/Histogram";
import { defaultParams } from "../../gl/params";
import type { View } from "../../gl/renderer";
import { useDevelop } from "../../store/develop";
import { GLPane } from "./GLPane";
import { CropOverlay, EyeOverlay, MaskOverlay, SpotOverlay } from "./Overlays";

export function DevelopCanvas({ photoId, mime, onHistogram }: { photoId: number; mime: string; onHistogram: (h: Hist) => void }) {
  const { params, before, tool, zoom, pan, compare, clip, setZoom, setPan, setRegion } = useDevelop();
  const view: View = tool === "crop" ? "crop" : tool ? "local" : "normal";
  const common = { photoId, mime, zoom: false, pan, clip, interactive: false } as const;

  if (compare) {
    // Y: before | after (Alt+Y: top / bottom). Before keeps the current crop so both frames line up.
    const beforeParams = { ...defaultParams(), crop: params.crop };
    return (
      <div className={`flex-1 min-h-0 flex ${compare === "lr" ? "flex-row" : "flex-col"} gap-px bg-black`}>
        <GLPane {...common} params={beforeParams} view="normal" label="Before" />
        <GLPane {...common} params={params} view="normal" label="After" onHistogram={onHistogram} />
      </div>
    );
  }

  const imgParams = before ? defaultParams() : params;
  return (
    <div className="flex-1 min-h-0 flex relative">
      <GLPane photoId={photoId} mime={mime} params={imgParams} view={before ? "normal" : view} zoom={zoom && !tool && !before} pan={pan} clip={clip}
        interactive={!tool && !before} onHistogram={onHistogram} onZoom={setZoom} onPan={setPan} onRegion={setRegion}
        label={before ? "Before" : undefined}>
        {(s) => (
          <>
            {tool === "crop" && <CropOverlay w={s.w} h={s.h} imgAspect={s.aspect} />}
            {tool === "spot" && <SpotOverlay w={s.w} h={s.h} imgAspect={s.aspect} />}
            {tool === "redeye" && <EyeOverlay w={s.w} h={s.h} imgAspect={s.aspect} />}
            {(tool === "linear" || tool === "radial" || tool === "brush") && <MaskOverlay w={s.w} h={s.h} imgAspect={s.aspect} />}
          </>
        )}
      </GLPane>
      {zoom && !tool && <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-lr-dim pointer-events-none">100% · drag to pan · Space to fit</div>}
      {tool && tool !== "crop" && <div className="absolute top-2 right-2 bg-black/60 px-2 py-0.5 rounded text-lr-dim pointer-events-none">Editing view (geometry preview off)</div>}
    </div>
  );
}
