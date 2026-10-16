import { describe, expect, it } from "vitest";
import {
  advanceGameRoom,
  arcadeInput,
  gameStandingPositions,
  gameTravelDuration,
  gameVisitPosition,
  gameVisitors,
  initialGameRoom,
  pinballFlips,
  type GameRoomState,
} from "./game-room.js";
import { livingRoomSeat } from "./LivingRoom.js";

const idle = new Map([
  ["a", 0],
  ["b", 5],
  ["c", 9],
]);
const random = () => 0;

describe("arcade and pinball breaks", () => {
  it("waits, walks over, plays, walks back and rests before the next game", () => {
    let state = advanceGameRoom(initialGameRoom(), 0, idle, false, new Set(), random);
    expect(state.nextAt).toEqual({ arcade: 12, pinball: 18 });
    expect(advanceGameRoom(state, 11.9, idle, false, new Set(), random)).toBe(state);
    state = advanceGameRoom(state, 12, idle, false, new Set(), random);
    const visit = state.visits.arcade!;
    expect(visit).toMatchObject({ agentId: "a", machine: "arcade", phase: "outbound" });
    const duration = gameTravelDuration(0, "arcade");
    expect(gameVisitPosition(visit, 12)).toEqual([livingRoomSeat(0)[0], 0, livingRoomSeat(0)[2]]);
    expect(gameVisitPosition(visit, 12 + duration)).toEqual(gameStandingPositions.arcade);
    state = advanceGameRoom(state, 12 + duration, idle, false, new Set(), random);
    expect(state.visits.arcade).toMatchObject({ phase: "playing", duration: 14 });
    expect(gameVisitPosition(state.visits.arcade!, 20 + duration)).toEqual(
      gameStandingPositions.arcade,
    );
    state = advanceGameRoom(state, 26 + duration, idle, false, new Set(), random);
    expect(state.visits.arcade?.phase).toBe("returning");
    state = advanceGameRoom(state, 26 + duration * 2 + 0.001, idle, false, new Set(), random);
    expect(state.visits.arcade).toBeNull();
    expect(state.nextAt.arcade).toBeGreaterThan(26 + duration * 2 + 34);
  });

  it("gives each machine a different player and skips agents on a water break", () => {
    let state: GameRoomState = {
      visits: { arcade: null, pinball: null },
      nextAt: { arcade: 1, pinball: 1 },
    };
    state = advanceGameRoom(state, 1, idle, false, new Set(["a"]), random);
    expect(state.visits.arcade?.agentId).toBe("b");
    expect(state.visits.pinball?.agentId).toBe("c");
    expect(state.visits.pinball?.machine).toBe("pinball");
    expect(gameVisitors(state)).toEqual(new Set(["b", "c"]));
    const crowded = advanceGameRoom(
      { visits: { arcade: null, pinball: null }, nextAt: { arcade: 1, pinball: 1 } },
      1,
      new Map([["a", 0]]),
      false,
      new Set(["a"]),
      random,
    );
    expect(crowded.visits.arcade).toBeNull();
    expect(crowded.nextAt.arcade).toBe(11);
  });

  it("cancels when the player gets work, and stops entirely under reduced motion", () => {
    const state: GameRoomState = {
      visits: {
        arcade: {
          agentId: "a",
          seatIndex: 0,
          machine: "arcade",
          phase: "playing",
          startedAt: 0,
          duration: 20,
        },
        pinball: null,
      },
      nextAt: { arcade: null, pinball: 50 },
    };
    const resumed = advanceGameRoom(state, 2, new Map([["b", 5]]), false, new Set(), random);
    expect(resumed.visits.arcade).toBeNull();
    expect(resumed.nextAt.arcade).toBe(22);
    expect(advanceGameRoom(state, 2, idle, true)).toEqual(initialGameRoom());
    expect(advanceGameRoom(initialGameRoom(), 2, idle, true)).toEqual(initialGameRoom());
  });

  it("walks at a bounded speed from every lounge bay to both machines", () => {
    for (const machine of ["arcade", "pinball"] as const) {
      for (const seatIndex of [0, 7, 8, 31]) {
        const duration = gameTravelDuration(seatIndex, machine);
        const visit = { agentId: "a", seatIndex, machine, phase: "returning" as const };
        let previous = gameVisitPosition({ ...visit, startedAt: 0, duration }, 0);
        expect(previous).toEqual(gameStandingPositions[machine]);
        for (let t = 0.1; t < duration; t += 0.1) {
          const point = gameVisitPosition({ ...visit, startedAt: 0, duration }, t);
          expect(Math.hypot(point[0] - previous[0], point[2] - previous[2])).toBeLessThanOrEqual(
            0.150001,
          );
          previous = point;
        }
      }
    }
  });

  it("drives flippers and joystick from bounded, repeating input", () => {
    const flips = Array.from({ length: 200 }, (_, i) => pinballFlips(i * 0.05));
    expect(flips.some((flip) => flip.left > 0.5)).toBe(true);
    expect(flips.some((flip) => flip.right > 0.5)).toBe(true);
    expect(flips.every((flip) => flip.left >= 0 && flip.left <= 1)).toBe(true);
    const inputs = Array.from({ length: 200 }, (_, i) => arcadeInput(i * 0.05));
    expect(inputs.every((input) => Math.abs(input.stickX) <= 1)).toBe(true);
    expect(new Set(inputs.map((input) => input.button))).toEqual(new Set([0, 1]));
  });
});
