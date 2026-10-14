import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { UsageHistory } from "@agent-office/shared";

interface UsageRow {
  date: string;
  inputTokens: number | null;
  outputTokens: number | null;
  calls: number;
  callsWithTokenCounts: number;
}

export function readUsageHistory(
  path = join(homedir(), ".copilot", "session-store.db"),
  now = new Date(),
): UsageHistory {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const base: UsageHistory = {
    available: false,
    message: "Copilot local usage history database was not found.",
    days: 30,
    since,
    asOf: now.toISOString(),
    source: "copilot-local-history",
    inputTokens: null,
    outputTokens: null,
    calls: 0,
    callsWithTokenCounts: 0,
    daily: [],
  };
  if (!existsSync(path)) return base;
  const database = new Database(path, { readonly: true, fileMustExist: true, timeout: 2000 });
  try {
    const columns = database.prepare("PRAGMA table_info(assistant_usage_events)").all() as Array<{
      name: string;
    }>;
    if (
      !["created_at", "input_tokens", "output_tokens"].every((name) =>
        columns.some((column) => column.name === name),
      )
    ) {
      return {
        ...base,
        message: "This Copilot database does not expose the expected token usage schema.",
      };
    }
    const rows = database
      .prepare(
        `
      SELECT date(created_at) AS date,
        SUM(input_tokens) AS inputTokens,
        SUM(output_tokens) AS outputTokens,
        COUNT(*) AS calls,
        SUM(CASE WHEN input_tokens IS NOT NULL OR output_tokens IS NOT NULL THEN 1 ELSE 0 END) AS callsWithTokenCounts
      FROM assistant_usage_events
      WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) <= julianday(?)
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `,
      )
      .all(since, now.toISOString()) as UsageRow[];
    const sum = (key: "inputTokens" | "outputTokens") => {
      const counts = rows.map((row) => row[key]).filter((value): value is number => value !== null);
      return counts.length ? counts.reduce((total, value) => total + value, 0) : null;
    };
    return {
      ...base,
      available: true,
      message: rows.length
        ? "Recorded local Copilot usage; sessions without recorded token counts are not included in token totals."
        : "No local Copilot usage events were recorded in the last 30 days.",
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
      calls: rows.reduce((total, row) => total + row.calls, 0),
      callsWithTokenCounts: rows.reduce((total, row) => total + row.callsWithTokenCounts, 0),
      daily: rows.map(({ date, inputTokens, outputTokens, calls }) => ({
        date,
        inputTokens,
        outputTokens,
        calls,
      })),
    };
  } finally {
    database.close();
  }
}
