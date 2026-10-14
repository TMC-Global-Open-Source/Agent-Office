import type { Agent } from "@agent-office/shared";

export function attentionSince(agent: Agent): number {
  const since = agent.metadata.waitingForPromptSince;
  const timestamp = Date.parse(typeof since === "string" ? since : agent.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : Date.parse(agent.updatedAt);
}

export function attentionQueue(agents: Agent[]): Agent[] {
  return agents
    .filter((agent) => agent.status === "needs_attention")
    .sort((a, b) => attentionSince(a) - attentionSince(b) || a.id.localeCompare(b.id));
}

export function waitingLabel(agent: Agent, now: number): string {
  const minutes = Math.max(0, Math.floor((now - attentionSince(agent)) / 60_000));
  return minutes === 0 ? "Waiting less than a minute" : `Waiting ${minutes} min`;
}
