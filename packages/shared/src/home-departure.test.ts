import { expect, it } from "vitest";
import { homeDeparture, homeElapsed, homeTimeline, resumesFromHome } from "./home-departure.js";
import type { Agent } from "./model.js";

it("validates departure timestamps and preserves the full goodbye sequence", () => {
  const start = Date.parse("2026-10-19T00:00:00Z");
  const agent = { metadata: { homeDeparture: { startedAt: new Date(start).toISOString() } } };
  expect(homeDeparture(agent)).toBe(start);
  expect(homeElapsed(agent, start + 5500)).toBe(homeTimeline.coffee);
  expect(homeElapsed(agent, start + 12_500)).toBe(homeTimeline.gone);
  for (const value of [undefined, "bad", {}, { startedAt: "bad" }])
    expect(homeDeparture({ metadata: { homeDeparture: value } })).toBeNull();
  expect(homeTimeline.desk).toBeLessThan(homeTimeline.shutdown);
  expect(homeTimeline.shutdown).toBeLessThan(homeTimeline.coffee);
  expect(homeTimeline.coffee).toBeLessThan(homeTimeline.exit);
  expect(homeTimeline.exit).toBeLessThan(homeTimeline.gone);
});

it("halves travel time while retaining shutdown, pickup and smoke durations", () => {
  expect(homeTimeline.desk).toBe(5 / 2);
  expect(homeTimeline.exit - homeTimeline.coffee).toBe(10 / 2);
  expect(homeTimeline.shutdown - homeTimeline.desk).toBe(2);
  expect(homeTimeline.coffee - homeTimeline.shutdown).toBe(1);
  expect(homeTimeline.gone - homeTimeline.exit).toBe(2);
});

it("only returns home agents on fresh work, not status polling or stale work", () => {
  const start = Date.now();
  const agent = {
    status: "working",
    lastActivityAt: new Date(start + 1).toISOString(),
  } satisfies Pick<Agent, "status" | "lastActivityAt">;
  expect(resumesFromHome(agent, start)).toBe(true);
  expect(resumesFromHome({ ...agent, lastActivityAt: new Date(start).toISOString() }, start)).toBe(
    false,
  );
  expect(resumesFromHome({ ...agent, lastActivityAt: null }, start)).toBe(false);
  for (const status of ["idle", "completed", "offline", "needs_attention"] as const)
    expect(resumesFromHome({ ...agent, status }, start)).toBe(false);
});
