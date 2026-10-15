import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/** Only these numeric/metadata fields are ever retained from a VS Code chat request. */
interface VsCodeRequest {
  timestamp: number;
  inputTokens: number | null;
  outputTokens: number | null;
  aiCredits: number | null;
}

export interface VsCodeSessionUsage {
  sessionId: string;
  folder: string | null;
  requests: VsCodeRequest[];
}

export interface VsCodeUsage {
  available: boolean;
  message: string;
  sessions: VsCodeSessionUsage[];
}

const cache = new Map<string, { mtimeMs: number; size: number; requests: VsCodeRequest[] }>();

export function defaultVsCodeUserDataPath(): string {
  if (process.platform === "win32")
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Code", "User");
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "Code", "User");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Code", "User");
}

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const fields = {
  timestamp: "timestamp",
  promptTokens: "inputTokens",
  completionTokens: "outputTokens",
  copilotCredits: "aiCredits",
} as const;
type Partial = { [K in keyof VsCodeRequest]?: number | null };

function pick(value: unknown): Partial {
  const picked: Partial = {};
  if (!value || typeof value !== "object") return picked;
  for (const [source, target] of Object.entries(fields)) {
    if (source in value) picked[target] = finite((value as Record<string, unknown>)[source]);
  }
  return picked;
}

/**
 * Parses a VS Code chatSessions JSONL operation log. Records are an initial snapshot (kind 0),
 * property sets (kind 1), and array pushes (kind 2, with optional truncate index `i`). Prompt and
 * response content is discarded immediately; only timestamp, token, and credit numbers are kept.
 */
export function parseChatSessionLog(text: string): VsCodeRequest[] {
  let requests: Partial[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    let record: { kind?: unknown; k?: unknown; v?: unknown; i?: unknown };
    try {
      record = JSON.parse(line) as typeof record;
    } catch {
      continue;
    }
    if (record.kind === 0) {
      const initial = (record.v as { requests?: unknown } | undefined)?.requests;
      requests = Array.isArray(initial) ? initial.map(pick) : [];
      continue;
    }
    const path = record.k;
    if (!Array.isArray(path) || path[0] !== "requests") continue;
    if (path.length === 1 && Array.isArray(record.v)) {
      if (record.kind === 2) {
        if (typeof record.i === "number" && record.i >= 0) requests.length = record.i;
        requests.push(...record.v.map(pick));
      } else if (record.kind === 1) {
        requests = record.v.map(pick);
      }
      continue;
    }
    const index = path[1];
    if (record.kind !== 1 || typeof index !== "number" || index < 0) continue;
    if (path.length === 2) {
      requests[index] = pick(record.v);
    } else if (path.length === 3 && typeof path[2] === "string" && path[2] in fields) {
      const target = fields[path[2] as keyof typeof fields];
      requests[index] = { ...requests[index], [target]: finite(record.v) };
    }
  }
  return requests
    .filter((request): request is Partial & { timestamp: number } => request?.timestamp != null)
    .map((request) => ({
      timestamp: request.timestamp,
      inputTokens: request.inputTokens ?? null,
      outputTokens: request.outputTokens ?? null,
      aiCredits: request.aiCredits ?? null,
    }));
}

function workspaceFolder(storageDirectory: string): string | null {
  try {
    const descriptor = JSON.parse(
      readFileSync(join(storageDirectory, "workspace.json"), "utf8"),
    ) as { folder?: unknown; workspace?: unknown };
    const uri =
      typeof descriptor.folder === "string"
        ? descriptor.folder
        : typeof descriptor.workspace === "string"
          ? descriptor.workspace
          : null;
    if (!uri) return null;
    const pathname = decodeURIComponent(new URL(uri).pathname).replace(/[\\/]+$/, "");
    const name = basename(pathname).replace(/\.code-workspace$/i, "");
    return name.slice(0, 128) || null;
  } catch {
    return null;
  }
}

function readLog(file: string, sinceMs: number): VsCodeRequest[] | null {
  const stats = statSync(file);
  if (stats.mtimeMs < sinceMs) return null;
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size)
    return cached.requests;
  const requests = parseChatSessionLog(readFileSync(file, "utf8"));
  cache.set(file, { mtimeMs: stats.mtimeMs, size: stats.size, requests });
  return requests;
}

export function readVsCodeUsage(
  since: Date,
  until: Date,
  userDataPath = defaultVsCodeUserDataPath(),
): VsCodeUsage {
  const storage = join(userDataPath, "workspaceStorage");
  const empty = join(userDataPath, "globalStorage", "emptyWindowChatSessions");
  if (!existsSync(storage) && !existsSync(empty)) {
    return {
      available: false,
      message: "VS Code chat session history was not found.",
      sessions: [],
    };
  }
  const sinceMs = since.getTime();
  const untilMs = until.getTime();
  const directories: Array<{ directory: string; folder: string | null }> = [];
  if (existsSync(storage)) {
    for (const entry of readdirSync(storage, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const chats = join(storage, entry.name, "chatSessions");
      if (existsSync(chats))
        directories.push({ directory: chats, folder: workspaceFolder(join(storage, entry.name)) });
    }
  }
  if (existsSync(empty)) directories.push({ directory: empty, folder: null });
  const sessions: VsCodeSessionUsage[] = [];
  let unreadable = 0;
  for (const { directory, folder } of directories) {
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".jsonl")) continue;
      let requests: VsCodeRequest[] | null;
      try {
        requests = readLog(join(directory, name), sinceMs);
      } catch {
        unreadable += 1;
        continue;
      }
      const inWindow = (requests ?? []).filter(
        (request) => request.timestamp >= sinceMs && request.timestamp <= untilMs,
      );
      if (inWindow.length)
        sessions.push({ sessionId: name.slice(0, -".jsonl".length), folder, requests: inWindow });
    }
  }
  return {
    available: true,
    message: `VS Code chat requests from local chatSessions logs${
      unreadable ? `; ${unreadable} log(s) could not be read` : ""
    }. Each VS Code request may include several model calls; legacy .json chat logs carry no credits and are skipped.`,
    sessions,
  };
}
