import { create } from "zustand";
import {
  defaultConfig,
  type Agent,
  type AgentState,
  type AppConfig,
  type ProviderHealth,
} from "@agent-office/shared";

const api = "/api/v1";

export interface Desk {
  id: string;
  agentId: string;
  row: number;
  column: number;
  active: boolean;
}

interface OfficeStore {
  officeTitle: string;
  setOfficeTitle: (title: string) => void;
  agents: Agent[];
  desks: Desk[];
  health: ProviderHealth | null;
  connected: boolean;
  stale: boolean;
  lastSync: string | null;
  error: string | null;
  selectedId: string | null;
  filter: AgentState | "all";
  query: string;
  listMode: boolean;
  labels: boolean;
  decorations: boolean;
  shadows: boolean;
  performanceMode: boolean;
  autoFocus: boolean;
  setSnapshot: (agents: Agent[], stale: boolean) => void;
  setDesks: (desks: Desk[]) => void;
  upsertAgent: (agent: Agent) => void;
  setHealth: (health: ProviderHealth) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  select: (id: string | null) => void;
  setFilter: (filter: AgentState | "all") => void;
  setQuery: (query: string) => void;
  toggle: (
    key: "listMode" | "labels" | "decorations" | "shadows" | "performanceMode" | "autoFocus",
  ) => void;
  refresh: () => Promise<void>;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  officeTitle: defaultConfig.officeTitle,
  setOfficeTitle: (officeTitle) => set({ officeTitle }),
  agents: [],
  desks: [],
  health: null,
  connected: false,
  stale: false,
  lastSync: null,
  error: null,
  selectedId: null,
  filter: "all",
  query: "",
  listMode: false,
  labels: true,
  decorations: true,
  shadows: true,
  performanceMode: false,
  autoFocus: true,
  setSnapshot: (agents, stale) =>
    set({ agents, stale, lastSync: new Date().toISOString(), error: null }),
  setDesks: (desks) => set({ desks }),
  upsertAgent: (agent) =>
    set((state) => ({
      agents: state.agents.some((item) => item.id === agent.id)
        ? state.agents.map((item) => (item.id === agent.id ? agent : item))
        : [...state.agents, agent],
    })),
  setHealth: (health) => set({ health, stale: health.stale }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
  select: (selectedId) => set({ selectedId }),
  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  toggle: (key) => set((state) => ({ [key]: !state[key] })),
  refresh: async () => {
    try {
      const [agentsResponse, desksResponse, healthResponse, configResponse] = await Promise.all([
        fetch(`${api}/agents`),
        fetch(`${api}/desks`),
        fetch(`${api}/provider/health`),
        fetch(`${api}/config`),
      ]);
      if (!agentsResponse.ok || !desksResponse.ok || !healthResponse.ok || !configResponse.ok)
        throw new Error("Dashboard data could not be loaded.");
      const agents = (await agentsResponse.json()) as { data: Agent[]; stale?: boolean };
      const desks = (await desksResponse.json()) as { data: Desk[] };
      const health = (await healthResponse.json()) as { data: ProviderHealth };
      const config = (await configResponse.json()) as { data: AppConfig };
      set({
        officeTitle: config.data.officeTitle,
        agents: agents.data,
        stale: Boolean(agents.stale),
        lastSync: health.data.lastSuccessAt,
        desks: desks.data,
        health: health.data,
        error: null,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Dashboard data could not be loaded.",
      });
    }
  },
}));

export const statusLabels: Record<AgentState, string> = {
  spawning: "Joining",
  working: "Working",
  idle: "Idle",
  needs_attention: "Needs attention",
  queued: "Queued",
  completed: "Completed",
  failed: "Failed",
  offline: "Offline",
};

export function filterAgents(
  agents: Agent[],
  filter: AgentState | "all",
  query: string,
  repository = "",
): Agent[] {
  const normalizedQuery = query.toLowerCase();
  return agents.filter((agent) => {
    const matchesStatus = filter === "all" || filter === agent.status;
    const fullRepository = `${agent.repositoryOwner ?? ""}/${agent.repositoryName ?? ""}`;
    const matchesRepository = !repository || fullRepository === repository;
    const searchable =
      `${agent.displayName} ${agent.repositoryOwner ?? ""}/${agent.repositoryName ?? ""} ${agent.taskTitle ?? ""}`.toLowerCase();
    return matchesStatus && matchesRepository && searchable.includes(normalizedQuery);
  });
}

export const statusColors: Record<AgentState, string> = {
  spawning: "#a78bfa",
  working: "#34d399",
  idle: "#fbbf24",
  needs_attention: "#fb7185",
  queued: "#60a5fa",
  completed: "#22d3ee",
  failed: "#f87171",
  offline: "#94a3b8",
};
