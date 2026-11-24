import { expect, it } from "vitest";
import {
  assignLoungeSeats,
  belongsInLounge,
  completedLoungeAt,
  loungeBayCount,
  updateIdleGrace,
  idleDeskGraceMs,
} from "./lounge-eligibility.js";
import type { Agent } from "@agent-office/shared";

it.each([
  [0, 1],
  [1, 1],
  [8, 1],
  [9, 2],
  [16, 2],
  [17, 3],
])("provides %i active agents with %i lounge bays", (count, bays) =>
  expect(loungeBayCount(count)).toBe(bays),
);

it("reclaims seats in removed bays while preserving stable seats in the remaining lounge", () => {
  const previous = new Map([
    ["staying", 3],
    ["moving", 8],
    ["away", 0],
  ]);
  const assignments = assignLoungeSeats(previous, ["staying", "moving"], 8);
  expect([...assignments]).toEqual([
    ["staying", 3],
    ["moving", 0],
  ]);
  expect(assignLoungeSeats(previous, ["staying", "moving"], 9).get("moving")).toBe(8);
});

it("keeps an agent at the desk for 30 seconds after becoming idle and cancels on renewed work", () => {
  const working = { id: "agent", status: "working", metadata: {} } as Agent;
  const idle = { ...working, status: "idle" } as Agent;
  const initial = updateIdleGrace(new Map(), [working], 1000);
  const paused = updateIdleGrace(initial, [idle], 2000);
  const until = paused.get("agent")!.until;
  expect(until).toBe(2000 + idleDeskGraceMs);
  expect(belongsInLounge(idle, until! - 1, until)).toBe(false);
  expect(belongsInLounge(idle, until!, until)).toBe(true);
  expect(updateIdleGrace(paused, [idle], 10000).get("agent")!.until).toBe(until);
  const resumed = updateIdleGrace(paused, [working], 10000);
  expect(resumed.get("agent")!.until).toBeNull();
  expect(updateIdleGrace(resumed, [idle], 11000).get("agent")!.until).toBe(41000);
  expect(updateIdleGrace(resumed, [], 11000).size).toBe(0);
});

it("does not hold initially idle or returning offline agents at a desk", () => {
  const idle = { id: "agent", status: "idle", metadata: {} } as Agent;
  expect(updateIdleGrace(new Map(), [idle], 1000).get("agent")!.until).toBeNull();
  const offline = { ...idle, status: "offline" } as Agent;
  const initial = updateIdleGrace(new Map(), [offline], 1000);
  expect(updateIdleGrace(initial, [idle], 2000).get("agent")!.until).toBeNull();
});

it("moves completed sessions to the lounge after celebration without changing status", () => {
  const agent = {
    status: "completed",
    completedAt: "2026-10-14T12:00:00Z",
    updatedAt: "2026-10-14T12:00:05Z",
  } as Agent;
  const start = Date.parse(agent.completedAt!);
  expect(completedLoungeAt(agent)).toBe(start + 12000);
  expect(belongsInLounge(agent, start + 11999)).toBe(false);
  expect(belongsInLounge(agent, start + 12000)).toBe(true);
  expect(belongsInLounge(agent, start + 3600000)).toBe(true);
  expect(belongsInLounge({ ...agent, status: "working" }, start + 3600000)).toBe(false);
  expect(agent.status).toBe("completed");
});
