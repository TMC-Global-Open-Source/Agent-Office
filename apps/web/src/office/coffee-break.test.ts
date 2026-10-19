import { describe, expect, it } from "vitest";
import {
  advanceWaterBreak,
  coffeePosition,
  coffeeStation,
  waterRoute,
  waterTravelDuration,
  waterVisitPosition,
  type WaterBreakState,
} from "./water-cooler.js";
import { livingRoomSeat } from "./LivingRoom.js";
import { crossesFurniture, homeObstacles } from "./home-route.js";
import { couchRiseDuration } from "./couch-motion.js";

const initial = (): WaterBreakState => ({ visit: null, nextAt: null, variants: {} });
const seats = new Map([
  ["a", 0],
  ["b", 7],
]);
const advance = (state: WaterBreakState, now: number, available = seats, reduced = false) =>
  advanceWaterBreak(
    state,
    now,
    available,
    reduced,
    () => 0,
    () => 0,
    coffeeStation,
  );

describe("coffee breaks", () => {
  it("places the coffee station right of the couch and uses clear aisle routes", () => {
    expect(coffeePosition[0]).toBeGreaterThan(livingRoomSeat(7)[0] + 0.8);
    const obstacles = homeObstacles([], 32);
    for (const index of [0, 3, 4, 7, 8, 31]) {
      const route = waterRoute(index, coffeeStation);
      // The first segment exits the occupied couch; all following segments use clear aisles.
      for (let i = 2; i < route.length; i++) {
        const from = route[i - 1]!;
        const to = route[i]!;
        expect(
          obstacles.some((rect) => crossesFurniture([from[0], from[2]], [to[0], to[2]], rect)),
        ).toBe(false);
      }
      const duration = waterTravelDuration(index, coffeeStation);
      const visit = {
        agentId: "a",
        seatIndex: index,
        phase: "outbound" as const,
        startedAt: 0,
        duration,
      };
      expect(waterVisitPosition(visit, couchRiseDuration / 2, coffeeStation)).toEqual([
        route[0]![0],
        0,
        route[0]![2],
      ]);
      expect(waterVisitPosition(visit, duration, coffeeStation)).toEqual(coffeeStation.standing);
      let previous = waterVisitPosition(visit, 0, coffeeStation);
      for (let t = 0.1; t < duration; t += 0.1) {
        const position = waterVisitPosition(visit, t, coffeeStation);
        expect(
          Math.hypot(position[0] - previous[0], position[2] - previous[2]),
        ).toBeLessThanOrEqual(0.150001);
        previous = position;
      }
    }
  });

  it("waits, brews one mug, returns, and switches to sipping coffee", () => {
    let state = advance(initial(), 0);
    expect(state.nextAt).toBe(25);
    expect(advance(state, 24)).toBe(state);
    state = advance(state, 25);
    expect(state.visit).toMatchObject({ agentId: "a", phase: "outbound" });
    const duration = state.visit!.duration;
    state = advance(state, 25 + duration);
    expect(state.visit).toMatchObject({ phase: "drinking", duration: 6 });
    expect(waterVisitPosition(state.visit!, 25 + duration + 2, coffeeStation)).toEqual(
      coffeeStation.standing,
    );
    state = advance(state, 31 + duration);
    expect(state.visit?.phase).toBe("returning");
    state = advance(state, 31 + duration * 2 + 0.01);
    expect(state.visit).toBeNull();
    expect(state.variants.a).toBe(1);
    expect(state.nextAt).toBeCloseTo(76 + duration * 2 + 0.01);
  });

  it("excludes busy agents and cancels when work resumes or motion is reduced", () => {
    let state = advance({ ...initial(), nextAt: 0 }, 0, new Map([["b", 7]]));
    expect(state.visit?.agentId).toBe("b");
    for (const phase of ["outbound", "drinking", "returning"] as const) {
      state = { ...state, visit: { ...state.visit!, phase } };
      expect(advance(state, 1, new Map([["a", 0]])).visit).toBeNull();
      expect(advance(state, 1, seats, true).visit).toBeNull();
      expect(advance(state, 1, new Map()).visit).toBeNull();
    }
    expect(advance(initial(), 0, seats, true).nextAt).toBeNull();
  });
});
