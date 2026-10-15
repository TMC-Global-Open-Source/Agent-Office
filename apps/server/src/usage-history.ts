import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { UsageHistory, UsageSourceStatus } from "@agent-office/shared";
import { defaultVsCodeUserDataPath, readVsCodeUsage } from "./vscode-usage.js";

/** GitHub bills 1 AI credit as 1,000,000,000 nano AI units. */
export function nanoToCredits(nano: number | null): number | null {
  return nano === null ? null : nano / 1_000_000_000;
}

interface UsageRow {
  date: string;
  inputTokens: number | null;
  outputTokens: number | null;
  calls: number;
  callsWithTokenCounts: number;
  nanoAiu: number | null;
  aiCreditCalls: number;
}

type CliHistory = Omit<UsageHistory, "sources">;

function readCliHistory(path: string, now: Date): CliHistory {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const base: CliHistory = {
    available: false,
    message: "Copilot CLI local usage database was not found.",
    days: 30,
    since,
    asOf: now.toISOString(),
    source: "copilot-local-history",
    inputTokens: null,
    outputTokens: null,
    calls: 0,
    callsWithTokenCounts: 0,
    aiCredits: null,
    aiCreditCalls: 0,
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
    const credits = columns.some((column) => column.name === "total_nano_aiu");
    const rows = database
      .prepare(
        `
      SELECT date(created_at) AS date,
        SUM(input_tokens) AS inputTokens,
        SUM(output_tokens) AS outputTokens,
        COUNT(*) AS calls,
        SUM(CASE WHEN input_tokens IS NOT NULL OR output_tokens IS NOT NULL THEN 1 ELSE 0 END) AS callsWithTokenCounts,
        ${credits ? "SUM(total_nano_aiu)" : "NULL"} AS nanoAiu,
        ${credits ? "COUNT(total_nano_aiu)" : "0"} AS aiCreditCalls
      FROM assistant_usage_events
      WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) <= julianday(?)
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `,
      )
      .all(since, now.toISOString()) as UsageRow[];
    const sum = (key: "inputTokens" | "outputTokens" | "nanoAiu") => {
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
      aiCredits: nanoToCredits(sum("nanoAiu")),
      aiCreditCalls: rows.reduce((total, row) => total + row.aiCreditCalls, 0),
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

export function readUsageHistory(
  path = join(homedir(), ".copilot", "session-store.db"),
  now = new Date(),
  vscodePath: string | null = defaultVsCodeUserDataPath(),
): UsageHistory {
  const cli = readCliHistory(path, now);
  const cliStatus: UsageSourceStatus = {
    source: "copilot-cli",
    available: cli.available,
    message: cli.message,
    inputTokens: cli.inputTokens,
    outputTokens: cli.outputTokens,
    calls: cli.calls,
    aiCredits: cli.aiCredits,
    aiCreditCalls: cli.aiCreditCalls,
  };
  const vscodeStatus: UsageSourceStatus = {
    source: "vscode",
    available: false,
    message: "VS Code usage tracking is disabled.",
    inputTokens: null,
    outputTokens: null,
    calls: 0,
    aiCredits: null,
    aiCreditCalls: 0,
  };
  const daily = new Map(cli.daily.map((day) => [day.date, { ...day }]));
  let vscodeCallsWithCounts = 0;
  if (vscodePath !== null) {
    const vscode = readVsCodeUsage(new Date(cli.since), now, vscodePath);
    vscodeStatus.available = vscode.available;
    vscodeStatus.message = vscode.message;
    const add = (current: number | null, value: number | null) =>
      value === null ? current : (current ?? 0) + value;
    for (const request of vscode.sessions.flatMap((session) => session.requests)) {
      vscodeStatus.calls += 1;
      vscodeStatus.inputTokens = add(vscodeStatus.inputTokens, request.inputTokens);
      vscodeStatus.outputTokens = add(vscodeStatus.outputTokens, request.outputTokens);
      vscodeStatus.aiCredits = add(vscodeStatus.aiCredits, request.aiCredits);
      if (request.aiCredits !== null) vscodeStatus.aiCreditCalls += 1;
      if (request.inputTokens !== null || request.outputTokens !== null) vscodeCallsWithCounts += 1;
      const date = new Date(request.timestamp).toISOString().slice(0, 10);
      const day = daily.get(date) ?? { date, inputTokens: null, outputTokens: null, calls: 0 };
      day.inputTokens = add(day.inputTokens, request.inputTokens);
      day.outputTokens = add(day.outputTokens, request.outputTokens);
      day.calls += 1;
      daily.set(date, day);
    }
  }
  const sources = [cliStatus, vscodeStatus];
  const available = sources.some((source) => source.available);
  const sum = (key: "inputTokens" | "outputTokens" | "aiCredits") => {
    const values = sources.map((source) => source[key]).filter((value) => value !== null);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  return {
    ...cli,
    available,
    message: available
      ? "Recorded local Copilot CLI model calls plus VS Code chat requests; requests without recorded token counts are not included in token totals."
      : "No local Copilot CLI or VS Code usage history was found.",
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    calls: cli.calls + vscodeStatus.calls,
    callsWithTokenCounts: cli.callsWithTokenCounts + vscodeCallsWithCounts,
    aiCredits: sum("aiCredits"),
    aiCreditCalls: cli.aiCreditCalls + vscodeStatus.aiCreditCalls,
    sources,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
