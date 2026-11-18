import { afterAll, beforeAll, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import request from "supertest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server: typeof import("../src/app.js");
let folder: string;
const token = "report-api-test-token-with-at-least-32-characters";
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "office-local-report-"));
  const path = join(folder, "office.db");
  const db = new Database(path);
  const migrations = new URL("../prisma/migrations/", import.meta.url);
  for (const migration of readdirSync(migrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    db.exec(readFileSync(new URL(`${migration.name}/migration.sql`, migrations), "utf8"));
  }
  db.close();
  vi.stubEnv("DATABASE_URL", `file:${path}`);
  vi.stubEnv("AGENT_PROVIDER", "local");
  vi.stubEnv("AGENT_OFFICE_HOOK_TOKEN", token);
  vi.stubEnv("COPILOT_USAGE_DB_PATH", join(folder, "missing-usage.db"));
  vi.stubEnv("VSCODE_USAGE_TRACKING", "false");
  server = await import("../src/app.js");
});
afterAll(async () => {
  await server?.prisma.$disconnect();
  vi.unstubAllEnvs();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

it("records authenticated lifecycle hooks durably and reports the same exact agent after turn stop", async () => {
  const send = (event: string) =>
    request(server.app)
      .post("/api/v1/local/hooks")
      .set("Authorization", `Bearer ${token}`)
      .send({
        event,
        runtime: "copilot-cli",
        sessionId: "report-route-test",
        workspace: "workspace",
        timestamp: new Date().toISOString(),
      });
  await request(server.app).post("/api/v1/local/hooks").send({}).expect(401);
  await send("sessionStart").expect(200);
  expect((await server.prisma.agentRunState.findFirstOrThrow()).working).toBe(false);
  await send("userPromptSubmitted").expect(200);
  const state = await server.prisma.agentRunState.findFirstOrThrow();
  expect(state.working).toBe(true);
  await send("agentStop").expect(200);
  expect((await server.prisma.agentRunState.findFirstOrThrow()).working).toBe(false);
  const intervals = await server.prisma.agentWorkingInterval.findMany();
  expect(intervals).toHaveLength(1);
  const elapsed = intervals[0]!.endedAt.getTime() - intervals[0]!.startedAt.getTime();
  expect(elapsed).toBeGreaterThan(0);
  const date = intervals[0]!.startedAt.toISOString().slice(0, 10);
  const response = await request(server.app)
    .get("/api/v1/reports/agents")
    .query({ start: date, end: date, agentId: state.agentId })
    .expect(200);
  expect(response.body.data.days).toMatchObject([
    {
      agentId: state.agentId,
      workingMilliseconds: elapsed,
      inputTokens: null,
      aiCredits: null,
    },
  ]);
  expect(
    response.body.data.sources.every((source: { available: boolean }) => !source.available),
  ).toBe(true);
  expect(JSON.stringify(response.body)).not.toContain("report-route-test");
  expect(JSON.stringify(response.body)).not.toContain(token);
});
