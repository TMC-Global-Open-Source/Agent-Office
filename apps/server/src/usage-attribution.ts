import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stableAgentId } from "./providers/local-hooks.js";
import { defaultVsCodeUserDataPath, readVsCodeUsage } from "./vscode-usage.js";
import type {
  Agent,
  AgentTokenUsage,
  FolderUsage,
  TokenCounts,
  UsageAttribution,
  UsageSourceId,
  UsageSourceStatus,
} from "@agent-office/shared";

interface Row extends TokenCounts {
  sessionId: string;
  childId: string | null;
  parentCall: string | null;
  repository: string | null;
  cwd: string | null;
}

export const emptyCounts = (): TokenCounts => ({
  inputTokens: null,
  outputTokens: null,
  calls: 0,
  aiCredits: null,
  aiCreditCalls: 0,
});
export function addCounts(target: TokenCounts, row: TokenCounts) {
  target.aiCreditCalls += row.aiCreditCalls;
  for (const key of ["inputTokens", "outputTokens", "aiCredits"] as const) {
    if (row[key] !== null) target[key] = (target[key] ?? 0) + row[key];
  }
  target.calls += row.calls;
}
/** Matches the hook adapter, which labels desks with the basename of the session cwd. */
export function folderName(cwd: string | null | undefined): string | null {
  const name = cwd
    ?.trim()
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop();
  return name ? name.slice(0, 128) : null;
}

interface Usage {
  source: UsageSourceId;
  sessionId: string;
  folder: string | null;
  repository: string | null;
  /** Exact office agent ID this usage belongs to, if the identity is known and matched. */
  agentId: string | null;
  counts: TokenCounts;
}

function readCli(
  agents: Agent[],
  path: string,
  since: string,
  asOf: string,
): { status: UsageSourceStatus; usage: Usage[] } {
  const status: UsageSourceStatus = {
    ...emptyCounts(),
    source: "copilot-cli",
    available: false,
    message: "Copilot CLI local usage database was not found.",
  };
  if (!existsSync(path)) return { status, usage: [] };
  const db = new Database(path, { readonly: true, fileMustExist: true, timeout: 2000 });
  try {
    const columnsOf = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (column) => column.name,
      );
    const usageColumns = columnsOf("assistant_usage_events");
    const sessionColumns = columnsOf("sessions");
    if (
      ![
        "created_at",
        "session_id",
        "agent_id",
        "parent_tool_call_id",
        "input_tokens",
        "output_tokens",
      ].every((name) => usageColumns.includes(name)) ||
      !["id", "repository"].every((name) => sessionColumns.includes(name))
    ) {
      status.message =
        "This Copilot CLI database lacks the session identity schema required for attribution.";
      return { status, usage: [] };
    }
    const credits = usageColumns.includes("total_nano_aiu");
    const cwd = sessionColumns.includes("cwd");
    const rows = db
      .prepare(
        `
      SELECT u.session_id AS sessionId, u.agent_id AS childId,
        u.parent_tool_call_id AS parentCall, NULLIF(TRIM(s.repository), '') AS repository,
        ${cwd ? "s.cwd" : "NULL"} AS cwd,
        SUM(u.input_tokens) AS inputTokens, SUM(u.output_tokens) AS outputTokens, COUNT(*) AS calls,
        ${credits ? "SUM(u.total_nano_aiu) / 1000000000.0" : "NULL"} AS aiCredits,
        ${credits ? "COUNT(u.total_nano_aiu)" : "0"} AS aiCreditCalls
      FROM assistant_usage_events u LEFT JOIN sessions s ON s.id = u.session_id
      WHERE julianday(u.created_at) >= julianday(?) AND julianday(u.created_at) <= julianday(?)
      GROUP BY u.session_id, u.agent_id, u.parent_tool_call_id, s.repository${cwd ? ", s.cwd" : ""}
    `,
      )
      .all(since, asOf) as Row[];
    const known = new Map(
      agents
        .filter((agent) => agent.source === "local" && agent.metadata.runtime === "copilot-cli")
        .map((agent) => [agent.id, agent]),
    );
    const officeId = (session: string, child = "main") =>
      stableAgentId({ runtime: "copilot-cli", sessionId: session, subagentId: child });
    const usage = rows.map((row): Usage => {
      // A root session must never inherit child calls. Unknown child identities stay unattributed.
      const rootId = officeId(row.sessionId);
      const id = row.childId && row.parentCall ? officeId(row.sessionId, row.childId) : rootId;
      const candidate = known.get(id);
      const matches =
        candidate &&
        ((!row.childId && !row.parentCall && candidate.metadata.subagent !== true) ||
          (row.childId && row.parentCall && candidate.metadata.parentAgentId === rootId));
      const { inputTokens, outputTokens, calls, aiCredits, aiCreditCalls } = row;
      addCounts(status, row);
      return {
        source: "copilot-cli",
        sessionId: row.sessionId,
        folder: folderName(row.cwd),
        repository: row.repository,
        agentId: matches ? id : null,
        counts: { inputTokens, outputTokens, calls, aiCredits, aiCreditCalls },
      };
    });
    status.available = true;
    status.message = credits
      ? "Copilot CLI model calls; AI credits are recorded nano AI units ÷ 1,000,000,000."
      : "Copilot CLI model calls; this database version does not record AI credits.";
    return { status, usage };
  } finally {
    db.close();
  }
}

function readVsCode(
  agents: Agent[],
  path: string | null,
  since: string,
  asOf: string,
): { status: UsageSourceStatus; usage: Usage[] } {
  const status: UsageSourceStatus = {
    ...emptyCounts(),
    source: "vscode",
    available: false,
    message: "VS Code usage tracking is disabled.",
  };
  if (path === null) return { status, usage: [] };
  const result = readVsCodeUsage(new Date(since), new Date(asOf), path);
  status.available = result.available;
  status.message = result.message;
  const known = new Set(
    agents
      .filter(
        (agent) =>
          agent.source === "local" &&
          agent.metadata.runtime === "vscode" &&
          agent.metadata.subagent !== true,
      )
      .map((agent) => agent.id),
  );
  const usage = result.sessions.map((session): Usage => {
    const counts = emptyCounts();
    for (const request of session.requests) {
      addCounts(counts, {
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        calls: 1,
        aiCredits: request.aiCredits,
        aiCreditCalls: request.aiCredits === null ? 0 : 1,
      });
    }
    addCounts(status, counts);
    // VS Code hooks report the chat session ID, so a chat log maps to exactly one root agent.
    const id = stableAgentId({ runtime: "vscode", sessionId: session.sessionId });
    return {
      source: "vscode",
      sessionId: session.sessionId,
      folder: session.folder,
      repository: null,
      agentId: known.has(id) ? id : null,
      counts,
    };
  });
  return { status, usage };
}

export function readUsageAttribution(
  agents: Agent[],
  path = join(homedir(), ".copilot", "session-store.db"),
  now = new Date(),
  vscodePath: string | null = defaultVsCodeUserDataPath(),
): UsageAttribution {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const asOf = now.toISOString();
  const cli = readCli(agents, path, since, asOf);
  const vscode = readVsCode(agents, vscodePath, since, asOf);
  const sources = [cli.status, vscode.status];
  const unattributed = emptyCounts();
  const perAgent = new Map<string, AgentTokenUsage>();
  const folders = new Map<
    string | null,
    FolderUsage & { repositorySet: Set<string>; sourceSet: Set<UsageSourceId>; ids: Set<string> }
  >();
  for (const item of [...cli.usage, ...vscode.usage]) {
    const folder = folders.get(item.folder) ?? {
      ...emptyCounts(),
      folder: item.folder,
      repositories: [],
      sources: [],
      sessions: 0,
      repositorySet: new Set<string>(),
      sourceSet: new Set<UsageSourceId>(),
      ids: new Set<string>(),
    };
    addCounts(folder, item.counts);
    if (item.repository) folder.repositorySet.add(item.repository);
    folder.sourceSet.add(item.source);
    folder.ids.add(`${item.source}:${item.sessionId}`);
    folders.set(item.folder, folder);
    if (!item.agentId) {
      addCounts(unattributed, item.counts);
      continue;
    }
    const agent = perAgent.get(item.agentId) ?? {
      ...emptyCounts(),
      agentId: item.agentId,
      folder: item.folder,
      repository: item.repository,
    };
    addCounts(agent, item.counts);
    perAgent.set(item.agentId, agent);
  }
  const available = sources.some((source) => source.available);
  return {
    available,
    message: available
      ? "Last 30 days, grouped by workspace folder (the name above each desk). Copilot CLI usage is matched by exact session/child identity; VS Code usage by exact chat session ID. Unmatched usage is never guessed. Input + output excludes cache-token counters."
      : "No local Copilot CLI or VS Code usage history was found.",
    since,
    asOf,
    sources,
    unattributed,
    agents: [...perAgent.values()].sort((a, b) => a.agentId.localeCompare(b.agentId)),
    folders: [...folders.values()]
      .map(({ repositorySet, sourceSet, ids, ...folder }) => ({
        ...folder,
        repositories: [...repositorySet].sort(),
        sources: [...sourceSet].sort(),
        sessions: ids.size,
      }))
      .sort(
        (a, b) =>
          (b.aiCredits ?? 0) - (a.aiCredits ?? 0) || (a.folder ?? "").localeCompare(b.folder ?? ""),
      ),
  };
}
