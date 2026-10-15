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
      pullRequestNumber: null,
      taskTitle: "Local Copilot session",
      taskUrl: null,
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
