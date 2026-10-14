import type { Agent, AgentActivity, AgentState, ProviderHealth } from "@agent-office/shared";
import { hexAvatarColor } from "@agent-office/shared";
import type { AgentProvider } from "./types.js";

const now = Date.now();
const stamp = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

const demos: Array<{ id: string; name: string; status: AgentState; task: string }> = [
  { id: "demo-aria", name: "Aria Chen", status: "working", task: "Add project search" },
  { id: "demo-milo", name: "Milo Rivera", status: "working", task: "Improve API retries" },
  { id: "demo-sam", name: "Sam Okafor", status: "idle", task: "Refine settings layout" },
  { id: "demo-jules", name: "Jules Park", status: "idle", task: "Update test fixtures" },
  {
    id: "demo-noor",
    name: "Noor Ali",
    status: "needs_attention",
    task: "Investigate failing check",
  },
  { id: "demo-theo", name: "Theo Martin", status: "queued", task: "Document provider API" },
];

export class MockAgentProvider implements AgentProvider {
  readonly name = "mock" as const;
  private readonly agents = new Map<string, Agent>();
  private readonly activity = new Map<string, AgentActivity[]>();

  constructor() {
    for (const [index, demo] of demos.entries()) this.add(demo, index);
  }

  private add(demo: (typeof demos)[number], index: number): Agent {
    const agent: Agent = {
      id: demo.id,
      displayName: demo.name,
      source: "mock",
      repositoryOwner: "sample-org",
      repositoryName: index % 2 === 0 ? "agent-office" : "web-platform",
      issueNumber: 120 + index,
      pullRequestNumber: null,
      taskTitle: demo.task,
      taskUrl: null,
      status: demo.status,
      statusReason: `Demo status: ${demo.status.replace("_", " ")}.`,
      statusEvidence: [
        {
          kind: demo.status,
          description: `Demo status: ${demo.status.replace("_", " ")}.`,
          observedAt: stamp(index + 1),
          confidence: 1,
        },
      ],
      statusConfidence: 1,
      statusKind: "mock",
      lastActivityAt: stamp(index + 1),
      startedAt: stamp(index * 4 + 20),
      completedAt: null,
      updatedAt: new Date().toISOString(),
      deskId: null,
      avatarColor: hexAvatarColor(demo.id),
      tokensUsed: null,
      metadata: { demo: true },
    };
    this.agents.set(agent.id, agent);
    this.activity.set(agent.id, [
      {
        id: `${agent.id}-activity`,
        agentId: agent.id,
        kind: "demo",
        summary: agent.statusReason ?? "Demo agent activity",
        occurredAt: agent.lastActivityAt ?? new Date().toISOString(),
        url: null,
      },
    ]);
    return agent;
  }

  async fetchAgents(): Promise<Agent[]> {
    const now = Date.now();
    for (const agent of this.agents.values()) {
      const spawnFinished = agent.status === "spawning" && now - Date.parse(agent.updatedAt) > 1600;
      const celebrationFinished =
        agent.status === "completed" &&
        agent.completedAt &&
        now - Date.parse(agent.completedAt) > 8000;
      if (spawnFinished || celebrationFinished) {
        this.agents.set(agent.id, {
          ...agent,
          status: spawnFinished ? "working" : "idle",
          statusReason: spawnFinished
            ? "Arrived at the assigned workstation."
            : "Completed a demo task and returned to idle.",
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return [...this.agents.values()];
  }

  async fetchActivity(agentId: string): Promise<AgentActivity[]> {
    return this.activity.get(agentId) ?? [];
  }

  health(): ProviderHealth {
    return {
      provider: "mock",
      healthy: true,
      stale: false,
      message: "Demo data is active.",
      lastSuccessAt: new Date().toISOString(),
      rateLimitResetAt: null,
    };
  }

  applyEvent(eventName: string): Agent | null {
    const first = [...this.agents.values()][0];
    if (eventName === "new-agent" && !this.agents.has("demo-kai")) {
      return this.add(
        { id: "demo-kai", name: "Kai Morgan", status: "spawning", task: "Review accessibility" },
        6,
      );
    }
    const targets: Record<string, string> = {
      "queued-to-working": "demo-theo",
      "working-to-attention": "demo-aria",
      "attention-to-working": "demo-noor",
      "working-to-completed": "demo-milo",
      "agent-offline": "demo-theo",
    };
    const targetId = targets[eventName] ?? "demo-noor";
    const target = this.agents.get(targetId) ?? first;
    if (!target) return null;
    const transitions: Record<string, AgentState> = {
      "queued-to-working": "working",
      "working-to-attention": "needs_attention",
      "attention-to-working": "working",
      "working-to-completed": "completed",
      "agent-offline": "offline",
    };
    const status = transitions[eventName];
    if (!status) return null;
    const updated: Agent = {
      ...target,
      status,
      statusReason: `Demo event: ${eventName.replaceAll("-", " ")}.`,
      statusEvidence: [
        {
          kind: eventName,
          description: `Demo event: ${eventName.replaceAll("-", " ")}.`,
          observedAt: new Date().toISOString(),
          confidence: 1,
        },
      ],
      updatedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      completedAt: status === "completed" ? new Date().toISOString() : null,
    };
    this.agents.set(updated.id, updated);
    return updated;
  }
}
