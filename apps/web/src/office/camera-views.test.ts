import { describe, expect, it } from "vitest";
import { officeViews } from "./camera-views.js";

describe("office camera views", () => {
  it("elevates front and side views 45 degrees above the floor", () => {
    for (const view of ["front", "left", "right"] as const) {
      const [x, y, z] = officeViews[view].position;
      expect(Math.atan2(y, Math.hypot(x, z))).toBeCloseTo(Math.PI / 4);
    }
  });
});
