import { describe, expect, it } from "vitest";
import type { Agent } from "@agent-office/shared";
import {
  confettiPieces,
  confettiPosition,
  partyDuration,
  partyElapsed,
  partyPose,
} from "./party-animation.js";
import { belongsInLounge } from "./lounge-eligibility.js";

const start = Date.parse("2026-10-15T12:00:00Z");
const agent = {
  id: "agent-1",
  status: "idle",
  updatedAt: new Date(start).toISOString(),
  metadata: {
    pullRequest: { number: 7, state: "MERGED", celebrationAt: new Date(start).toISOString() },
  },
} as unknown as Agent;

describe("merge party", () => {
  it("runs for the party duration and keeps the agent out of the lounge", () => {
    expect(partyElapsed(agent, start - 1)).toBeNull();
    expect(partyElapsed(agent, start + 3000)).toBe(3);
    expect(partyElapsed(agent, start + partyDuration * 1000)).toBeNull();
    expect(partyElapsed({ ...agent, status: "offline" }, start + 1000)).toBeNull();
    expect(partyElapsed({ ...agent, metadata: {} }, start + 1000)).toBeNull();
    expect(belongsInLounge(agent, start + 1000)).toBe(false);
    expect(belongsInLounge(agent, start + partyDuration * 1000)).toBe(true);
  });

  it("jumps, waves, flosses and throws, then returns to rest", () => {
    expect(partyPose(0.4, false).bodyY).toBeGreaterThan(0.2);
    const wave = [3, 3.2, 3.4].map((time) => partyPose(time, false).rightZ);
    expect(Math.max(...wave)).toBeLessThan(-2);
    expect(new Set(wave.map((value) => value.toFixed(2))).size).toBeGreaterThan(1);
    const floss = partyPose(5.15, false);
    expect(Math.sign(floss.leftZ)).toBe(Math.sign(floss.rightZ));
    expect(Math.sign(floss.bodyZ)).toBe(-Math.sign(floss.leftZ));
    expect(partyPose(10.8, false).leftX).toBeLessThan(-2);
    const rest = partyPose(partyDuration, false);
    expect(Object.values(rest).every((value) => Math.abs(value) < 1e-9)).toBe(true);
    expect(partyPose(6, true)).toMatchObject({ leftZ: 2.5, rightZ: -2.5, bodyY: 0 });
  });

  it("throws deterministic confetti that lands on the floor", () => {
    const pieces = confettiPieces("agent-1:1");
    expect(pieces).toEqual(confettiPieces("agent-1:1"));
    expect(pieces).not.toEqual(confettiPieces("agent-2:1"));
    const piece = pieces[0]!;
    expect(confettiPosition(piece, 0.3)[1]).toBeGreaterThan(2);
    expect(confettiPosition(piece, 4)[1]).toBeCloseTo(0.02);
  });
});
