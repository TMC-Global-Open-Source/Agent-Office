import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readUsageHistory } from "../src/usage-history.js";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "agent-office-usage-"));
  paths.push(folder);
  const path = join(folder, "usage.db");
  const database = new Database(path);
  return { path, database };
}

describe("independent local usage history", () => {
  it("reads only the last 30 days and distinguishes zero from missing counts", () => {
    const { path, database } = fixture();
    database.exec(
      "CREATE TABLE assistant_usage_events (created_at TEXT, input_tokens INTEGER, output_tokens INTEGER)",
    );
    const insert = database.prepare("INSERT INTO assistant_usage_events VALUES (?, ?, ?)");
    insert.run("2026-10-01 10:00:00", 100, 20);
    insert.run("2026-10-01T11:00:00.000Z", 0, 0);
    insert.run("2026-10-02 10:00:00", null, null);
    insert.run("2026-08-01 10:00:00", 999, 999);
    insert.run("2026-11-01 10:00:00", 999, 999);
    database.close();
    const result = readUsageHistory(path, new Date("2026-10-14T00:00:00Z"), null);
    expect(result.available).toBe(true);
    expect(result.calls).toBe(3);
    expect(result.callsWithTokenCounts).toBe(2);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(20);
    expect(result.daily[1]?.inputTokens).toBeNull();
    expect(result.aiCredits).toBeNull();
    expect(result.aiCreditCalls).toBe(0);
    const verify = new Database(path, { readonly: true });
    expect(verify.prepare("SELECT COUNT(*) AS count FROM assistant_usage_events").get()).toEqual({
      count: 5,
    });
    verify.close();
  });

  it("converts recorded nano AI units to AI credits", () => {
    const { path, database } = fixture();
    database.exec(
      "CREATE TABLE assistant_usage_events (created_at TEXT, input_tokens INTEGER, output_tokens INTEGER, total_nano_aiu INTEGER)",
    );
    const insert = database.prepare("INSERT INTO assistant_usage_events VALUES (?, ?, ?, ?)");
    insert.run("2026-10-01 10:00:00", 1, 1, 2_000_000_000);
    insert.run("2026-10-02 10:00:00", 1, 1, 500_000_000);
    insert.run("2026-10-02 11:00:00", 1, 1, null);
    database.close();
    const result = readUsageHistory(path, new Date("2026-10-14T00:00:00Z"), null);
    expect(result.aiCredits).toBe(2.5);
    expect(result.aiCreditCalls).toBe(2);
    expect(result.calls).toBe(3);
  });

  it("returns explicit unavailable results for a missing database or incompatible schema", () => {
    const { path, database } = fixture();
    database.close();
    expect(readUsageHistory(path, undefined, null).available).toBe(false);
    const missing = readUsageHistory(join(path, "missing.db"), undefined, null);
    expect(missing.available).toBe(false);
    expect(missing.inputTokens).toBeNull();
  });
});
