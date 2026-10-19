import type { Agent } from "@agent-office/shared";
import { belongsInLounge } from "./lounge-eligibility.js";

export const bossDurationMs = 15_000;

export function bossEligible(agent: Agent, now: number): boolean {
  return belongsInLounge(agent, now);
}

export function bossActive(agent: Pick<Agent, "status" | "metadata">, now: number): boolean {
  const value = agent.metadata?.bossAt;
  const started = typeof value === "string" ? Date.parse(value) : NaN;
  return (
    (agent.status === "idle" || agent.status === "completed") &&
    now >= started &&
    now < started + bossDurationMs
  );
}

export function bossPose(time: number, reducedMotion: boolean) {
  const swing = reducedMotion ? 0 : Math.sin(time * 19);
  return {
    leftX: -1.2 + swing * 0.9,
    rightX: -1.2 - swing * 0.9,
    leftZ: 0.3 + swing * 0.4,
    rightZ: -0.3 + swing * 0.4,
    bodyX: 0.12,
    bodyZ: reducedMotion ? 0 : Math.sin(time * 12) * 0.12,
    headX: reducedMotion ? 0.1 : 0.1 + Math.sin(time * 15) * 0.18,
  };
}
