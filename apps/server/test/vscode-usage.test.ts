import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSchema } from "@agent-office/shared";
import { parseChatSessionLog, readVsCodeUsage } from "../src/vscode-usage.js";
import { readDailyAttributedUsage, readUsageAttribution } from "../src/usage-attribution.js";
import { readUsageHistory } from "../src/usage-history.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const now = new Date("2026-10-14T00:00:00Z");
const at = (iso: string) => new Date(iso).getTime();
const jsonl = (...records: unknown[]) => records.map((record) => JSON.stringify(record)).join("\n");

function userData() {
  const root = mkdtempSync(join(tmpdir(), "office-vscode-"));
  roots.push(root);
  return root;
}
function workspace(
  root: string,
  hash: string,
  descriptor: object | null,
  logs: Record<string, string>,
) {
  const folder = join(root, "workspaceStorage", hash);
  mkdirSync(join(folder, "chatSessions"), { recursive: true });
  if (descriptor) writeFileSync(join(folder, "workspace.json"), JSON.stringify(descriptor));
  for (const [name, text] of Object.entries(logs))
    writeFileSync(join(folder, "chatSessions", name), text);
  return folder;
}
function vscodeAgent(session: string) {
  return AgentSchema.parse({
    id: `local:${createHash("sha256").update(`vscode:${session}:main`).digest("hex").slice(0, 32)}`,
    displayName: "VS Code Copilot · Main",
    source: "local",
    repositoryOwner: null,
    repositoryName: "Main",
    issueNumber: null,
    pullRequestNumber: null,
    taskTitle: null,
    taskUrl: null,
    status: "working",
    statusReason: null,
    lastActivityAt: null,
    startedAt: null,
    completedAt: null,
    updatedAt: now.toISOString(),
    deskId: null,
    avatarColor: "#123456",
    metadata: { runtime: "vscode", subagent: false },
  });
}

const sessionLog = jsonl(
  {
    kind: 0,
    v: {
      requests: [
        {
          requestId: "a",
          timestamp: at("2026-10-10T10:00:00Z"),
          message: { text: "SECRET PROMPT" },
          copilotCredits: 2,
          promptTokens: 100,
          completionTokens: 10,
        },
      ],
    },
  },
  { kind: 2, k: ["requests"], v: [{ requestId: "b", timestamp: at("2026-10-11T10:00:00Z") }] },
  { kind: 1, k: ["requests", 1, "copilotCredits"], v: 0.5 },
  { kind: 1, k: ["requests", 1, "promptTokens"], v: 40 },
  { kind: 1, k: ["requests", 1, "completionTokens"], v: 4 },
  { kind: 2, k: ["requests", 1, "response"], v: [{ value: "SECRET RESPONSE" }] },
  {
    kind: 2,
    k: ["requests"],
    v: [{ requestId: "old", timestamp: at("2026-08-01T00:00:00Z"), copilotCredits: 99 }],
  },
  "not json",
);

describe("VS Code chat session usage", () => {
  it("reads legacy timing and does not double-count a JSON twin", () => {
    const root = userData();
    const stamp = at("2026-10-12T00:00:00Z");
    workspace(root, "legacy", null, {
      "legacy.json": JSON.stringify({
        requests: [{ timestamp: stamp, result: { timings: { totalElapsed: 5000 } } }],
      }),
      "twin.json": JSON.stringify({ requests: [{ timestamp: stamp, copilotCredits: 99 }] }),
      "twin.jsonl": jsonl({
        kind: 0,
        v: { requests: [{ timestamp: stamp, elapsedMs: 2000, copilotCredits: 1 }] },
      }),
    });
    const usage = readVsCodeUsage(new Date("2026-10-10T00:00:00Z"), now, root);
    expect(usage.sessions).toHaveLength(2);
    expect(
      usage.sessions.find((session) => session.sessionId === "legacy")?.requests[0]?.durationMs,
    ).toBe(5000);
    expect(
      usage.sessions.find((session) => session.sessionId === "twin")?.requests[0],
    ).toMatchObject({ durationMs: 2000, aiCredits: 1 });
    const report = readDailyAttributedUsage(
      [vscodeAgent("legacy")],
      "2026-10-10T00:00:00Z",
      "2026-10-13T23:59:59Z",
      join(root, "missing.db"),
      root,
    );
    expect(report.estimatedIntervals).toMatchObject([{ start: stamp, end: stamp + 5000 }]);
  });
  it("reports numeric VS Code usage per UTC day with exact chat-session attribution", () => {
    const root = userData();
    workspace(
      root,
      "daily",
      { folder: "file:///C:/Projects/Main" },
      {
        "session-1.jsonl": sessionLog,
        "unknown.jsonl": jsonl({
          kind: 0,
          v: { requests: [{ timestamp: at("2026-10-10T10:00:00Z"), copilotCredits: 99 }] },
        }),
      },
    );
    const agent = vscodeAgent("session-1");
    const result = readDailyAttributedUsage(
      [agent],
      "2026-10-10T00:00:00Z",
      "2026-10-11T23:59:59.999Z",
      join(root, "absent.db"),
      root,
    );
    expect(result.usage.filter((row) => row.agentId === agent.id)).toMatchObject([
      { date: "2026-10-10", counts: { inputTokens: null, outputTokens: null, aiCredits: 2 } },
      { date: "2026-10-11", counts: { inputTokens: null, outputTokens: null, aiCredits: 0.5 } },
    ]);
    expect(result.usage.find((row) => !row.agentId)?.counts.aiCredits).toBe(99);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("replays snapshot, push, truncate, and property records keeping only numeric fields", () => {
    const requests = parseChatSessionLog(
      jsonl(
        { kind: 0, v: { requests: [{ timestamp: 1, copilotCredits: 1 }] } },
        { kind: 2, k: ["requests"], v: [{ timestamp: 2 }, { timestamp: 3, copilotCredits: 7 }] },
        { kind: 2, k: ["requests"], i: 1, v: [{ timestamp: 4 }] },
        { kind: 1, k: ["requests", 1, "copilotCredits"], v: 3 },
        { kind: 1, k: ["requests", 1, "modelState"], v: { value: 1 } },
        { kind: 1, k: ["requests", 0], v: { timestamp: 5, promptTokens: 8 } },
        { kind: 2, k: ["requests"], v: [{ text: "no timestamp" }] },
      ),
    );
    expect(requests).toEqual([
      { timestamp: 5, inputTokens: 8, outputTokens: null, aiCredits: null, durationMs: null },
      { timestamp: 4, inputTokens: null, outputTokens: null, aiCredits: 3, durationMs: null },
    ]);
  });

  it("prefers elapsedMs over later updates to result timing", () => {
    const requests = parseChatSessionLog(
      jsonl(
        { kind: 0, v: { requests: [{ timestamp: 1, elapsedMs: 2000 }] } },
        { kind: 1, k: ["requests", 0, "result", "timings", "totalElapsed"], v: 3000 },
      ),
    );
    expect(requests[0]?.durationMs).toBe(2000);
  });

  it("reads workspace folder names, filters the window, and never returns chat content", () => {
    const root = userData();
    workspace(
      root,
      "abc",
      { folder: "file:///c%3A/Projects/ConnectWise%20Main" },
      {
        "session-1.jsonl": sessionLog,
        "legacy.json": JSON.stringify({ requests: [{ copilotCredits: 50 }] }),
      },
    );
    workspace(
      root,
      "multi",
      { workspace: "file:///c%3A/w/Team.code-workspace" },
      {
        "session-2.jsonl": jsonl({
          kind: 0,
          v: { requests: [{ timestamp: at("2026-10-12T00:00:00Z"), copilotCredits: 1 }] },
        }),
      },
    );
    const result = readVsCodeUsage(new Date("2026-09-14T00:00:00Z"), now, root);
    expect(result.available).toBe(true);
    expect(result.sessions).toHaveLength(2);
    const first = result.sessions.find((session) => session.sessionId === "session-1");
    expect(first?.folder).toBe("ConnectWise Main");
    expect(first?.requests.map((request) => request.aiCredits)).toEqual([2, 0.5]);
    expect(result.sessions.find((session) => session.sessionId === "session-2")?.folder).toBe(
      "Team",
    );
    expect(JSON.stringify(result)).not.toMatch(/SECRET/);
  });

  it("skips logs that were not modified inside the window", () => {
    const root = userData();
    const folder = workspace(root, "old", null, { "stale.jsonl": sessionLog });
    const old = new Date("2026-01-01T00:00:00Z");
    utimesSync(join(folder, "chatSessions", "stale.jsonl"), old, old);
    expect(readVsCodeUsage(new Date("2026-09-14T00:00:00Z"), now, root).sessions).toEqual([]);
  });

  it("merges VS Code usage by folder and attributes it to the exact chat session agent", () => {
    const root = userData();
    workspace(
      root,
      "abc",
      { folder: "file:///c%3A/Projects/Main" },
      {
        "known.jsonl": sessionLog,
        "unknown.jsonl": jsonl({
          kind: 0,
          v: { requests: [{ timestamp: at("2026-10-12T00:00:00Z"), copilotCredits: 1.25 }] },
        }),
      },
    );
    const agent = vscodeAgent("known");
    const result = readUsageAttribution([agent], join(root, "missing.db"), now, root);
    expect(result.available).toBe(true);
    expect(result.agents).toEqual([
      {
        agentId: agent.id,
        folder: "Main",
        repository: null,
        inputTokens: null,
        outputTokens: null,
        calls: 2,
        aiCredits: 2.5,
        aiCreditCalls: 2,
      },
    ]);
    expect(result.folders).toEqual([
      expect.objectContaining({
        folder: "Main",
        aiCredits: 3.75,
        calls: 3,
        sessions: 2,
        sources: ["vscode"],
      }),
    ]);
    expect(result.unattributed).toMatchObject({ aiCredits: 1.25, calls: 1 });
    expect(result.sources.find((source) => source.source === "vscode")).toMatchObject({
      available: true,
      aiCredits: 3.75,
    });

    const history = readUsageHistory(join(root, "missing.db"), now, root);
    expect(history).toMatchObject({
      available: true,
      aiCredits: 3.75,
      calls: 3,
      inputTokens: null,
    });
    expect(history.daily.map((day) => day.date)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
  });
});
