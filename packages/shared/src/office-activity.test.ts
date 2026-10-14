import { describe, expect, it } from "vitest";
import { activityForTool } from "./office-activity.js";

describe("privacy-minimized tool activity", () => {
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
