import { describe, expect, it } from "vitest";
import { attentionCycleDuration, completionDuration, statusPose } from "./status-animation.js";

describe("status sequences", () => {
  it("celebrates through multiple phases for twelve seconds then settles", () => {
    expect(completionDuration).toBe(12);
    for (const time of [3, 6, 10, 11.5]) {
      expect(statusPose("completed", time, false).rightZ).not.toBe(0);
    }
    expect(statusPose("completed", 12, false)).toEqual(statusPose("completed", 30, false));
    expect(statusPose("completed", 12, false).rightZ).toBe(0);
  });
  it("repeats attention waves and scans until the status changes", () => {
    expect(statusPose("needs_attention", 2, false)).toEqual(
      statusPose("needs_attention", 2 + attentionCycleDuration, false),
    );
    expect(statusPose("needs_attention", 2, false)).not.toEqual(
      statusPose("needs_attention", 6, false),
    );
    expect(statusPose("needs_attention", 0, false).rightZ).toBeCloseTo(0);
  });
  it("keeps reduced motion static without body movement", () => {
    for (const status of ["completed", "needs_attention"] as const) {
      expect(statusPose(status, 0, true)).toEqual(statusPose(status, 20, true));
      expect(statusPose(status, 5, true).bodyY).toBe(0);
    }
  });
});
