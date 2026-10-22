import type { Agent } from "./model.js";

export const homeTimeline = { desk: 2.5, shutdown: 4.5, coffee: 5.5, exit: 10.5, gone: 12.5 };

export function homeDeparture(agent: Pick<Agent, "metadata">) {
  const value = agent.metadata.homeDeparture;
  if (!value || typeof value !== "object") return null;
  const { startedAt } = value as Record<string, unknown>;
  const start = typeof startedAt === "string" ? Date.parse(startedAt) : NaN;
  return Number.isFinite(start) ? start : null;
}

export function homeElapsed(agent: Pick<Agent, "metadata">, now: number): number | null {
  const start = homeDeparture(agent);
  return start === null ? null : Math.max(0, (now - start) / 1000);
}

export function resumesFromHome(
  agent: Pick<Agent, "status" | "lastActivityAt">,
  start: number,
): boolean {
  return (
    (agent.status === "working" || agent.status === "spawning") &&
    agent.lastActivityAt !== null &&
    Date.parse(agent.lastActivityAt) > start
  );
}
