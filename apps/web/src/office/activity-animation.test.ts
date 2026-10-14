import { describe, expect, it } from "vitest";
import { officeActivities } from "@agent-office/shared";
import { activityPose } from "./activity-animation.js";
import { typingPose } from "./typing-animation.js";

describe("office activity poses", () => {
  it("preserves keyboard typing and uses distinct reading, monitoring and delegation poses", () => {
    expect(activityPose("agent", "typing", 2, false)).toEqual({
      ...typingPose("agent", 2, false),
      headY: 0,
    });
    const reading = activityPose("agent", "reading", 2, false);
    expect(reading.left.y).toBeGreaterThan(1);
    expect(reading.headX).toBeGreaterThan(0);
    expect(activityPose("agent", "monitoring", 2, false).left.y).toBeLessThan(1);
    expect(activityPose("agent", "delegating", 2, false).right.y).toBeGreaterThan(1.4);
  });
  it("keeps every reduced-motion activity static and finite", () => {
    for (const activity of officeActivities) {
      const pose = activityPose("agent", activity, 0, true);
      expect(activityPose("agent", activity, 20, true)).toEqual(pose);
      expect(Object.values(pose.left).every(Number.isFinite)).toBe(true);
      expect(Object.values(pose.right).every(Number.isFinite)).toBe(true);
    }
  });
});
