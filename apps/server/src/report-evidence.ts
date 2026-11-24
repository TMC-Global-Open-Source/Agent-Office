import Database from "better-sqlite3";
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Agent } from "@agent-office/shared";
import { stableAgentId } from "./providers/local-hooks.js";
import { parseUsageTimestamp, reportDate } from "./report-time.js";
import type { AttributedUsage } from "./usage-attribution.js";
import { readVsCodeUsage } from "./vscode-usage.js";

export interface EstimatedInterval {
  agentId: string;
  start: number;
  end: number;
}

interface Call {
  session: string;
  child: string | null;
  parent: string | null;
  model: string;
  time: number;
  input: number | null;
  output: number | null;
  credits: number | null;
  duration: number | null;
}

const number = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.length ? value : null;
const cap = 20 * 60_000;

function cliAgent(agents: Map<string, Agent>, row: Call): string | null {
  const root = stableAgentId({ runtime: "copilot-cli", sessionId: row.session });
  const id =
    row.child && row.parent
      ? stableAgentId({ runtime: "copilot-cli", sessionId: row.session, subagentId: row.child })
      : root;
  const agent = agents.get(id);
  if (!agent || agent.source !== "local" || agent.metadata.runtime !== "copilot-cli") return null;
  if (!row.child && !row.parent && agent.metadata.subagent !== true) return id;
  if (row.child && row.parent && agent.metadata.parentAgentId === root) return id;
  return null;
}

/**
 * Conservatively reconcile logs against individual database calls. Only unmatched records with
 * stable IDs are added. Ambiguous candidates are excluded rather than risking duplicate charges.
 */
export function readReportEvidence(
  agents: Agent[],
  databasePath: string,
  vscodePath: string | null,
  since: string,
  until: string,
  timeZone: string,
) {
  const recovered: AttributedUsage[] = [];
  const intervals: EstimatedInterval[] = [];
  const notes: string[] = [];
  const start = Date.parse(since);
  const end = Date.parse(until);
  const known = new Map(agents.map((agent) => [agent.id, agent]));
  if (vscodePath !== null && end >= start) {
    const vs = readVsCodeUsage(new Date(start - cap), new Date(end), vscodePath);
    for (const session of vs.sessions) {
      const id = stableAgentId({ runtime: "vscode", sessionId: session.sessionId });
      const agent = known.get(id);
      if (
        !agent ||
        agent.source !== "local" ||
        agent.metadata.runtime !== "vscode" ||
        agent.metadata.subagent === true
      )
        continue;
      for (const request of session.requests) {
        const duration = number(request.durationMs);
        if (duration)
          intervals.push({
            agentId: id,
            start: request.timestamp,
            end: request.timestamp + Math.min(duration, cap),
          });
      }
    }
  }
  if (!existsSync(databasePath)) {
    notes.push(
      "CLI database unavailable; session-log recovery and CLI runtime estimates were not attempted.",
    );
    return { recovered, intervals, notes };
  }
  const db = new Database(databasePath, { readonly: true, fileMustExist: true, timeout: 2000 });
  try {
    const columns = new Set(
      (
        db.prepare("PRAGMA table_info(assistant_usage_events)").all() as Array<{ name: string }>
      ).map((column) => column.name),
    );
    const required = [
      "session_id",
      "agent_id",
      "parent_tool_call_id",
      "created_at",
      "model",
      "input_tokens",
      "output_tokens",
    ];
    if (!required.every((column) => columns.has(column))) {
      notes.push(
        "CLI database lacks fields required for safe log reconciliation and runtime estimates.",
      );
      return { recovered, intervals, notes };
    }
    const optional = (column: string) => (columns.has(column) ? column : `NULL AS ${column}`);
    const rows = db
      .prepare(
        `SELECT session_id, agent_id, parent_tool_call_id, model, created_at,
      input_tokens, output_tokens, ${optional("total_nano_aiu")}, ${optional("duration_ms")}
      FROM assistant_usage_events
      WHERE julianday(created_at) >= julianday(?) AND julianday(created_at) <= julianday(?)
      LIMIT 50001`,
      )
      .all(
        new Date(start - 1000).toISOString(),
        new Date(end + cap + 1000).toISOString(),
      ) as Array<{
      session_id: string;
      agent_id: string | null;
      parent_tool_call_id: string | null;
      model: string;
      created_at: string;
      input_tokens: number | null;
      output_tokens: number | null;
      total_nano_aiu: number | null;
      duration_ms: number | null;
    }>;
    if (rows.length > 50_000) {
      notes.push(
        "CLI evidence exceeded the 50,000-call limit; recovery and CLI estimates were skipped.",
      );
      return { recovered, intervals, notes };
    }
    const stored: Call[] = rows.map((row) => ({
      session: row.session_id,
      child: text(row.agent_id),
      parent: text(row.parent_tool_call_id),
      model: row.model,
      time: parseUsageTimestamp(row.created_at),
      input: number(row.input_tokens),
      output: number(row.output_tokens),
      credits: number(row.total_nano_aiu),
      duration: number(row.duration_ms),
    }));
    const addInterval = (row: Call) => {
      const agentId = cliAgent(known, row);
      if (agentId && row.duration && Number.isFinite(row.time))
        intervals.push({ agentId, start: row.time - Math.min(row.duration, cap), end: row.time });
    };
    stored.forEach(addInterval);
    if (!columns.has("duration_ms"))
      notes.push("This CLI database has no recorded model durations.");
    const state = join(dirname(databasePath), "session-state");
    if (!existsSync(state)) {
      notes.push("CLI session event logs were not found; usage recovery is unavailable.");
      return { recovered, intervals, notes };
    }
    const indexed = new Map<string, Call[]>();
    for (const row of stored) {
      const list = indexed.get(row.session) ?? [];
      list.push(row);
      indexed.set(row.session, list);
    }
    let bytes = 0;
    let skipped = 0;
    let uncertain = 0;
    let work = 0;
    let files = 0;
    const seen = new Set<string>();
    const logs: Call[] = [];
    const filesToScan: Array<{ name: string; path: string; size: number; modified: number }> = [];
    for (const entry of readdirSync(state, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[A-Za-z0-9_-]+$/.test(entry.name)) continue;
      const path = join(state, entry.name, "events.jsonl");
      try {
        if (!existsSync(path)) continue;
        const stats = statSync(path);
        filesToScan.push({ name: entry.name, path, size: stats.size, modified: stats.mtimeMs });
      } catch {
        skipped++;
      }
    }
    filesToScan.sort((a, b) => {
      const bySession = Number(indexed.has(b.name)) - Number(indexed.has(a.name));
      if (bySession) return bySession;
      const aDistance = a.modified < start ? Number.MAX_SAFE_INTEGER : Math.abs(a.modified - end);
      const bDistance = b.modified < start ? Number.MAX_SAFE_INTEGER : Math.abs(b.modified - end);
      return aDistance - bDistance || b.modified - a.modified || a.name.localeCompare(b.name);
    });
    for (const file of filesToScan) {
      try {
        if (++files > 1000) {
          skipped++;
          continue;
        }
        const { path, size } = file;
        const length = Math.min(size, 8 * 1024 * 1024, 64 * 1024 * 1024 - bytes);
        if (length === 0 && size > 0) {
          skipped++;
          continue;
        }
        if (length < size) skipped++;
        const offset = size - length;
        const buffer = Buffer.alloc(length);
        const fd = openSync(path, "r");
        let actual: number;
        try {
          actual = readSync(fd, buffer, 0, length, offset);
        } finally {
          closeSync(fd);
        }
        bytes += actual;
        let content = buffer.subarray(0, actual).toString("utf8");
        if (offset > 0) {
          const newline = content.indexOf("\n");
          content = newline === -1 ? "" : content.slice(newline + 1);
        }
        for (const line of content.split(/\r?\n/)) {
          if (!line.includes("session.usage_record")) continue;
          if (line.length > 1_000_000) {
            uncertain++;
            continue;
          }
          let event: {
            id?: unknown;
            timestamp?: unknown;
            agentId?: unknown;
            type?: unknown;
            data?: {
              usage?: {
                apiCallId?: unknown;
                parentToolCallId?: unknown;
                model?: unknown;
                inputTokens?: unknown;
                outputTokens?: unknown;
                duration?: unknown;
                copilotUsage?: { totalNanoAiu?: unknown };
              };
            };
          };
          try {
            event = JSON.parse(line) as typeof event;
          } catch {
            uncertain++;
            continue;
          }
          const usage = event.data?.usage;
          if (event.type !== "session.usage_record" || !usage) continue;
          if (logs.length >= 50_000) {
            skipped++;
            break;
          }
          const timestamp = text(event.timestamp);
          const model = text(usage.model);
          const time = timestamp ? parseUsageTimestamp(timestamp) : NaN;
          if (!model || !Number.isFinite(time)) {
            uncertain++;
            continue;
          }
          if (time < start - 1000 || time > end + cap + 1000) continue;
          const id = text(usage.apiCallId) ?? text(event.id);
          if (!id) {
            uncertain++;
            continue;
          }
          const key = `${file.name}:${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          logs.push({
            session: file.name,
            child: text(event.agentId),
            parent: text(usage.parentToolCallId),
            model,
            time,
            input: number(usage.inputTokens),
            output: number(usage.outputTokens),
            credits: number(usage.copilotUsage?.totalNanoAiu),
            duration: number(usage.duration),
          });
        }
      } catch {
        skipped++;
      }
    }
    const candidates = logs.map((row) => {
      const list: Call[] = [];
      for (const candidate of indexed.get(row.session) ?? []) {
        if (++work > 200_000) return null;
        if (
          candidate.model === row.model &&
          Math.abs(candidate.time - row.time) <= 1000 &&
          candidate.child === row.child &&
          candidate.parent === row.parent &&
          (candidate.input === null || row.input === null || candidate.input === row.input) &&
          (candidate.output === null || row.output === null || candidate.output === row.output) &&
          (candidate.credits === null || row.credits === null || candidate.credits === row.credits)
        )
          list.push(candidate);
      }
      return list;
    });
    if (candidates.some((matches) => matches === null)) {
      notes.push("CLI log matching exceeded its safety limit; recovered calls were not added.");
      return { recovered, intervals, notes };
    }
    const claims = new Map<Call, number>();
    for (const matches of candidates)
      for (const row of matches ?? []) claims.set(row, (claims.get(row) ?? 0) + 1);
    for (let index = 0; index < logs.length; index++) {
      const row = logs[index]!;
      const matches = candidates[index]!;
      if (matches.length > 1 || matches.some((match) => (claims.get(match) ?? 0) > 1)) {
        uncertain++;
        continue;
      }
      if (matches.length === 1) {
        if (matches[0]!.duration === null) addInterval(row);
        continue;
      }
      // A same-model call at the same instant with conflicting fields is not safely distinguishable.
      if (
        (indexed.get(row.session) ?? []).some(
          (candidate) =>
            candidate.model === row.model && Math.abs(candidate.time - row.time) <= 1000,
        )
      ) {
        uncertain++;
        continue;
      }
      addInterval(row);
      if (row.time < start || row.time > end) continue;
      const agentId = cliAgent(known, row);
      recovered.push({
        date: reportDate(row.time, timeZone),
        source: "copilot-cli",
        sessionId: row.session,
        folder: null,
        repository: null,
        agentId,
        inputTokenCalls: row.input === null ? 0 : 1,
        outputTokenCalls: row.output === null ? 0 : 1,
        counts: {
          inputTokens: row.input,
          outputTokens: row.output,
          calls: 1,
          aiCredits: row.credits === null ? null : row.credits / 1_000_000_000,
          aiCreditCalls: row.credits === null ? 0 : 1,
        },
      });
    }
    if (skipped)
      notes.push(
        `${skipped} session log(s) were inaccessible or only partially scanned because of limits; recovery is incomplete.`,
      );
    if (uncertain) notes.push(`${uncertain} ambiguous or invalid session record(s) were excluded.`);
    notes.push(
      `${recovered.length} additional call(s) recovered from logs; reconciliation is an estimate, not a billing total.`,
    );
    return { recovered, intervals, notes };
  } finally {
    db.close();
  }
}
