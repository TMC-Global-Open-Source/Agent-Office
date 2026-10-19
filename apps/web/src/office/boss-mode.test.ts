import { expect, it, vi } from "vitest";
import { fireEvent, renderHook } from "@testing-library/react";
import type { Agent } from "@agent-office/shared";
import { bossActive, bossDurationMs, bossEligible, bossPose } from "./boss-mode.js";
import { pushSecretKey, useSecretParty } from "./secret-party.js";

it("recognises boss case-insensitively and resets after each trigger", () => {
  let buffer: string[] = [];
  const actions = [..."BoSSboss"].flatMap((key) => {
    const result = pushSecretKey(buffer, key);
    buffer = result.buffer;
    return result.action ? [result.action] : [];
  });
  expect(actions).toEqual(["boss", "boss"]);
});

it("routes the keyboard shortcuts and ignores forms, repeats and modifiers", () => {
  const party = vi.fn();
  const boss = vi.fn();
  const { unmount } = renderHook(() => useSecretParty(party, boss));
  const type = (target: HTMLElement | Window, text: string, extra = {}) => {
    for (const key of text) fireEvent.keyDown(target, { key, ...extra });
  };
  const input = document.createElement("input");
  document.body.append(input);
  type(input, "boss");
  type(window, "boss", { ctrlKey: true });
  type(window, "boss", { repeat: true });
  type(window, "boss", { isComposing: true });
  expect(boss).not.toHaveBeenCalled();
  type(window, "bo");
  type(input, "s");
  type(window, "ss");
  expect(boss).not.toHaveBeenCalled();
  type(window, "boss");
  type(window, "party");
  expect(boss).toHaveBeenCalledTimes(1);
  expect(party).toHaveBeenCalledTimes(1);
  unmount();
  type(window, "boss");
  expect(boss).toHaveBeenCalledTimes(1);
  input.remove();
});

it("ends at exactly 15 seconds and never overrides real work or offline status", () => {
  const start = Date.parse("2026-10-16T14:00:00Z");
  const agent = {
    status: "idle",
    metadata: { bossAt: new Date(start).toISOString() },
  } satisfies Pick<Agent, "status" | "metadata">;
  expect(bossDurationMs).toBe(15_000);
  expect(bossActive(agent, start - 1)).toBe(false);
  expect(bossActive(agent, start)).toBe(true);
  expect(bossActive(agent, start + 14_999)).toBe(true);
  expect(bossActive(agent, start + 15_000)).toBe(false);
  expect(bossActive({ ...agent, status: "completed" }, start + 1000)).toBe(true);
  for (const status of ["working", "offline", "needs_attention"] as const)
    expect(bossActive({ ...agent, status }, start + 1000)).toBe(false);
  expect(bossActive({ ...agent, metadata: { bossAt: "invalid" } }, start)).toBe(false);
  expect(bossActive({ ...agent, metadata: {} }, start)).toBe(false);
});

it("recruits completed lounge agents just like the party shortcut", () => {
  const now = Date.parse("2026-10-16T14:00:00Z");
  const agent = {
    status: "completed",
    completedAt: new Date(now - 60_000).toISOString(),
    updatedAt: new Date(now - 60_000).toISOString(),
    metadata: {},
  };
  // This helper only reads the lounge eligibility fields.
  expect(bossEligible(agent as Agent, now)).toBe(true);
  expect(bossEligible({ ...agent, completedAt: new Date(now).toISOString() } as Agent, now)).toBe(
    false,
  );
  expect(bossEligible({ ...agent, status: "working" } as Agent, now)).toBe(false);
});

it("flails both arms but holds a static working pose with reduced motion", () => {
  const first = bossPose(0, false);
  const second = bossPose(0.08, false);
  expect(Math.abs(second.leftX - first.leftX)).toBeGreaterThan(0.8);
  expect(Math.abs(second.rightX - first.rightX)).toBeGreaterThan(0.8);
  expect(second.bodyZ).not.toBe(0);
  expect(bossPose(0, true)).toEqual(bossPose(100, true));
});
