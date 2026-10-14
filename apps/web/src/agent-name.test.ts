import { describe, expect, it } from "vitest";
import { agentDisplayName } from "./agent-name.js";

describe("agent source display", () => {
  it("hides only known local runtime prefixes without losing workspace or subagent names", () => {
    for (const source of ["Copilot CLI", "VS Code Copilot"]) {
      const agent = {
        source: "local" as const,
        displayName: `${source} · My workspace (research)`,
      };
      expect(agentDisplayName(agent, false)).toBe("My workspace (research)");
      expect(agentDisplayName(agent, true)).toBe(agent.displayName);
    }
  });
});
