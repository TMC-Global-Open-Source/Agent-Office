import { describe, expect, it } from "vitest";
import {
  advanceCouch,
  couchPose,
  couchRiseDuration,
  couchSitDuration,
  turnToward,
} from "./couch-motion.js";
import { gameTravelDuration, gameVisitPosition } from "./game-room.js";
import { waterTravelDuration, waterVisitPosition } from "./water-cooler.js";
import { livingRoomSeat } from "./LivingRoom.js";

describe("couch transitions", () => {
  it("takes time to rise and settle, with a forward lean between stable endpoints", () => {
    expect(advanceCouch(1, false, couchRiseDuration / 2, false)).toBeCloseTo(0.5);
    expect(advanceCouch(0, true, couchSitDuration / 2, false)).toBeCloseTo(0.5);
    expect(advanceCouch(1, false, couchRiseDuration, false)).toBe(0);
    expect(advanceCouch(0, true, couchSitDuration, false)).toBe(1);
    expect(couchPose(0)).toEqual({ blend: 0, lean: 0 });
    expect(couchPose(1).blend).toBe(1);
    expect(couchPose(1).lean).toBeCloseTo(0);
    expect(couchPose(0.5)).toEqual({ blend: 0.5, lean: 0.4 });
    expect(couchPose(0.01).blend).toBeLessThan(0.001);
    expect(couchPose(0.99).blend).toBeGreaterThan(0.999);
  });

  it("reverses from the current pose without snapping and honors reduced motion", () => {
    const halfSeated = advanceCouch(0, true, 0.5, false);
    const rising = advanceCouch(halfSeated, false, 0.1, false);
    expect(rising).toBeGreaterThan(0);
    expect(rising).toBeLessThan(halfSeated);
    expect(advanceCouch(rising, true, 0, false)).toBe(rising);
    expect(advanceCouch(rising, false, 0, true)).toBe(0);
    expect(advanceCouch(rising, true, 0, true)).toBe(1);
    expect(advanceCouch(0.5, false, -1, false)).toBe(0.5);
  });

  it("turns by the shortest arc instead of spinning around at the couch", () => {
    const current = Math.PI - 0.05;
    const target = -Math.PI + 0.05;
    const next = turnToward(current, target, 0.1);
    expect(next).toBeGreaterThan(current);
    expect(next - current).toBeLessThan(0.1);
    expect(turnToward(0, Math.PI, 0)).toBe(0);
  });

  it("reserves time to stand before walking to water or games, and to settle on return", () => {
    for (const seatIndex of [0, 7, 8, 31]) {
      const [x, , z] = livingRoomSeat(seatIndex);
      const trips = [
        {
          duration: waterTravelDuration(seatIndex),
          position: (phase: "outbound" | "returning", time: number) =>
            waterVisitPosition(
              {
                agentId: "a",
                seatIndex,
                phase,
                startedAt: 0,
                duration: waterTravelDuration(seatIndex),
              },
              time,
            ),
        },
        ...(["arcade", "pinball"] as const).map((machine) => ({
          duration: gameTravelDuration(seatIndex, machine),
          position: (phase: "outbound" | "returning", time: number) =>
            gameVisitPosition(
              {
                agentId: "a",
                seatIndex,
                machine,
                phase,
                startedAt: 0,
                duration: gameTravelDuration(seatIndex, machine),
              },
              time,
            ),
        })),
      ];
      for (const trip of trips) {
        expect(trip.position("outbound", couchRiseDuration / 2)).toEqual([x, 0, z]);
        expect(trip.position("outbound", couchRiseDuration)).toEqual([x, 0, z]);
        expect(trip.position("outbound", couchRiseDuration + 0.1)[2]).toBeCloseTo(z + 0.15);
        expect(trip.position("returning", trip.duration - couchRiseDuration + 0.01)).toEqual([
          x,
          0,
          z,
        ]);
        expect(trip.position("returning", trip.duration)).toEqual([x, 0, z]);
      }
    }
  });
});
