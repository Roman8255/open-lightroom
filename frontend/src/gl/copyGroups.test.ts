import { describe, expect, it } from "vitest";
import { buildBody } from "../components/ExportDialog";
import type { ExportState } from "../components/ExportDialog";
import { allItems, applySettings, defaultCopySelection, pickSettings } from "./copyGroups";
import { defaultParams, newMask } from "./params";

describe("copy settings", () => {
  const src = { ...defaultParams(), exposure: 1.2, contrast: 30, temperature: 15, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5, angle: 3 }, masks: [newMask("linear")] };

  it("defaults mirror Lightroom: crop, spots and red eye are off", () => {
    const sel = defaultCopySelection();
    expect(sel.crop).toBe(false); expect(sel.spots).toBe(false); expect(sel.red_eyes).toBe(false);
    expect(sel.exposure).toBe(true); expect(sel.masks).toBe(true);
  });
  it("only the checked settings are copied and pasted", () => {
    const clip = pickSettings(src, { ...Object.fromEntries(allItems().map((i) => [i.id, false])), exposure: true, wb: true });
    expect(Object.keys(clip.values).sort()).toEqual(["exposure", "temperature", "tint"]);
    const target = { ...defaultParams(), contrast: -10, exposure: -1 };
    const out = applySettings(target, clip);
    expect(out.exposure).toBe(1.2); expect(out.temperature).toBe(15); expect(out.contrast).toBe(-10);
    expect(out.crop).toEqual(target.crop);
  });
  it("copies are deep (later edits to the source do not leak)", () => {
    const clip = pickSettings(src, defaultCopySelection());
    src.masks[0].adj.exposure = 4;
    expect((clip.values.masks as typeof src.masks)[0].adj.exposure).toBe(0);
  });
});

describe("export request", () => {
  const base: ExportState = {
    format: "jpeg", quality: 80, limitOn: true, limitKb: 300, resizeMode: "long", width: 1, height: 1, longEdge: 1600, shortEdge: 1, megapixels: 4, percent: 100,
    noEnlarge: true, ppi: 240, sharpenTarget: "screen", sharpenAmount: "low", metadata: "copyright", removeLocation: true, copyright: " © me ",
    wmOn: true, wmText: "wm", wmSize: 5, wmOpacity: 50, wmPos: "br", template: "custom_seq", customText: "Trip", startNumber: 3,
  };
  it("maps dialog state to the API body", () => {
    const b = buildBody(base, [4, 5]);
    expect(b.photo_ids).toEqual([4, 5]);
    expect(b.settings).toMatchObject({ format: "jpeg", limit_kb: 300, ppi: 240, copyright: "© me", sharpen: { target: "screen", amount: "low" } });
    expect(b.settings.resize).toMatchObject({ mode: "long", long_edge: 1600, no_enlarge: true });
    expect(b.settings.watermark).toEqual({ text: "wm", size_pct: 5, opacity: 50, position: "br" });
    expect(b.naming).toEqual({ template: "custom_seq", custom_text: "Trip", start_number: 3 });
  });
  it("drops file-size limit for lossless formats and empty watermark", () => {
    const b = buildBody({ ...base, format: "png", wmText: "  " }, [1]);
    expect(b.settings.limit_kb).toBeNull(); expect(b.settings.watermark).toBeNull();
  });
});
