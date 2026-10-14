import type { Agent } from "@agent-office/shared";
import type { DeskData } from "./Workstation.js";

export interface SubagentTeam {
  parentId: string;
  label: string;
  agentIds: string[];
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
}

export function subagentLayout(agents: Agent[], desks: DeskData[]) {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const groups = new Map<string, DeskData[]>();
  for (const desk of desks) {
    const parent = byId.get(desk.agentId)?.metadata.parentAgentId;
    if (typeof parent !== "string" || parent === desk.agentId) continue;
    const members = groups.get(parent) ?? [];
    members.push(desk);
    groups.set(parent, members);
  }
  const childIds = new Set([...groups.values()].flat().map((desk) => desk.agentId));
  const baseColumn = 1;
  const overrides = new Map<string, DeskData>();
  const teams: SubagentTeam[] = [];
  let row =
    Math.max(-1, ...desks.filter((desk) => !childIds.has(desk.agentId)).map((desk) => desk.row)) +
    2;
  for (const [parentId, members] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    members.sort(
      (a, b) => a.row - b.row || a.column - b.column || a.agentId.localeCompare(b.agentId),
    );
    members.forEach((desk, index) => {
      overrides.set(desk.agentId, {
        ...desk,
        column: baseColumn + (index % 3),
        row: row + Math.floor(index / 3),
      });
    });
    const lastRow = row + Math.floor((members.length - 1) / 3);
    const parent = byId.get(parentId);
    teams.push({
      parentId,
      label: `${parent?.displayName ?? "Parent session"} · subagent team`,
      agentIds: members.map((desk) => desk.agentId),
      minColumn: baseColumn,
      maxColumn: baseColumn + Math.min(3, members.length) - 1,
      minRow: row,
      maxRow: lastRow,
    });
    row = lastRow + 2;
  }
  return { desks: desks.map((desk) => overrides.get(desk.agentId) ?? desk), teams };
}
