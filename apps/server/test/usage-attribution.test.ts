import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSchema } from "@agent-office/shared";
import { readUsageAttribution } from "../src/usage-attribution.js";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});
function agent(session: string, child = "main", runtime = "copilot-cli") {
  const id = (child: string) =>
    `local:${createHash("sha256").update(`${runtime}:${session}:${child}`).digest("hex").slice(0, 32)}`;
  return AgentSchema.parse({
    id: id(child),
    displayName: "Local agent",
    source: "local",
    repositoryOwner: null,
    repositoryName: "workspace",
    issueNumber: null,
    pullRequestNumber: null,
    taskTitle: null,
    taskUrl: null,
    status: "working",
    statusReason: null,
    lastActivityAt: null,
    startedAt: null,
    completedAt: null,
    updatedAt: "2026-10-14T00:00:00Z",
    deskId: null,
    avatarColor: "#123456",
    metadata: {
      runtime,
      subagent: child !== "main",
      ...(child !== "main" ? { parentAgentId: id("main") } : {}),
    },
  });
}
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "office-attribution-"));
  paths.push(folder);
  const path = join(folder, "usage.db");
  const db = new Database(path);
  return { path, db };
}
describe("exact usage attribution", () => {
  it("counts each call once per folder and attributes root and child only by exact identities", () => {
    const { path, db } = fixture();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, repository TEXT, cwd TEXT);
      CREATE TABLE assistant_usage_events (session_id TEXT, agent_id TEXT, parent_tool_call_id TEXT, created_at TEXT, input_tokens INTEGER, output_tokens INTEGER);
      INSERT INTO sessions VALUES ('session', 'org/repo', 'C:\\work\\Main\\'), ('unknown', 'org/repo', '/home/me/Main'), ('vscode', 'other/repo', 'D:\\other'), ('missing-repo', NULL, NULL);
    `);
    const insert = db.prepare("INSERT INTO assistant_usage_events VALUES (?, ?, ?, ?, ?, ?)");
    for (const [session, child, parent, input, output] of [
      ["session", null, null, 100, 20],
      ["session", "child", "call", 30, 5],
      ["session", "unknown-child", "call2", 10, 2],
      ["unknown", null, null, 7, 3],
      ["vscode", null, null, 50, 10],
      ["missing-repo", null, null, 0, 0],
      ["session", null, null, null, null],
      ["session", null, "unknown-call", 4, 1],
    ])
      insert.run(session, child, parent, "2026-10-13T12:00:00Z", input, output);
    insert.run("session", null, null, "2026-08-01", 999, 999);
    insert.run("session", null, null, "2026-11-01", 999, 999);
    db.close();
    const root = agent("session"),
      child = agent("session", "child");
    const result = readUsageAttribution(
      [root, child, agent("vscode", "main", "vscode")],
      path,
      new Date("2026-10-14T00:00:00Z"),
      null,
    );
    expect(result.available).toBe(true);
    expect(result.agents).toHaveLength(2);
    expect(result.agents.find((item) => item.agentId === root.id)).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      calls: 2,
    });
    expect(result.agents.find((item) => item.agentId === child.id)).toMatchObject({
      inputTokens: 30,
      outputTokens: 5,
      calls: 1,
    });
    expect(result.agents.find((item) => item.agentId === root.id)).toMatchObject({
      folder: "Main",
      repository: "org/repo",
    });
    expect(result.folders.find((item) => item.folder === "Main")).toMatchObject({
      inputTokens: 151,
      outputTokens: 31,
      calls: 6,
      sessions: 2,
      repositories: ["org/repo"],
      sources: ["copilot-cli"],
    });
    expect(result.folders.find((item) => item.folder === "other")).toMatchObject({ calls: 1 });
    expect(result.folders.find((item) => item.folder === null)).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      calls: 1,
    });
    expect(result.unattributed).toEqual({
      inputTokens: 71,
      outputTokens: 16,
      calls: 5,
      aiCredits: null,
      aiCreditCalls: 0,
    });
    expect(JSON.stringify(result)).not.toContain("unknown-child");
    expect(JSON.stringify(result)).not.toContain("unknown-call");
  });
  it("reports recorded AI credits per agent, folder and unattributed bucket", () => {
    const { path, db } = fixture();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, repository TEXT);
      CREATE TABLE assistant_usage_events (session_id TEXT, agent_id TEXT, parent_tool_call_id TEXT, created_at TEXT, input_tokens INTEGER, output_tokens INTEGER, total_nano_aiu INTEGER);
      INSERT INTO sessions VALUES ('session', 'org/repo'), ('other', 'org/repo');
    `);
    const insert = db.prepare("INSERT INTO assistant_usage_events VALUES (?, ?, ?, ?, ?, ?, ?)");
    insert.run("session", null, null, "2026-10-13T12:00:00Z", 1, 1, 1_500_000_000);
    insert.run("session", null, null, "2026-10-13T12:00:00Z", 1, 1, null);
    insert.run("other", null, null, "2026-10-13T12:00:00Z", 1, 1, 250_000_000);
    db.close();
    const root = agent("session");
    const result = readUsageAttribution([root], path, new Date("2026-10-14T00:00:00Z"), null);
    expect(result.agents[0]).toMatchObject({ aiCredits: 1.5, aiCreditCalls: 1, calls: 2 });
    expect(result.folders[0]).toMatchObject({ aiCredits: 1.75, aiCreditCalls: 2, calls: 3 });
    expect(result.unattributed).toMatchObject({ aiCredits: 0.25, aiCreditCalls: 1, calls: 1 });
  });
  it("reports missing and incompatible databases explicitly", () => {
    const { path, db } = fixture();
    db.close();
    expect(readUsageAttribution([], path, undefined, null).available).toBe(false);
    expect(readUsageAttribution([], join(path, "absent"), undefined, null).available).toBe(false);
    expect(
      readUsageAttribution([], join(path, "absent"), undefined, join(path, "no-vscode")).sources,
    ).toMatchObject([{ available: false }, { source: "vscode", available: false }]);
  });
});
