import type { Agent } from "@agent-office/shared";
import { completionDuration } from "./status-animation.js";
import { partyElapsed } from "./party-animation.js";

export function completedLoungeAt(agent: Agent): number | null {
  if (agent.status !== "completed") return null;
  const completed = Date.parse(agent.completedAt ?? agent.updatedAt);
  return Number.isFinite(completed) ? completed + completionDuration * 1000 : null;
}

export function belongsInLounge(agent: Agent, now: number): boolean {
  if (partyElapsed(agent, now) !== null) return false;
  const deadline = completedLoungeAt(agent);
  return agent.status === "idle" || (deadline !== null && now >= deadline);
}
