import { expect, it } from "vitest";
import type { Agent } from "@agent-office/shared";
import { pushSecretKey } from "./secret-party.js";
import { mergePartyActive, officePartyActive, partyElapsed } from "./party-animation.js";
import { belongsInLounge } from "./lounge-eligibility.js";

const type = (keys: string[]) => {
  let buffer: string[] = [];
  return keys.map((key) => {
    const result = pushSecretKey(buffer, key);
    buffer = result.buffer;
    return result.matched;
  });
};

it("recognises the secret word and the Konami code", () => {
  expect(type([..."xxParTy"]).at(-1)).toBe(true);
  expect(type([..."part"]).some(Boolean)).toBe(false);
  expect(
    type([
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ]).at(-1),
  ).toBe(true);
  // The buffer resets after a match, so typing "partyparty" fires exactly twice.
  expect(type([..."partyparty"]).filter(Boolean)).toHaveLength(2);
});

it("lets idle agents party in the lounge instead of walking to their desks", () => {
  const start = Date.parse("2026-10-15T12:00:00Z");
  const agent = {
    id: "idle",
    status: "idle",
    updatedAt: new Date(start - 60_000).toISOString(),
    metadata: { officeParty: new Date(start).toISOString() },
  } as unknown as Agent;
  expect(partyElapsed(agent, start + 2000)).toBe(2);
  expect(officePartyActive(agent, start + 2000)).toBe(true);
  expect(mergePartyActive(agent, start + 2000)).toBe(false);
  expect(belongsInLounge(agent, start + 2000)).toBe(true);
  expect(officePartyActive(agent, start + 14_000)).toBe(false);
});
