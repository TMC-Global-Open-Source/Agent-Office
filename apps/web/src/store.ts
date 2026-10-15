import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OfficeView } from "./office/camera-views.js";

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}
import {
  defaultConfig,
  type Agent,
  type AgentState,
  type AppConfig,
  type ProviderHealth,
  type UsageAttribution,
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
  usage: UsageAttribution | null;
  usageError: string | null;
  refreshUsage: () => Promise<void>;
  officeView: OfficeView;
  cameraState: CameraState | null;
  setOfficeView: (view: OfficeView) => void;
  setCameraState: (camera: CameraState) => void;
  showAgentSource: boolean;
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
    key:
      | "listMode"
      | "labels"
      | "decorations"
      | "shadows"
      | "performanceMode"
      | "autoFocus"
      | "showAgentSource",
  ) => void;
  refresh: () => Promise<void>;
}

export const useOfficeStore = create<OfficeStore>()(
  persist(
    (set) => ({
      usage: null,
      usageError: null,
      refreshUsage: async () => {
        try {
          const response = await fetch(`${api}/usage/attribution`);
          if (!response.ok) throw new Error("Token attribution could not be loaded.");
          const result = (await response.json()) as { data: UsageAttribution };
          set({ usage: result.data, usageError: null });
        } catch (error) {
          set({
            usageError:
              error instanceof Error ? error.message : "Token attribution could not be loaded.",
          });
        }
      },
      officeView: "isometric",
      cameraState: null,
      setOfficeView: (officeView) => set({ officeView, cameraState: null }),
      setCameraState: (cameraState) => set({ cameraState }),
      showAgentSource: true,
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
          const [agentsResponse, desksResponse, healthResponse, configResponse] = await Promise.all(
            [
              fetch(`${api}/agents`),
              fetch(`${api}/desks`),
              fetch(`${api}/provider/health`),
              fetch(`${api}/config`),
            ],
          );
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
    }),
    {
      name: "agent-office-display",
      partialize: (state) => ({
        showAgentSource: state.showAgentSource,
        officeView: state.officeView,
        cameraState: state.cameraState,
        labels: state.labels,
        decorations: state.decorations,
        shadows: state.shadows,
        performanceMode: state.performanceMode,
        autoFocus: state.autoFocus,
        listMode: state.listMode,
      }),
    },
  ),
);

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

export function filterAgents(agents: Agent[], filter: AgentState | "all", query: string): Agent[] {
  const normalizedQuery = query.toLowerCase();
  return agents.filter((agent) => {
    const matchesStatus = filter === "all" || filter === agent.status;
    const searchable =
      `${agent.displayName} ${agent.repositoryOwner ?? ""}/${agent.repositoryName ?? ""} ${agent.taskTitle ?? ""}`.toLowerCase();
    return matchesStatus && searchable.includes(normalizedQuery);
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
