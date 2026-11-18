import { afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentRuntimeRecorder } from "../src/agent-runtime.js";
import { buildAgentReport, ReportQuery } from "../src/agent-report.js";
import { LocalHooksProvider, type LocalHookEvent } from "../src/providers/local-hooks.js";
import { emptyCounts } from "../src/usage-attribution.js";

const fixtures: Array<{ folder: string; database: PrismaClient }> = [];
afterEach(async () => {
  for (const { folder, database } of fixtures.splice(0)) {
    await database.$disconnect();
    rmSync(folder, { recursive: true, force: true });
  }
});
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "office-runtime-"));
  const path = join(folder, "report.db");
  const db = new Database(path);
  db.exec('CREATE TABLE "Agent" ("id" TEXT PRIMARY KEY);');
  db.exec(
    readFileSync(
      new URL("../prisma/migrations/20261118180000_agent_reporting/migration.sql", import.meta.url),
      "utf8",
    ),
  );
  const agent = new LocalHooksProvider().recordEvent({
    runtime: "copilot-cli",
    sessionId: "report",
    workspace: "workspace",
    event: "sessionStart",
    timestamp: "2026-11-18T23:59:00Z",
  });
  db.prepare('INSERT INTO "Agent" ("id") VALUES (?)').run(agent.id);
  db.close();
  const database = new PrismaClient({ datasources: { db: { url: `file:${path}` } } });
  fixtures.push({ folder, database });
  const recorder = new AgentRuntimeRecorder(database);
  const record = (event: LocalHookEvent["event"], timestamp: string, received = timestamp) =>
    recorder.record(
      agent.id,
      {
        runtime: "copilot-cli",
        sessionId: "report",
        workspace: "workspace",
        event,
        timestamp,
      },
      1,
      new Date(received),
    );
  return { database, recorder, record, agent };
}
describe("agent working time and daily reports", () => {
  it("excludes initial prompt waiting and turn-stop attention/idle time, splitting work across UTC midnight", async () => {
    const { database, record, agent } = fixture();
    await record("sessionStart", "2026-11-18T23:58:00Z");
    await record("userPromptSubmitted", "2026-11-18T23:59:30Z");
    await record("agentStop", "2026-11-19T00:00:15Z");
    await record("userPromptSubmitted", "2026-11-19T00:02:00Z");
    await record("sessionEnd", "2026-11-19T00:02:20Z");
    const report = buildAgentReport(
      [agent],
      await database.agentRunState.findMany(),
      await database.agentWorkingInterval.findMany(),
      ReportQuery.parse({ start: "2026-11-17", end: "2026-11-19", agentId: agent.id }),
      { usage: [], sources: [] },
      new Date("2026-11-19T01:00:00Z"),
    );
    expect(report.days.map((row) => row.workingMilliseconds)).toEqual([null, 30_000, 35_000]);
    expect(report.days.every((row) => row.aiCredits === null && row.inputTokens === null)).toBe(
      true,
    );
    expect(report.agents[0]?.trackedSince).toBe("2026-11-18T23:58:00.000Z");
  });
  it("ignores duplicate and out-of-order work hooks, and recovers without counting downtime", async () => {
    const { database, recorder, record } = fixture();
    await record("userPromptSubmitted", "2026-11-18T12:00:00Z");
    await recorder.heartbeat(1, new Date("2026-11-18T12:00:10Z"));
    await recorder.recover();
    await record("userPromptSubmitted", "2026-11-18T12:00:00Z", "2026-11-18T12:00:20Z");
    expect((await database.agentRunState.findFirstOrThrow()).working).toBe(false);
    await record("preToolUse", "2026-11-18T12:00:30Z");
    await record("agentStop", "2026-11-18T12:00:40Z");
    await record("preToolUse", "2026-11-18T12:00:30Z", "2026-11-18T12:00:50Z");
    // A replay sharing the stop timestamp must not reopen a stopped interval.
    await record("preToolUse", "2026-11-18T12:00:40Z", "2026-11-18T12:00:55Z");
    await recorder.heartbeat(1, new Date("2026-11-18T12:01:00Z"));
    const intervals = await database.agentWorkingInterval.findMany({
      orderBy: { startedAt: "asc" },
    });
    expect(intervals.map((row) => row.endedAt.getTime() - row.startedAt.getTime())).toEqual([
      10_000, 10_000,
    ]);
  });
  it("distinguishes an observed idle day from a day without any runtime evidence", async () => {
    const { database, recorder, record, agent } = fixture();
    await record("sessionStart", "2026-11-18T12:00:00Z");
    await recorder.recover();
    await record("preToolUse", "2026-11-20T12:00:00Z");
    await record("agentStop", "2026-11-20T12:00:10Z");
    const report = buildAgentReport(
      [agent],
      await database.agentRunState.findMany(),
      await database.agentWorkingInterval.findMany(),
      ReportQuery.parse({ start: "2026-11-18", end: "2026-11-20", agentId: agent.id }),
      { usage: [], sources: [] },
      new Date("2026-11-20T13:00:00Z"),
      await database.agentRuntimeDay.findMany(),
    );
    expect(report.days.map((row) => row.workingMilliseconds)).toEqual([0, null, 10_000]);
  });
  it("caps missing-stop work at the offline threshold and starts a new interval on fresh evidence", async () => {
    const { database, recorder, record } = fixture();
    await record("preToolUse", "2026-11-18T12:00:00Z");
    await recorder.heartbeat(1, new Date("2026-11-18T12:05:00Z"));
    await record("postToolUse", "2026-11-18T12:06:00Z");
    await record("agentStop", "2026-11-18T12:06:10Z");
    expect(
      (await database.agentWorkingInterval.findMany({ orderBy: { startedAt: "asc" } })).map(
        (row) => row.endedAt.getTime() - row.startedAt.getTime(),
      ),
    ).toEqual([60_000, 10_000]);
  });
  it("preserves recorded zero, partial metrics, and unattributed usage without allocating it to a selected agent", async () => {
    const { agent } = fixture();
    const report = buildAgentReport(
      [agent],
      [],
      [],
      ReportQuery.parse({
        start: "2026-11-18",
        end: "2026-11-18",
        agentId: [agent.id, agent.id],
      }),
      {
        sources: [],
        usage: [
          {
            date: "2026-11-18",
            inputTokenCalls: 1,
            outputTokenCalls: 0,
            agentId: agent.id,
            source: "copilot-cli",
            sessionId: "report",
            folder: null,
            repository: null,
            counts: {
              ...emptyCounts(),
              inputTokens: 0,
              calls: 2,
              aiCredits: 1.5,
              aiCreditCalls: 1,
            },
          },
          {
            date: "2026-11-18",
            inputTokenCalls: 1,
            outputTokenCalls: 1,
            agentId: null,
            source: "copilot-cli",
            sessionId: "other",
            folder: null,
            repository: null,
            counts: { ...emptyCounts(), inputTokens: 999, calls: 1 },
          },
        ],
      },
      new Date("2026-11-19T00:00:00Z"),
    );
    expect(report.days).toHaveLength(1);
    expect(report.days[0]).toMatchObject({
      workingMilliseconds: null,
      inputTokens: 0,
      outputTokens: null,
      inputTokenCalls: 1,
      calls: 2,
      aiCredits: 1.5,
      aiCreditCalls: 1,
    });
    expect(report.unattributed.inputTokens).toBe(999);
  });
  it("rejects invalid calendar dates, reversed/oversized ranges and oversized selections", () => {
    for (const query of [
      { start: "2026-02-30", end: "2026-03-01" },
      { start: "2026-11-19", end: "2026-11-18" },
      { start: "2025-01-01", end: "2026-11-18" },
      {
        start: "2026-11-18",
        end: "2026-11-18",
        agentId: Array.from({ length: 51 }, (_, n) => `${n}`),
      },
    ])
      expect(ReportQuery.safeParse(query).success).toBe(false);
  });
});
