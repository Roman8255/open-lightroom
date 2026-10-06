import { describe, expect, it } from "vitest";
import { curveLut } from "./curve";
import { defaultParams, isDefault } from "./params";

describe("curveLut", () => {
  it("identity curve is linear", () => {
    const l = curveLut([[0, 0], [1, 1]]);
    expect(l[0]).toBeCloseTo(0);
    expect(l[128]).toBeCloseTo(128 / 255, 2);
    expect(l[255]).toBeCloseTo(1);
  });
  it("is monotone for an S curve", () => {
    const l = curveLut([[0, 0], [0.25, 0.15], [0.75, 0.85], [1, 1]]);
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThanOrEqual(l[i - 1] - 1e-6);
  });
});

describe("params", () => {
  it("detects defaults", () => {
    expect(isDefault(defaultParams())).toBe(true);
    expect(isDefault({ ...defaultParams(), exposure: 1 })).toBe(false);
  });
});
