import { describe, expect, it } from "vitest";
import { typingPose } from "./typing-animation.js";

describe("keyboard typing", () => {
  it("keeps hands over the keyboard with pronounced alternating lifts and lateral travel", () => {
    const poses = Array.from({ length: 600 }, (_, frame) =>
      typingPose("local-a", frame / 60, false),
    );
    for (const pose of poses) {
      for (const hand of [pose.left, pose.right]) {
        // Avatar is at Y=.17 and Z=.5, facing the keyboard at Z=.13.
        expect(Math.abs(hand.x)).toBeLessThan(0.17);
        expect(0.5 - hand.z).toBeGreaterThanOrEqual(0.095);
        expect(0.5 - hand.z).toBeLessThanOrEqual(0.165);
        expect(hand.y + 0.17 - 0.0175).toBeGreaterThanOrEqual(0.89);
        expect(hand.y).toBeLessThanOrEqual(0.83);
      }
    }
    expect(poses.some((pose) => pose.left.y > pose.right.y)).toBe(true);
    expect(poses.some((pose) => pose.right.y > pose.left.y)).toBe(true);
    expect(poses.some((pose) => pose.left.y === 0.74 && pose.right.y === 0.74)).toBe(true);
    expect(Math.max(...poses.map((pose) => pose.left.y))).toBeGreaterThan(0.825);
    expect(
      Math.max(...poses.map((pose) => pose.left.x)) - Math.min(...poses.map((pose) => pose.left.x)),
    ).toBeGreaterThan(0.06);
    expect(new Set(poses.map((pose) => pose.headX)).size).toBeGreaterThan(100);
  });

  it("retains a static typing posture in reduced-motion mode", () => {
    expect(typingPose("local-a", 0, true)).toEqual(typingPose("local-a", 100, true));
  });
});
