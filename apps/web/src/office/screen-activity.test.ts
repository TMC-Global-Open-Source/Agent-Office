import { describe, expect, it, vi } from "vitest";
import { officeActivities } from "@agent-office/shared";
import { drawScreen, screenActivities } from "./screen-activity.js";

describe("monitor activities", () => {
  it("assigns a distinct display to every office activity", () => {
    expect(Object.keys(screenActivities).sort()).toEqual([...officeActivities].sort());
    expect(new Set(Object.values(screenActivities)).size).toBe(officeActivities.length);
  });
  it("draws each activity with finite on-screen geometry", () => {
    const calls: number[][] = [];
    const context = {
      fillRect: (...args: number[]) => calls.push(args),
      strokeRect: (...args: number[]) => calls.push(args),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    for (const activity of officeActivities) {
      for (const time of [0, 1.5, 12, 60]) drawScreen(context, activity, time);
    }
    expect(calls.length).toBeGreaterThan(100);
    for (const [x, y, width, height] of calls) {
      expect([x, y, width, height].every(Number.isFinite)).toBe(true);
      expect(x! + width!).toBeLessThanOrEqual(256);
      expect(y! + height!).toBeLessThanOrEqual(144);
    }
  });
});
