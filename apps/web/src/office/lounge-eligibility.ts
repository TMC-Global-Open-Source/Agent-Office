import type { Agent } from "@agent-office/shared";
import { completionDuration } from "./status-animation.js";
import { mergePartyActive } from "./party-animation.js";
import { homeDeparture } from "@agent-office/shared";

export const idleDeskGraceMs = 30_000;

export interface IdleGrace {
  status: Agent["status"];
  until: number | null;
}

export function updateIdleGrace(
  previous: Map<string, IdleGrace>,
  agents: Agent[],
  now: number,
): Map<string, IdleGrace> {
  return new Map(
    agents.map((agent) => {
      const old = previous.get(agent.id);
      const until =
        agent.status !== "idle"
          ? null
          : old?.status === "idle"
            ? old.until
            : old && old.status !== "offline"
              ? now + idleDeskGraceMs
              : null;
      return [agent.id, { status: agent.status, until }];
    }),
  );
}

export function loungeBayCount(activeAgentCount: number): number {
  return Math.max(1, Math.ceil(activeAgentCount / 8));
}

export function assignLoungeSeats(
  previous: Map<string, number>,
  agentIds: string[],
  activeAgentCount: number,
): Map<string, number> {
  const capacity = loungeBayCount(activeAgentCount) * 8;
  const ids = new Set(agentIds);
  const assignments = new Map([...previous].filter(([id, seat]) => ids.has(id) && seat < capacity));
  const occupied = new Set(assignments.values());
  for (const id of agentIds) {
    if (assignments.has(id)) continue;
    let seat = 0;
    while (occupied.has(seat)) seat++;
    assignments.set(id, seat);
    occupied.add(seat);
  }
  return assignments;
}

export function completedLoungeAt(agent: Agent): number | null {
  if (agent.status !== "completed") return null;
  const completed = Date.parse(agent.completedAt ?? agent.updatedAt);
  return Number.isFinite(completed) ? completed + completionDuration * 1000 : null;
}

export function belongsInLounge(
  agent: Agent,
  now: number,
  idleGraceUntil: number | null = null,
): boolean {
  if (homeDeparture({ metadata: agent.metadata ?? {} }) !== null) return false;
  if (mergePartyActive(agent, now)) return false;
  const deadline = completedLoungeAt(agent);
  return (
    (agent.status === "idle" && (idleGraceUntil === null || now >= idleGraceUntil)) ||
    (deadline !== null && now >= deadline)
  );
}
