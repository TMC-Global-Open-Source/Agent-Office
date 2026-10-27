import { describe, expect, it } from "vitest";
import { activityForTool, isAwayFromOffice } from "./office-activity.js";

describe("privacy-minimized tool activity", () => {
  it("excludes offline and explicitly away agents without excluding joining, queued or lounge agents", () => {
    expect(isAwayFromOffice({ status: "offline", metadata: {} })).toBe(true);
    expect(isAwayFromOffice({ status: "working", metadata: { officeActivity: "away" } })).toBe(
      true,
    );
    for (const status of [
      "spawning",
      "queued",
      "working",
      "idle",
      "completed",
      "failed",
      "needs_attention",
    ] as const)
      expect(isAwayFromOffice({ status, metadata: {} })).toBe(false);
    expect(isAwayFromOffice({ status: "idle", metadata: { officeActivity: "away" } })).toBe(false);
    expect(
      isAwayFromOffice({
        status: "offline",
        metadata: { homeDeparture: { startedAt: "2026-10-26T12:00:00Z" } },
      }),
    ).toBe(false);
  });
  it.each([
    ["view", "reading"],
    ["Read", "reading"],
    ["rg", "reading"],
    ["apply_patch", "typing"],
    ["str_replace_editor", "typing"],
    ["Write", "typing"],
    ["web_search", "researching"],
    ["WebFetch", "researching"],
    ["powershell", "monitoring"],
    ["Bash", "monitoring"],
    ["task", "delegating"],
    ["AskUserQuestion", "attention"],
    ["unknown_custom_tool", "working"],
    [undefined, "working"],
  ])("maps %s to %s without looking at arguments", (name, expected) => {
    expect(activityForTool(name)).toBe(expected);
  });
});
