import { describe, expect, it } from "vitest";
import {
  advanceWaterBreak,
  coolerStandingPosition,
  waterTravelDuration,
  waterVisitPosition,
  type WaterBreakState,
} from "./water-cooler.js";
import { livingRoomSeat } from "./LivingRoom.js";

const initial = (): WaterBreakState => ({ visit: null, nextAt: null, variants: {} });
const idle = new Map([
  ["a", 0],
  ["b", 7],
]);
const variant = () => 0;
const random = () => 0;

describe("occasional water cooler breaks", () => {
  it("waits, sends only one agent, drinks, returns, and chooses a different couch task", () => {
    let state = advanceWaterBreak(initial(), 0, idle, false, variant, random);
    expect(state.nextAt).toBe(20);
    expect(advanceWaterBreak(state, 19.99, idle, false, variant, random)).toBe(state);
    state = advanceWaterBreak(state, 20, idle, false, variant, random);
    expect(state.visit?.agentId).toBe("a");
    const duration = waterTravelDuration(0);
    expect(waterVisitPosition(state.visit!, 20)).toEqual([
      livingRoomSeat(0)[0],
      0,
      livingRoomSeat(0)[2],
    ]);
    expect(waterVisitPosition(state.visit!, 20 + duration)).toEqual(coolerStandingPosition);
    state = advanceWaterBreak(state, 20 + duration, idle, false, variant, random);
    expect(state.visit?.phase).toBe("drinking");
    state = advanceWaterBreak(state, 25 + duration, idle, false, variant, random);
    expect(state.visit?.phase).toBe("returning");
    expect(waterVisitPosition(state.visit!, 25 + duration)).toEqual(coolerStandingPosition);
    state = advanceWaterBreak(state, 25 + duration * 2 + 0.001, idle, false, variant, random);
    expect(state.visit).toBeNull();
    expect(state.variants.a).toBe(1);
    expect(state.nextAt).toBeGreaterThan(25 + duration * 2 + 29);
    state = advanceWaterBreak(state, state.nextAt!, idle, false, variant, random);
    const end = state.visit!.startedAt + state.visit!.duration;
    state = advanceWaterBreak(state, end, idle, false, variant, random);
    state = advanceWaterBreak(state, end + 5, idle, false, variant, random);
    state = advanceWaterBreak(state, end + 5 + duration + 0.001, idle, false, variant, random);
    expect(state.variants.a).toBe(2);
  });
  it("cancels on new work, roster removal, or reduced motion without changing the couch task", () => {
    for (const phase of ["outbound", "drinking", "returning"] as const) {
      const state: WaterBreakState = {
        visit: { agentId: "a", seatIndex: 0, phase, startedAt: 0, duration: 5 },
        nextAt: 0,
        variants: { a: 2 },
      };
      const resumed = advanceWaterBreak(state, 1, new Map([["b", 7]]), false, variant, random);
      expect(resumed.visit).toBeNull();
      expect(resumed.variants.a).toBe(2);
      expect(advanceWaterBreak(state, 1, idle, true, variant, random).visit).toBeNull();
      expect(advanceWaterBreak(state, 1, new Map(), false, variant, random).nextAt).toBeNull();
    }
  });
  it("varies the wait and selected visitor and travels at bounded speed across lounge bays", () => {
    const later = advanceWaterBreak(initial(), 0, idle, false, variant, () => 0.99);
    expect(later.nextAt).toBeCloseTo(44.75);
    expect(advanceWaterBreak(later, 45, idle, false, variant, () => 0.99).visit?.agentId).toBe("b");
    for (const seatIndex of [0, 7, 8, 31]) {
      const duration = waterTravelDuration(seatIndex);
      const visit = { agentId: "a", seatIndex, phase: "outbound" as const, startedAt: 0, duration };
      let previous = waterVisitPosition(visit, 0);
      for (let t = 0.1; t < duration; t += 0.1) {
        const point = waterVisitPosition(visit, t);
        expect(Math.hypot(point[0] - previous[0], point[2] - previous[2])).toBeLessThanOrEqual(
          0.150001,
        );
        previous = point;
      }
      expect(waterVisitPosition(visit, duration + 1)).toEqual(coolerStandingPosition);
    }
  });
});
