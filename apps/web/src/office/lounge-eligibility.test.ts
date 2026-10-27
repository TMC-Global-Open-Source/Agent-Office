import { expect, it } from "vitest";
import {
  assignLoungeSeats,
  belongsInLounge,
  completedLoungeAt,
  loungeBayCount,
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
