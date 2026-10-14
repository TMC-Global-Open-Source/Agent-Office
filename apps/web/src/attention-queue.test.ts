import { describe, expect, it } from "vitest";
import { attentionQueue, waitingLabel } from "./attention-queue.js";
import type { Agent } from "@agent-office/shared";

describe("attention queue", () => {
  it("orders by waiting start rather than later activity and excludes working agents", () => {
    const agents = [
      { id: "new", status: "needs_attention", updatedAt: "2026-10-14T01:10:00Z", metadata: {} },
      {
        id: "old",
        status: "needs_attention",
        updatedAt: "2026-10-14T01:20:00Z",
        metadata: { waitingForPromptSince: "2026-10-14T01:00:00Z" },
      },
      { id: "working", status: "working", updatedAt: "2026-10-14T00:00:00Z", metadata: {} },
    ] as Agent[];
    expect(attentionQueue(agents).map((agent) => agent.id)).toEqual(["old", "new"]);
    expect(waitingLabel(agents[1]!, Date.parse("2026-10-14T01:25:00Z"))).toBe("Waiting 25 min");
  });
});
