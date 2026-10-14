import { describe, expect, it } from "vitest";
import { loungePersonality, loungePose } from "./lounge-animation.js";

describe("couch relaxation", () => {
  it("uses the whole identity for stable, varied personalities and timing", () => {
    const personalities = ["local-a", "local-b", "local-c"].map(loungePersonality);
    expect(new Set(personalities.map(({ variant }) => variant)).size).toBe(3);
    expect(new Set(personalities.map(({ phase }) => phase)).size).toBe(3);
    expect(loungePersonality("local-a")).toEqual(personalities[0]);
  });

  it("animates reading, coffee, and stretching with bounded poses", () => {
    for (const id of ["local-a", "local-b", "local-c"]) {
      const poses = Array.from({ length: 60 }, (_, time) => loungePose(id, time, false));
      expect(new Set(poses.map(({ headY }) => headY)).size).toBeGreaterThan(1);
      for (const pose of poses) {
        expect(Math.abs(pose.bodyY)).toBeLessThanOrEqual(0.004);
        expect(Math.abs(pose.footX)).toBeLessThanOrEqual(0.045);
        expect(pose.rightArmX).toBeGreaterThanOrEqual(-2.3);
        expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("keeps every personality still when reduced motion is enabled", () => {
    for (const id of ["local-a", "local-b", "local-c"]) {
      expect(loungePose(id, 0, true)).toEqual(loungePose(id, 300, true));
      expect(loungePose(id, 10, true).bodyY).toBe(0);
      expect(loungePose(id, 10, true).footX).toBe(0);
    }
  });
});
