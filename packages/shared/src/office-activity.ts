import type { Agent } from "./model.js";
import { homeDeparture } from "./home-departure.js";

export const officeActivities = [
  "working",
  "typing",
  "reading",
  "researching",
  "monitoring",
  "delegating",
  "organizing",
  "puzzled",
  "attention",
  "relaxing",
  "celebrating",
  "away",
] as const;
export type OfficeActivity = (typeof officeActivities)[number];

export const officeActivityLabels: Record<OfficeActivity, string> = {
  working: "At the desk",
  typing: "Typing",
  reading: "Reading documents",
  researching: "Researching & taking notes",
  monitoring: "Watching a task run",
  delegating: "Delegating work",
  organizing: "Organizing context",
  puzzled: "Checking a problem",
  attention: "Waiting for your attention",
  relaxing: "Relaxing",
  celebrating: "Celebrating completion",
  away: "Away",
};

export function activityForTool(name: string | undefined): OfficeActivity {
  const tool = (name ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const has = (...names: string[]) => names.some((part) => tool.includes(part));
  if (has("ask", "askuserquestion")) return "attention";
  if (has("task", "agent", "delegate", "subagent")) return "delegating";
  if (has("web", "webfetch", "websearch", "fetch", "browser")) return "researching";
  if (has("edit", "write", "create", "patch", "replace", "applypatch")) return "typing";
  if (has("view", "read", "glob", "grep", "rg", "search", "list", "find")) return "reading";
  if (has("bash", "powershell", "terminal", "exec", "execute", "run", "test", "build"))
    return "monitoring";
  return "working";
}

export function getOfficeActivity(agent: Agent): OfficeActivity {
  if (agent.status === "idle") return "relaxing";
  if (agent.status === "needs_attention") return "attention";
  if (agent.status === "completed") return "celebrating";
  if (agent.status === "failed") return "puzzled";
  if (agent.status !== "working") return "away";
  const value = agent.metadata.officeActivity;
  return (
    officeActivities.find((activity) => activity === value) ??
    (agent.source === "local" ? "working" : "typing")
  );
}

export function isAwayFromOffice(agent: Pick<Agent, "status" | "metadata">): boolean {
  if (homeDeparture(agent) !== null) return false;
  return (
    agent.status === "offline" ||
    (agent.status === "working" && agent.metadata.officeActivity === "away")
  );
}
