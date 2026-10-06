import { describe, expect, it } from "vitest";
import { maskTextureData, rasterMask } from "./masks";
import { calMatrix, defaultParams, isDefault, newMask, zoneTint } from "./params";
import { dragCrop, fitCropToRatio } from "../modules/develop/Overlays";

describe("rasterMask (mirrors backend raster_mask)", () => {
  it("linear: full at the start line, zero at the end", () => {
    const v = rasterMask(newMask("linear", { x1: 0.5, y1: 0, x2: 0.5, y2: 0.5 }), 20, 20);
    expect(v[1 * 20 + 10]).toBeGreaterThan(0.9);
    expect(v[15 * 20 + 10]).toBe(0);
  });
  it("radial: inside / outside / invert", () => {
    const m = newMask("radial", { rx: 0.2, ry: 0.2, feather: 20 });
    expect(rasterMask(m, 50, 50)[25 * 50 + 25]).toBeGreaterThan(0.99);
    expect(rasterMask(m, 50, 50)[0]).toBeLessThan(0.01);
    expect(rasterMask({ ...m, invert: true }, 50, 50)[25 * 50 + 25]).toBeLessThan(0.01);
  });
  it("brush paints and erases", () => {
    const stroke = { size: 0.1, feather: 0.5, erase: false, points: [[0.2, 0.5], [0.8, 0.5]] as [number, number][] };
    const painted = rasterMask(newMask("brush", { strokes: [stroke] }), 100, 100);
    expect(painted[50 * 100 + 50]).toBeGreaterThan(0.9);
    expect(painted[5 * 100 + 5]).toBe(0);
    const erased = rasterMask(newMask("brush", { strokes: [stroke, { size: 0.05, feather: 0, erase: true, points: [[0.5, 0.5]] }] }), 100, 100);
    expect(erased[50 * 100 + 50]).toBeLessThan(0.1);
    expect(erased[50 * 100 + 25]).toBeGreaterThan(0.5);
  });
  it("packs up to 4 masks into RGBA channels and skips disabled ones", () => {
    const a = newMask("radial", { rx: 0.4, ry: 0.4 }), b = { ...a, enabled: false };
    const { data, w, h } = maskTextureData([a, b], 2000, 1000);
    const mid = ((h >> 1) * w + (w >> 1)) * 4;
    expect(data[mid]).toBeGreaterThan(200);
    expect(data[mid + 1]).toBe(0);
  });
});

describe("params helpers", () => {
  it("calibration is identity by default and zone tint is neutral without saturation", () => {
    const m = calMatrix(defaultParams().cal);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(m[i]).toBeCloseTo(v, 5));
    zoneTint({ hue: 120, sat: 0, lum: 0 }).forEach((v) => expect(Math.abs(v)).toBe(0));
    expect(isDefault({ ...defaultParams(), masks: [newMask("linear")] })).toBe(false);
  });
});

describe("crop dragging", () => {
  const start = { x: 0.2, y: 0.2, w: 0.5, h: 0.5, angle: 0 };
  it("free corner drag resizes", () => {
    const c = dragCrop(start, "se", [0.9, 0.8], [0.2, 0.1], null);
    expect(c.w).toBeCloseTo(0.7); expect(c.h).toBeCloseTo(0.6);
  });
  it("locked ratio is preserved and stays in bounds", () => {
    const c = dragCrop(start, "se", [1, 1], [0.5, 0.5], 1.5);
    expect(c.w / c.h).toBeCloseTo(1.5);
    expect(c.x + c.w).toBeLessThanOrEqual(1.0001); expect(c.y + c.h).toBeLessThanOrEqual(1.0001);
    const e = dragCrop(start, "e", [0.9, 0.45], [0.2, 0], 1);
    expect(e.w / e.h).toBeCloseTo(1);
  });
  it("move is clamped and fit-to-ratio keeps the center", () => {
    expect(dragCrop(start, "move", [0, 0], [5, -5], null)).toMatchObject({ x: 0.5, y: 0 });
    const f = fitCropToRatio(start, 2);
    expect(f.w / f.h).toBeCloseTo(2);
    expect(f.x + f.w / 2).toBeCloseTo(0.45);
  });
});
