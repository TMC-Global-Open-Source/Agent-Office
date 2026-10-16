import { createHash } from "node:crypto";
import { basename } from "node:path";
import type {
  Agent,
  AgentActivity,
  AgentState,
  AppConfig,
  ProviderHealth,
} from "@agent-office/shared";
import {
  hexAvatarColor,
  activityForTool,
  officeActivityLabels,
  type OfficeActivity,
} from "@agent-office/shared";
import { z } from "zod";
import type { AgentProvider } from "./types.js";
import {
  GhUnavailableError,
  nextPullRequestMetadata,
  readPullRequestMetadata,
  type PullRequestLookup,
} from "./pull-request-watch.js";

const pullRequestEvents = new Set(["postToolUse", "agentStop", "sessionEnd"]);
const minimumPullRequestGapMs = 15_000;

const LocalHookEventSchema = z.object({
  event: z.enum([
    "sessionStart",
    "userPromptSubmitted",
    "preToolUse",
    "postToolUse",
    "agentStop",
    "sessionEnd",
    "subagentStart",
    "subagentStop",
    "preCompact",
    "postToolUseFailure",
    "errorOccurred",
  ]),
  runtime: z.enum(["copilot-cli", "vscode"]),
  sessionId: z.string().min(1).max(512),
  timestamp: z.string().datetime(),
  workspace: z.string().min(1).max(128),
  tokensUsed: z.number().int().min(0).max(2_147_483_647).optional(),
  reason: z.string().max(40).optional(),
  subagentId: z.string().max(256).optional(),
  subagentType: z.string().max(128).optional(),
  toolName: z.string().max(128).optional(),
  /** Session folder; kept in server memory only so `gh` can look up the branch's pull request. */
  cwd: z.string().max(1024).optional(),
});
export type LocalHookEvent = z.infer<typeof LocalHookEventSchema>;

const runtimeNames = {
  "copilot-cli": "Copilot CLI",
  vscode: "VS Code Copilot",
} as const;

export function stableAgentId(
  event: Pick<LocalHookEvent, "runtime" | "sessionId" | "subagentId">,
): string {
  const identity = `${event.runtime}:${event.sessionId}:${event.subagentId ?? "main"}`;
  return `local:${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function statusFor(event: LocalHookEvent): AgentState {
  switch (event.event) {
    case "sessionStart":
    case "userPromptSubmitted":
    case "preToolUse":
    case "postToolUse":
    case "subagentStart":
    case "preCompact":
    case "postToolUseFailure":
    case "errorOccurred":
      return "working";
    case "agentStop":
    case "subagentStop":
      return "needs_attention";
    case "sessionEnd":
      return event.reason === "complete"
        ? "completed"
        : event.reason === "error" || event.reason === "timeout"
          ? "failed"
          : "offline";
  }
}

export class LocalHooksProvider implements AgentProvider {
  readonly name = "local" as const;
  private readonly agents = new Map<string, Agent>();
  private readonly activity = new Map<string, AgentActivity[]>();
  private offlineThresholdMinutes = 60;
  private idleDelaySeconds = 20;
  private lastEventAt: string | null = null;
  private readonly workspacePaths = new Map<string, string>();
  private readonly pullRequestDue = new Map<string, number>();
  private readonly pullRequestCheckedAt = new Map<string, number>();
  private pullRequestLookup: PullRequestLookup | null = null;
  private pullRequestIntervalMs = 60_000;
  private pullRequestTimer: ReturnType<typeof setTimeout> | null = null;
  private pullRequestRun: Promise<boolean> | null = null;
  /** Called after a background pull request check changes an agent. */
  onPullRequestChange: (() => void) | null = null;

  /** Enables merge detection; pass null or a zero interval to disable it. */
  watchPullRequests(lookup: PullRequestLookup | null, intervalSeconds: number): void {
    this.pullRequestLookup = intervalSeconds > 0 ? lookup : null;
    this.pullRequestIntervalMs = intervalSeconds * 1000;
    if (!this.pullRequestLookup && this.pullRequestTimer) {
      clearTimeout(this.pullRequestTimer);
      this.pullRequestTimer = null;
    }
  }

  private schedulePullRequestCheck(agentId: string, delayMs: number): void {
    if (!this.pullRequestLookup || !this.workspacePaths.has(agentId)) return;
    const checkedAt = this.pullRequestCheckedAt.get(agentId) ?? -Infinity;
    const due = Math.max(Date.now() + delayMs, checkedAt + minimumPullRequestGapMs);
    this.pullRequestDue.set(agentId, Math.min(this.pullRequestDue.get(agentId) ?? due, due));
    this.armPullRequestTimer();
  }

  private armPullRequestTimer(): void {
    if (this.pullRequestTimer) clearTimeout(this.pullRequestTimer);
    this.pullRequestTimer = null;
    if (!this.pullRequestLookup || !this.pullRequestDue.size) return;
    const next = Math.min(...this.pullRequestDue.values());
    this.pullRequestTimer = setTimeout(
      () => {
        this.pullRequestTimer = null;
        void this.checkPullRequests().then((changed) => {
          if (changed) this.onPullRequestChange?.();
          this.armPullRequestTimer();
        });
      },
      Math.max(0, next - Date.now()),
    );
    this.pullRequestTimer.unref?.();
  }

  /** Looks up due agents' branch pull requests; resolves true when any agent changed. */
  checkPullRequests(now = Date.now()): Promise<boolean> {
    if (this.pullRequestRun) return this.pullRequestRun;
    const run = this.runPullRequestChecks(now).finally(() => {
      if (this.pullRequestRun === run) this.pullRequestRun = null;
    });
    this.pullRequestRun = run;
    return run;
  }

  private async runPullRequestChecks(now: number): Promise<boolean> {
    const lookup = this.pullRequestLookup;
    if (!lookup) return false;
    let changed = false;
    for (const [id, cwd] of this.workspacePaths) {
      const agent = this.agents.get(id);
      if (!agent || agent.status === "offline") {
        this.pullRequestDue.delete(id);
        continue;
      }
      const due = this.pullRequestDue.get(id) ?? 0;
      if (due > now) continue;
      this.pullRequestDue.set(id, now + this.pullRequestIntervalMs);
      this.pullRequestCheckedAt.set(id, now);
      let info;
      try {
        info = await lookup(cwd);
      } catch (error) {
        if (error instanceof GhUnavailableError) {
          console.warn(`${error.message} Pull request merge celebrations are disabled.`);
          this.pullRequestLookup = null;
          return changed;
        }
        continue;
      }
      if (!info) continue;
      const current = this.agents.get(id);
      if (!current) continue;
      const previous = readPullRequestMetadata(current.metadata.pullRequest);
      const pullRequest = nextPullRequestMetadata(previous, info, Date.now());
      if (
        previous &&
        previous.number === pullRequest.number &&
        previous.state === pullRequest.state &&
        previous.url === pullRequest.url &&
        previous.celebrationAt === pullRequest.celebrationAt
      )
        continue;
      const observedAt = new Date().toISOString();
      const summary =
        pullRequest.state === "MERGED"
          ? `Pull request #${pullRequest.number} merged.`
          : pullRequest.state === "OPEN"
            ? `Pull request #${pullRequest.number} is open.`
            : `Pull request #${pullRequest.number} closed.`;
      this.agents.set(id, {
        ...current,
        pullRequestNumber: pullRequest.number,
        taskUrl: pullRequest.url ?? current.taskUrl,
        metadata: { ...current.metadata, pullRequest },
        updatedAt: observedAt,
      });
      const items = this.activity.get(id) ?? [];
      items.unshift({
        id: `${id}:pull-request:${pullRequest.number}:${pullRequest.state}`,
        agentId: id,
        kind: "pull-request",
        summary,
        occurredAt: observedAt,
        url: pullRequest.url,
      });
      this.activity.set(id, items.slice(0, 50));
      changed = true;
    }
    return changed;
  }

  health(): ProviderHealth {
    return {
      provider: "local",
      healthy: true,
      stale: false,
      message: this.lastEventAt
        ? "Receiving local Copilot lifecycle events."
        : "Waiting for local Copilot hooks.",
      lastSuccessAt: this.lastEventAt,
      rateLimitResetAt: null,
    };
  }

  updateConfig(config: AppConfig): void {
    this.offlineThresholdMinutes = config.offlineThresholdMinutes;
    this.idleDelaySeconds = config.idleDelaySeconds;
  }

  hydrate(agents: Agent[]): void {
    for (const agent of agents) {
      if (agent.source === "local") {
        this.agents.set(agent.id, agent);
        if (
          agent.lastActivityAt &&
          (!this.lastEventAt || agent.lastActivityAt > this.lastEventAt)
        ) {
          this.lastEventAt = agent.lastActivityAt;
        }
      }
    }
  }

  recordEvent(input: unknown): Agent {
    const event = LocalHookEventSchema.parse(input);
    const id = stableAgentId(event);
    const parentId = stableAgentId({ ...event, subagentId: undefined });
    if (event.subagentId && (event.event === "subagentStart" || !this.agents.has(parentId))) {
      this.recordEvent({
        ...event,
        event: "subagentStart",
        subagentId: undefined,
        subagentType: undefined,
        tokensUsed: undefined,
      });
    }
    const prior = this.agents.get(id);
    const awaitingPrompt = event.event === "agentStop" || event.event === "subagentStop";
    const status = awaitingPrompt && this.idleDelaySeconds === 0 ? "idle" : statusFor(event);
    const observedAt = event.timestamp;
    const runtime = runtimeNames[event.runtime];
    const activity: OfficeActivity =
      event.event === "preToolUse"
        ? activityForTool(event.toolName)
        : event.event === "userPromptSubmitted"
          ? "typing"
          : event.event === "subagentStart"
            ? event.subagentId
              ? "working"
              : "delegating"
            : event.event === "preCompact"
              ? "organizing"
              : event.event === "postToolUseFailure" || event.event === "errorOccurred"
                ? "puzzled"
                : awaitingPrompt
                  ? "attention"
                  : event.event === "sessionEnd"
                    ? status === "completed"
                      ? "celebrating"
                      : status === "failed"
                        ? "puzzled"
                        : "away"
                    : "working";
    const transient =
      ["delegating", "organizing", "puzzled"].includes(activity) && status === "working";
    const agentName = event.subagentId
      ? event.subagentType
        ? `${runtime} · ${event.workspace} (${event.subagentType})`
        : (prior?.displayName ?? `${runtime} · ${event.workspace} (subagent)`)
      : `${runtime} · ${event.workspace}`;
    const reason =
      event.event === "sessionEnd"
        ? status === "completed"
          ? "Copilot session completed."
          : status === "failed"
            ? "Copilot session ended with an error or timeout."
            : "Copilot session ended."
        : status === "working"
          ? `${officeActivityLabels[activity]}.`
          : "Copilot is waiting for the next prompt.";
    const agent: Agent = {
      id,
      displayName: agentName,
      source: "local",
      repositoryOwner: null,
      repositoryName: event.workspace,
      issueNumber: null,
      pullRequestNumber: prior?.pullRequestNumber ?? null,
      taskTitle: "Local Copilot session",
      taskUrl: prior?.taskUrl ?? null,
      status,
      statusReason: reason,
      statusEvidence: [
        {
          kind: event.event,
          description: reason,
          observedAt,
          confidence: 1,
        },
      ],
      statusConfidence: 1,
      statusKind: "direct",
      lastActivityAt: observedAt,
      startedAt: prior?.startedAt ?? observedAt,
      completedAt: status === "completed" ? observedAt : null,
      updatedAt: observedAt,
      deskId: prior?.deskId ?? null,
      avatarColor: prior?.avatarColor ?? hexAvatarColor(id),
      tokensUsed: event.tokensUsed ?? prior?.tokensUsed ?? null,
      metadata: {
        runtime: event.runtime,
        subagent: Boolean(event.subagentId),
        ...(event.subagentId ? { parentAgentId: parentId } : {}),
        officeActivity: activity,
        ...(prior?.metadata.pullRequest ? { pullRequest: prior.metadata.pullRequest } : {}),
        ...(transient ? { activityUntil: new Date(Date.now() + 5000).toISOString() } : {}),
        ...(awaitingPrompt
          ? {
              waitingForPromptSince:
                prior?.status === "needs_attention" &&
                typeof prior.metadata.waitingForPromptSince === "string"
                  ? prior.metadata.waitingForPromptSince
                  : new Date().toISOString(),
            }
          : {}),
      },
    };
    this.agents.set(id, agent);
    const items = this.activity.get(id) ?? [];
    items.unshift({
      id: `${id}:${event.event}:${observedAt}`,
      agentId: id,
      kind: "local-hook",
      summary: reason,
      occurredAt: observedAt,
      url: null,
    });
    this.activity.set(id, items.slice(0, 50));
    this.lastEventAt = observedAt;
    if (!event.subagentId && event.cwd) {
      const known = this.workspacePaths.has(id);
      this.workspacePaths.set(id, event.cwd);
      if (!known) this.schedulePullRequestCheck(id, 2000);
      else if (pullRequestEvents.has(event.event)) this.schedulePullRequestCheck(id, 4000);
    }
    return agent;
  }

  async fetchAgents(): Promise<Agent[]> {
    const now = Date.now();
    for (const [id, agent] of this.agents) {
      const lastActivity = Date.parse(agent.lastActivityAt ?? agent.updatedAt);
      const timedOut =
        !["completed", "failed", "offline"].includes(agent.status) &&
        Number.isFinite(lastActivity) &&
        now - lastActivity >= this.offlineThresholdMinutes * 60_000;
      if (timedOut) {
        const observedAt = new Date().toISOString();
        this.agents.set(id, {
          ...agent,
          status: "offline",
          statusReason: "No local Copilot activity within the configured offline threshold.",
          statusEvidence: [
            ...agent.statusEvidence,
            {
              kind: "offline threshold",
              description: "No local Copilot activity within the configured offline threshold.",
              observedAt,
              confidence: 1,
            },
          ],
          updatedAt: observedAt,
        });
      } else if (
        agent.status === "needs_attention" &&
        typeof agent.metadata.waitingForPromptSince === "string" &&
        now >= Date.parse(agent.metadata.waitingForPromptSince) + this.idleDelaySeconds * 1000
      ) {
        const observedAt = new Date(now).toISOString();
        const description = "Copilot is idle after waiting for the next prompt.";
        this.agents.set(id, {
          ...agent,
          status: "idle",
          statusReason: description,
          statusEvidence: [
            ...agent.statusEvidence,
            { kind: "prompt wait elapsed", description, observedAt, confidence: 1 },
          ],
          updatedAt: observedAt,
        });
      } else if (
        agent.status === "working" &&
        typeof agent.metadata.activityUntil === "string" &&
        now >= Date.parse(agent.metadata.activityUntil)
      ) {
        const metadata = { ...agent.metadata };
        delete metadata.activityUntil;
        this.agents.set(id, {
          ...agent,
          metadata: { ...metadata, officeActivity: "working" },
          statusReason: "Copilot is working in the local workspace.",
          updatedAt: new Date(now).toISOString(),
        });
      }
    }
    return [...this.agents.values()];
  }

  nextIdleTransitionAt(): number | null {
    const deadlines = [...this.agents.values()]
      .filter((agent) => agent.status === "needs_attention")
      .map((agent) =>
        typeof agent.metadata.waitingForPromptSince === "string"
          ? Date.parse(agent.metadata.waitingForPromptSince) + this.idleDelaySeconds * 1000
          : NaN,
      )
      .filter(Number.isFinite);
    return deadlines.length ? Math.min(...deadlines) : null;
  }

  nextTransitionAt(): number | null {
    const deadlines = [...this.agents.values()]
      .filter(
        (agent) => agent.status === "working" && typeof agent.metadata.activityUntil === "string",
      )
      .map((agent) => Date.parse(String(agent.metadata.activityUntil)))
      .filter(Number.isFinite);
    const idle = this.nextIdleTransitionAt();
    if (idle !== null) deadlines.push(idle);
    return deadlines.length ? Math.min(...deadlines) : null;
  }

  async fetchActivity(agentId: string): Promise<AgentActivity[]> {
    return this.activity.get(agentId) ?? [];
  }
}

export function normalizeLocalHookPayload(
  event: LocalHookEvent["event"],
  runtime: LocalHookEvent["runtime"],
  payload: Record<string, unknown>,
): LocalHookEvent {
  const sessionId = payload.sessionId ?? payload.session_id;
  const cwd = payload.cwd;
  const timestamp = payload.timestamp;
  if (
    typeof sessionId !== "string" ||
    typeof cwd !== "string" ||
    (typeof timestamp !== "string" && typeof timestamp !== "number")
  ) {
    throw new Error("Hook payload is missing its session ID, working directory, or timestamp.");
  }
  const parsedDate = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
  if (!Number.isFinite(parsedDate.getTime())) throw new Error("Hook payload timestamp is invalid.");
  const subagentId = payload.agentId ?? payload.agent_id;
  const subagentType =
    payload.agentType ?? payload.agent_type ?? payload.agentName ?? payload.agent_name;
  return LocalHookEventSchema.parse({
    event,
    runtime,
    sessionId,
    timestamp: parsedDate.toISOString(),
    workspace: basename(cwd).slice(0, 128) || "local workspace",
    reason: typeof payload.reason === "string" ? payload.reason.slice(0, 40) : undefined,
    subagentId: typeof subagentId === "string" ? subagentId : undefined,
    subagentType: typeof subagentType === "string" ? subagentType : undefined,
    toolName:
      typeof (payload.toolName ?? payload.tool_name) === "string"
        ? String(payload.toolName ?? payload.tool_name).slice(0, 128)
        : undefined,
  });
}
