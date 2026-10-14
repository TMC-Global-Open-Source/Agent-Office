import { describe, expect, it } from "vitest";
import type { AgentState } from "@agent-office/shared";
import {
  advanceJanitor,
  createJanitorEncounter,
  everyoneIdle,
  janitorActions,
  janitorPose,
} from "./janitor-animation.js";

function tick(
  encounter: ReturnType<typeof createJanitorEncounter>,
  seconds: number,
  idle = true,
  random = () => 0,
) {
  for (let frame = 0; frame < seconds * 60; frame++)
    advanceJanitor(encounter, 1 / 60, idle, random);
}

describe("janitor encounters", () => {
  it("requires a nonempty, entirely idle roster, not just the visible idle agents", () => {
    expect(everyoneIdle([])).toBe(false);
    expect(everyoneIdle([{ status: "idle" }, { status: "idle" }])).toBe(true);
    const otherStates: AgentState[] = [
      "working",
      "queued",
      "spawning",
      "completed",
      "failed",
      "offline",
      "needs_attention",
    ];
    for (const status of otherStates) {
      expect(everyoneIdle([{ status: "idle" }, { status }])).toBe(false);
    }
  });

  it("waits, enters, performs one routine, exits, and observes a cooldown", () => {
    const encounter = createJanitorEncounter();
    tick(encounter, 9);
    expect(encounter.phase).toBe("waiting");
    tick(encounter, 2);
    expect(encounter.phase).toBe("entering");
    tick(encounter, 3);
    expect(encounter.phase).toBe("performing");
    tick(encounter, 8);
    expect(encounter.phase).toBe("leaving");
    tick(encounter, 3);
    expect(encounter.phase).toBe("waiting");
    expect(encounter.delay).toBe(45);
    tick(encounter, 44);
    expect(encounter.phase).toBe("waiting");
    tick(encounter, 2);
    expect(encounter.phase).toBe("entering");
    expect(encounter.action).toBe(1);
  });

  it("cancels the wait and leaves promptly when work resumes", () => {
    const waiting = createJanitorEncounter();
    tick(waiting, 9);
    tick(waiting, 20, false);
    expect(waiting.elapsed).toBe(0);
    expect(waiting.delay).toBe(0);
    for (const phase of ["entering", "performing"] as const) {
      const encounter = { phase, elapsed: 1, delay: 10, action: 2 };
      advanceJanitor(encounter, 1 / 60, false);
      expect(encounter.phase).toBe("leaving");
      tick(encounter, 4, false);
      expect(encounter.phase).toBe("waiting");
    }
  });

  it("bounds random delays and can select each of the 12 routines", () => {
    const actions = new Set<number>();
    for (let index = 0; index < 12; index++) {
      const encounter = createJanitorEncounter();
      const random = () => (index + 0.5) / 12;
      advanceJanitor(encounter, 1 / 60, true, random);
      expect(encounter.delay).toBeGreaterThanOrEqual(10);
      expect(encounter.delay).toBeLessThan(25);
      tick(encounter, encounter.delay + 0.1, true, random);
      actions.add(encounter.action);
    }
    expect(actions.size).toBe(janitorActions.length);
    expect(actions.size).toBe(12);
  });

  it("has 12 distinct finite routines that return to neutral without residual transforms", () => {
    const routines = new Set<string>();
    for (let action = 0; action < 12; action++) {
      const poses = [0, 1, 2, 3, 4, 5, 6, 7].map((time) => janitorPose(action, time, false));
      expect(poses.every((pose) => Object.values(pose).every(Number.isFinite))).toBe(true);
      routines.add(JSON.stringify(poses));
      expect(janitorPose(action, 2, true)).toEqual(janitorPose(-1, 0, true));
      expect(janitorPose(action, 7, true)).toEqual(janitorPose(-1, 0, true));
    }
    expect(routines.size).toBe(12);
    expect(janitorPose(-1, 3, false).lean).toBe(0);
  });
});
