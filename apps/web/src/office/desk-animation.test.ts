import { describe, expect, it } from "vitest";
import { coffeeSip } from "./desk-animation.js";
import { activityPose } from "./activity-animation.js";

describe("desk coffee breaks", () => {
  it("occasionally lifts the cup, repeats and respects reduced motion", () => {
    const values = Array.from({ length: 300 }, (_, index) => coffeeSip("agent", index / 10, false));
    expect(values.filter((value) => value > 0).length).toBeGreaterThan(40);
    expect(values.filter((value) => value > 0).length).toBeLessThan(60);
    expect(Math.max(...values)).toBe(1);
    expect(coffeeSip("agent", 4, false)).toBeCloseTo(coffeeSip("agent", 34, false));
    expect(coffeeSip("agent", 24, true)).toBe(0);
    const time = values.findIndex((value) => value === 1) / 10;
    expect(activityPose("agent", "monitoring", time, false).right.y).toBeCloseTo(1.4);
  });
});
