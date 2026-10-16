import { describe, expect, it } from "vitest";
import { AgentSchema } from "@agent-office/shared";
import { subagentLayout } from "./subagent-layout.js";

function agent(id: string, parentAgentId?: string) {
  return AgentSchema.parse({
    id,
    displayName: id,
    source: "local",
    status: "working",
    statusReason: null,
    repositoryOwner: null,
    repositoryName: "project",
    issueNumber: null,
    pullRequestNumber: null,
    taskTitle: null,
    taskUrl: null,
    lastActivityAt: null,
    startedAt: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
    deskId: null,
    avatarColor: "#123456",
    metadata: parentAgentId ? { parentAgentId } : {},
  });
}

describe("subagent floor grouping", () => {
  it("groups siblings, separates parents and keeps regular desk assignments intact", () => {
    const agents = [
      agent("parent-a"),
      agent("parent-b"),
      ...Array.from({ length: 4 }, (_, i) => agent(`child-${i}`, "parent-a")),
      agent("child-b", "parent-b"),
    ];
    const desks = agents.map((agent, index) => ({
      id: `desk-${index}`,
      agentId: agent.id,
      row: Math.floor(index / 5),
      column: index % 5,
      active: true,
    }));
    const layout = subagentLayout(agents, desks);
    expect(layout.teams).toHaveLength(2);
    expect(layout.desks.slice(0, 2)).toEqual(desks.slice(0, 2));
    expect(layout.teams[0]?.agentIds).toHaveLength(4);
    expect(layout.teams[0]!.maxRow).toBeLessThan(layout.teams[1]!.minRow - 0.9);
    expect(new Set(layout.desks.map((desk) => `${desk.row}:${desk.column}`)).size).toBe(
      desks.length,
    );
    expect(subagentLayout([...agents].reverse(), [...desks].reverse()).teams).toEqual(layout.teams);
    expect(desks[2]?.column).toBe(2);
  });

  it("consolidates visible desks into the top-left slots when others leave", () => {
    const agents = ["a", "b", "c"].map((id) => agent(id));
    const desks = [
      { id: "desk-a", agentId: "a", row: 0, column: 3, active: true },
      { id: "desk-gone", agentId: "gone", row: 0, column: 0, active: false },
      { id: "desk-c", agentId: "c", row: 1, column: 4, active: true },
      { id: "desk-b", agentId: "b", row: 1, column: 1, active: true },
    ];
    const layout = subagentLayout(agents, desks);
    expect(layout.desks.map((desk) => [desk.agentId, desk.row, desk.column])).toEqual([
      ["a", 0, 0],
      ["b", 0, 1],
      ["c", 0, 2],
    ]);
  });
});
