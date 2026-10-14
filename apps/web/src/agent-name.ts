import type { Agent } from "@agent-office/shared";

export function agentDisplayName(
  agent: Pick<Agent, "source" | "displayName">,
  showSource: boolean,
): string {
  if (showSource || agent.source !== "local") return agent.displayName;
  return agent.displayName.replace(/^(?:VS Code Copilot|Copilot CLI) · /, "");
}
