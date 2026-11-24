import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSchema } from "@agent-office/shared";
import { readDailyAttributedUsage, readUsageAttribution } from "../src/usage-attribution.js";

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
  it("recovers unmatched log calls once while preserving exact agent identities", () => {
    const { path, db } = fixture();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, repository TEXT);
      CREATE TABLE assistant_usage_events (session_id TEXT, agent_id TEXT, parent_tool_call_id TEXT,
        created_at TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, total_nano_aiu INTEGER, duration_ms INTEGER);
      INSERT INTO sessions VALUES ('session', 'org/repo');
      INSERT INTO assistant_usage_events VALUES ('session', NULL, NULL, '2026-10-14T12:00:10Z', 'model', 100, 10, 1000000000, 5000);
    `);
    db.close();
    const directory = join(path, "..", "session-state", "session");
    mkdirSync(directory, { recursive: true });
    const event = (
      id: string,
      time: string,
      input: number,
      agentId?: string,
      parentToolCallId?: string,
    ) => ({
      id,
      timestamp: time,
      type: "session.usage_record",
      agentId,
      data: {
        usage: {
          model: "model",
          inputTokens: input,
          outputTokens: 10,
          copilotUsage: { totalNanoAiu: 1_000_000_000 },
          duration: 5000,
          parentToolCallId,
        },
      },
    });
    const matched = event("one", "2026-10-14T12:00:10Z", 100);
    writeFileSync(
      join(directory, "events.jsonl"),
      [
        matched,
        matched,
        event("two", "2026-10-14T12:00:20Z", 50),
        event("three", "2026-10-14T12:00:30Z", 20, "child", "parent"),
        event("four", "2026-10-14T12:00:40Z", 10, "unknown"),
      ]
        .map((item) => JSON.stringify(item))
        .join("\n"),
    );
    const root = agent("session");
    const child = agent("session", "child");
    const result = readDailyAttributedUsage(
      [root, child],
      "2026-10-14T00:00:00Z",
      "2026-10-14T23:59:59Z",
      path,
      null,
    );
    expect(result.sources[0]).toMatchObject({ calls: 4, inputTokens: 180, aiCredits: 4 });
    expect(
      result.usage.filter((row) => row.agentId === root.id).map((row) => row.counts.inputTokens),
    ).toEqual([100, 50]);
    expect(result.usage.find((row) => row.agentId === child.id)?.counts.inputTokens).toBe(20);
    expect(result.usage.find((row) => row.agentId === null)?.counts.inputTokens).toBe(10);
    expect(
      result.estimatedIntervals.filter((interval) => interval.agentId === root.id),
    ).toHaveLength(2);
    expect(result.sources[0]?.message).toContain("3 additional call(s)");
  });

  it("excludes ambiguous log matches rather than double-counting", () => {
    const { path, db } = fixture();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, repository TEXT);
      CREATE TABLE assistant_usage_events (session_id TEXT, agent_id TEXT, parent_tool_call_id TEXT,
        created_at TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER);
      INSERT INTO sessions VALUES ('session', NULL);
      INSERT INTO assistant_usage_events VALUES ('session', NULL, NULL, '2026-10-14T12:00:10Z', 'model', 100, 10);
    `);
    db.close();
    const directory = join(path, "..", "session-state", "session");
    mkdirSync(directory, { recursive: true });
    const event = (id: string) => ({
      id,
      timestamp: "2026-10-14T12:00:10Z",
      type: "session.usage_record",
      data: { usage: { model: "model", inputTokens: 100, outputTokens: 10 } },
    });
    writeFileSync(
      join(directory, "events.jsonl"),
      [event("one"), event("two")].map((item) => JSON.stringify(item)).join("\n"),
    );
    const result = readDailyAttributedUsage(
      [agent("session")],
      "2026-10-14T00:00:00Z",
      "2026-10-14T23:59:59Z",
      path,
      null,
    );
    expect(result.sources[0]?.calls).toBe(1);
    expect(result.sources[0]?.message).toContain("2 ambiguous");
  });
  it("recovers complete records from the tail of an oversized log and reports partial coverage", () => {
    const { path, db } = fixture();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, repository TEXT);
      CREATE TABLE assistant_usage_events (session_id TEXT, agent_id TEXT, parent_tool_call_id TEXT,
        created_at TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER);
    `);
    db.close();
    const directory = join(path, "..", "session-state", "session");
    mkdirSync(directory, { recursive: true });
    const event = {
      id: "tail",
      timestamp: "2026-10-14T12:00:10Z",
      type: "session.usage_record",
      data: { usage: { model: "model", inputTokens: 50, outputTokens: 10 } },
    };
    writeFileSync(
      join(directory, "events.jsonl"),
      `${" ".repeat(8 * 1024 * 1024)}\n${JSON.stringify(event)}\n`,
    );
    const result = readDailyAttributedUsage(
      [agent("session")],
      "2026-10-14T00:00:00Z",
      "2026-10-14T23:59:59Z",
      path,
      null,
    );
    expect(result.sources[0]?.calls).toBe(1);
    expect(result.sources[0]?.message).toContain("partially scanned");
  });
  it("groups CLI calls into UTC days without moving child or unrecognized usage to the root", () => {
    const { path, db } = fixture();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, repository TEXT);
      CREATE TABLE assistant_usage_events (session_id TEXT, agent_id TEXT, parent_tool_call_id TEXT, created_at TEXT, input_tokens INTEGER, output_tokens INTEGER, total_nano_aiu INTEGER);
      INSERT INTO sessions VALUES ('session', 'org/repo');
      INSERT INTO assistant_usage_events VALUES
        ('session', NULL, NULL, '2026-10-13 23:59:59', 10, 2, 1000000000),
        ('session', NULL, NULL, '2026-10-14T01:00:00+01:00', 0, NULL, NULL),
        ('session', 'child', 'call', '2026-10-14T00:00:00Z', 30, 5, 250000000),
        ('session', 'unknown', 'call2', '2026-10-14T12:00:00Z', 999, 999, NULL),
        ('session', NULL, NULL, '2026-10-15T00:00:00Z', 999, 999, NULL);
    `);
    db.close();
    const root = agent("session"),
      child = agent("session", "child");
    const report = readDailyAttributedUsage(
      [root, child],
      "2026-10-13T00:00:00Z",
      "2026-10-14T23:59:59.999Z",
      path,
      null,
    );
    expect(report.usage.filter((row) => row.agentId === root.id)).toMatchObject([
      {
        date: "2026-10-13",
        inputTokenCalls: 1,
        outputTokenCalls: 1,
        counts: { inputTokens: 10, aiCredits: 1 },
      },
      {
        date: "2026-10-14",
        inputTokenCalls: 1,
        outputTokenCalls: 0,
        counts: { inputTokens: 0, outputTokens: null, aiCredits: null },
      },
    ]);
    expect(report.usage.find((row) => row.agentId === child.id)?.counts.inputTokens).toBe(30);
    expect(report.usage.find((row) => row.agentId === null)?.counts.inputTokens).toBe(999);
    expect(report.sources[0]?.calls).toBe(4);
  });
  it("groups usage on the viewer's local calendar date", () => {
    const { path, db } = fixture();
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, repository TEXT);
      CREATE TABLE assistant_usage_events (session_id TEXT, agent_id TEXT, parent_tool_call_id TEXT,
        created_at TEXT, input_tokens INTEGER, output_tokens INTEGER);
      INSERT INTO sessions VALUES ('session', NULL);
      INSERT INTO assistant_usage_events VALUES ('session', NULL, NULL, '2026-03-09T03:59:59Z', 7, 2);
      INSERT INTO assistant_usage_events VALUES ('session', NULL, NULL, '2026-03-09T04:00:00Z', 8, 3);
    `);
    db.close();
    const result = readDailyAttributedUsage(
      [agent("session")],
      "2026-03-08T05:00:00Z",
      "2026-03-10T03:59:59Z",
      path,
      null,
      "America/New_York",
    );
    expect(result.usage.map((row) => row.date)).toEqual(["2026-03-08", "2026-03-09"]);
  });
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
    const afterGoingHome = readUsageAttribution(
      [root, child, agent("vscode", "main", "vscode")].map((item) => ({
        ...item,
        deskId: null,
        metadata: { ...item.metadata, homeDeparture: { startedAt: "2026-10-13T00:00:00Z" } },
      })),
      path,
      new Date("2026-10-14T00:00:00Z"),
      null,
    );
    expect(afterGoingHome).toEqual(result);
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
