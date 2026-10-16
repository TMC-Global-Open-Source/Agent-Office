import { describe, expect, it } from "vitest";
import { AgentSchema } from "./model.js";
import { compactDesks, hexAvatarColor, nextDesk } from "./layout.js";
import { inferStatus } from "./status.js";

describe("shared agent contracts", () => {
  it("validates normalized agents", () => {
    const valid = {
      id: "a",
      displayName: "A",
      source: "mock",
      repositoryOwner: null,
      repositoryName: null,
      issueNumber: null,
      pullRequestNumber: null,
      taskTitle: null,
      taskUrl: null,
      status: "working",
      statusReason: null,
      updatedAt: new Date().toISOString(),
      deskId: null,
      avatarColor: "#abcdef",
      lastActivityAt: null,
      startedAt: null,
      completedAt: null,
    };
    expect(() => AgentSchema.parse(valid)).not.toThrow();
    expect(() => AgentSchema.parse({ ...valid, taskUrl: "javascript:alert(1)" })).toThrow();
  });

  it("prefers attention evidence and retains its explanation", () => {
    const decision = inferStatus([
      {
        kind: "commit",
        description: "Commit pushed",
        observedAt: new Date().toISOString(),
        confidence: 0.8,
      },
      {
        kind: "comment",
        description: "Blocked: needs review",
        observedAt: new Date().toISOString(),
        confidence: 0.9,
      },
    ]);
    expect(decision.status).toBe("needs_attention");
    expect(decision.reason).toContain("Blocked");
  });

  it("creates stable colors and unoccupied desk positions", () => {
    expect(hexAvatarColor("agent-1")).toBe(hexAvatarColor("agent-1"));
    const first = nextDesk([], "one");
    const second = nextDesk([first], "two");
    expect(`${first.row}:${first.column}`).not.toBe(`${second.row}:${second.column}`);
  });

  it("compacts desks into consecutive top-left slots in their existing order", () => {
    const compacted = compactDesks([
      { id: "c", row: 2, column: 0 },
      { id: "a", row: 0, column: 4 },
      { id: "b", row: 1, column: 2 },
    ]);
    expect(compacted.map(({ id, row, column }) => [id, row, column])).toEqual([
      ["a", 0, 0],
      ["b", 0, 1],
      ["c", 0, 2],
    ]);
  });
});
