import { describe, expect, it } from "vitest";
import type { Hist } from "../../components/Histogram";
import { defaultParams } from "../../gl/params";
import { autoTone } from "./auto";

const peak = (at: number): Hist => {
  const mk = () => { const a = new Uint32Array(256); a[at] = 1000; return a; };
  return { r: mk(), g: mk(), b: mk() };
};

describe("autoTone", () => {
  it("brightens dark photos", () => { expect(autoTone(peak(40), defaultParams()).exposure).toBeGreaterThan(0); });
  it("darkens bright photos", () => { expect(autoTone(peak(220), defaultParams()).exposure).toBeLessThan(0); });
  it("leaves a mid-gray median roughly alone", () => { expect(Math.abs(autoTone(peak(118), defaultParams()).exposure)).toBeLessThan(0.15); });
});
