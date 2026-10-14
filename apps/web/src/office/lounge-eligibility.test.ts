import { expect, it } from "vitest";
import { belongsInLounge, completedLoungeAt } from "./lounge-eligibility.js";
import type { Agent } from "@agent-office/shared";

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
