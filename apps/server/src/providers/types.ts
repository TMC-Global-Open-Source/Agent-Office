import type { Agent, AgentActivity, AppConfig, ProviderHealth } from "@agent-office/shared";

export interface AgentProvider {
  readonly name: "mock" | "github" | "local";
  fetchAgents(): Promise<Agent[]>;
  fetchActivity(agentId: string): Promise<AgentActivity[]>;
  health(): ProviderHealth;
  updateConfig?(config: AppConfig): void;
}
