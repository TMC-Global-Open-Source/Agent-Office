import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { io, type Socket } from "socket.io-client";
import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  Clock3,
  Crosshair,
  Github,
  List,
  Maximize,
  Minimize,
  MonitorCog,
  RefreshCw,
  Search,
  Settings2,
  Signal,
  SignalZero,
  Table2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Agent, AgentActivity, AgentState, AppConfig } from "@agent-office/shared";
import type { UsageHistory, UsageSourceId } from "@agent-office/shared";
import { getOfficeActivity, officeActivityLabels } from "@agent-office/shared";
import { OfficeScene } from "./office/OfficeScene.js";
import { agentDisplayName } from "./agent-name.js";
import { attentionQueue, waitingLabel } from "./attention-queue.js";
import { creditLabel, tokenTotal } from "./token-counts.js";
import { officeViews, type OfficeView } from "./office/camera-views.js";
import { everyoneIdle } from "./office/janitor-animation.js";
import { filterAgents, statusColors, statusLabels, useOfficeStore } from "./store.js";

const stateFilters: Array<AgentState | "all"> = [
  "all",
  "working",
  "idle",
  "needs_attention",
  "queued",
  "failed",
  "offline",
];
const statusCounts: Array<AgentState> = [
  "working",
  "idle",
  "needs_attention",
  "queued",
  "failed",
  "offline",
];
const demoEvents = [
  "new-agent",
  "queued-to-working",
  "working-to-attention",
  "attention-to-working",
  "working-to-completed",
  "agent-offline",
];
const demoLabels: Record<string, string> = {
  "new-agent": "New agent joins",
  "queued-to-working": "Queued → working",
  "working-to-attention": "Working → attention",
  "attention-to-working": "Attention → working",
  "working-to-completed": "Working → completed",
  "agent-offline": "Agent goes offline",
};

export function EmptyOffice({ loaded }: { loaded: boolean }) {
  return (
    <div className="scene-empty" role="status">
      <Activity size={20} />
      <strong>{loaded ? "The office is empty" : "Preparing your office"}</strong>
      <span>
        {loaded
          ? "No agents are currently in the office. Desks will appear when agents join or return."
          : "Loading the current office state."}
      </span>
    </div>
  );
}

export function StatusSummary({ agents }: { agents: Agent[] }) {
  const counts = statusCounts.map(
    (status) => [status, agents.filter((agent) => agent.status === status).length] as const,
  );
  return (
    <section className="status-summary" aria-label="Agent status summary">
      {counts.map(([status, count]) => (
        <div className="summary-item" key={status} aria-label={`${count} ${statusLabels[status]}`}>
          <span className="summary-dot" style={{ background: statusColors[status] }} />
          <span className="summary-count">{count}</span>
          <span>{statusLabels[status]}</span>
        </div>
      ))}
    </section>
  );
}

export function AgentFilterTabs({
  value,
  onChange,
}: {
  value: AgentState | "all";
  onChange: (filter: AgentState | "all") => void;
}) {
  return (
    <div className="filter-tabs" role="group" aria-label="Filter agents by status">
      {stateFilters.map((filter) => (
        <button
          key={filter}
          className={value === filter ? "filter-tab active" : "filter-tab"}
          onClick={() => onChange(filter)}
          aria-pressed={value === filter}
        >
          {filter === "all" ? "All agents" : statusLabels[filter]}
        </button>
      ))}
    </div>
  );
}

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span className={`connection-pill ${connected ? "online" : "offline"}`} role="status">
      <span className="connection-dot" />
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function tokenUsageLabel(agent: Agent): string {
  return agent.tokensUsed == null ? "Not reported" : agent.tokensUsed.toLocaleString();
}

function AgentTokens({ agent }: { agent: Agent }) {
  const usage = useOfficeStore((state) =>
    state.usage?.agents.find((item) => item.agentId === agent.id),
  );
  return (
    <>
      {usage
        ? `${tokenTotal(usage)} · ${creditLabel(usage)} AI credits · 30 days`
        : tokenUsageLabel(agent)}
    </>
  );
}

const sourceLabels: Record<UsageSourceId, string> = {
  "copilot-cli": "Copilot CLI",
  vscode: "VS Code",
};

export function UsageByFolder() {
  const usage = useOfficeStore((state) => state.usage);
  const error = useOfficeStore((state) => state.usageError);
  return (
    <div className="usage-repositories">
      <h3>By folder · 30 days</h3>
      {error ? (
        <p role="alert">{error}</p>
      ) : !usage ? (
        <p>Loading attribution...</p>
      ) : !usage.available ? (
        <p>{usage.message}</p>
      ) : (
        <>
          <div className="repository-usage-list">
            {(usage.folders ?? []).map((repo) => (
              <div className="repository-usage-row" key={repo.folder ?? "unknown"}>
                <strong>{repo.folder ?? "Folder not reported"}</strong>
                <span>{tokenTotal(repo)} tokens</span>
                <span>AI credits: {creditLabel(repo)}</span>
                <small>
                  Input: {repo.inputTokens?.toLocaleString() ?? "Not reported"} · Output:{" "}
                  {repo.outputTokens?.toLocaleString() ?? "Not reported"}
                </small>
                <small>
                  {repo.sources.map((source) => sourceLabels[source]).join(" + ")} · {repo.sessions}{" "}
                  sessions · {repo.calls} calls
                </small>
                {repo.repositories.length > 0 && (
                  <small>Repository: {repo.repositories.join(", ")}</small>
                )}
              </div>
            ))}
          </div>
          {!usage.folders?.length && <p>No usage recorded in this period.</p>}
          <p>
            Unattributed to office agents: {tokenTotal(usage.unattributed)} tokens · AI credits:{" "}
            {creditLabel(usage.unattributed)} · {usage.unattributed.calls} calls.
          </p>
          <details>
            <summary>Attribution coverage</summary>
            <p>{usage.message}</p>
            {usage.sources?.map((source) => (
              <p key={source.source}>
                {sourceLabels[source.source]}: {source.message}
              </p>
            ))}
            <p>
              Folder and agent counts are two views of the same usage, not additive. Unmatched usage
              is never split between agents. VS Code calls are chat requests, which can include
              several model calls.
            </p>
          </details>
        </>
      )}
    </div>
  );
}

function lastSeenLabel(agent: Agent): string {
  return agent.lastActivityAt
    ? `Last seen ${new Date(agent.lastActivityAt).toLocaleString()}`
    : "Last seen: Not reported";
}

export function TokenUsageSummary({ agents }: { agents: Agent[] }) {
  const [history, setHistory] = useState<UsageHistory | null>(null);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/v1/usage/history");
        if (!response.ok) throw new Error("Local usage history could not be loaded.");
        const result = (await response.json()) as { data: UsageHistory };
        if (active) {
          setHistory(result.data);
          setHistoryError("");
        }
      } catch (error) {
        if (active)
          setHistoryError(
            error instanceof Error ? error.message : "Local usage history could not be loaded.",
          );
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  const attribution = useOfficeStore((state) => state.usage);
  const reported = agents.filter(
    (agent) =>
      agent.tokensUsed != null ||
      attribution?.agents.some(
        (item) =>
          item.agentId === agent.id && (item.inputTokens !== null || item.outputTokens !== null),
      ),
  );
  return (
    <section className="rail-card token-usage-card" aria-label="Token usage">
      <div className="rail-title">
        <div>
          <span className="eyebrow">LOCAL COPILOT HISTORY</span>
          <h2>Token usage</h2>
        </div>
      </div>
      <div className="usage-history">
        <h3>Last 30 days</h3>
        {historyError ? (
          <p role="alert">{historyError}</p>
        ) : history ? (
          <>
            {history.available && (
              <dl className="usage-metrics">
                <div>
                  <dt>Input tokens</dt>
                  <dd>
                    {history.inputTokens === null
                      ? "Not reported"
                      : history.inputTokens.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Output tokens</dt>
                  <dd>
                    {history.outputTokens === null
                      ? "Not reported"
                      : history.outputTokens.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt>Recorded calls</dt>
                  <dd>{history.calls.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Calls with counts</dt>
                  <dd>{history.callsWithTokenCounts.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>AI credits</dt>
                  <dd>{creditLabel(history)}</dd>
                </div>
              </dl>
            )}
            {history.available && history.sources && (
              <ul className="usage-sources">
                {history.sources.map((source) => (
                  <li key={source.source}>
                    <strong>{sourceLabels[source.source]}</strong>
                    <span>
                      {source.available
                        ? `${creditLabel(source)} AI credits · ${tokenTotal(source)} tokens · ${source.calls.toLocaleString()} ${source.source === "vscode" ? "requests" : "calls"}`
                        : "Not available"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {history.available && (
              <p className="usage-date">
                {new Date(history.since).toLocaleDateString()} through{" "}
                {new Date(history.asOf).toLocaleDateString()}
              </p>
            )}
            {!history.available && <p>{history.message}</p>}
            <details className="usage-notes">
              <summary>Source &amp; coverage</summary>
              {history.available && <p>{history.message}</p>}
              <p>
                Sources: the Copilot CLI local usage database and VS Code chatSessions logs, read
                directly and read-only. No Cost Lens dependency. Only timestamps, token counts and
                credits are read from VS Code logs; chat content is discarded. These totals use the
                same sources as the agent and folder breakdown below.
              </p>
              <p>
                Lifecycle hooks do not include token usage, so these adapters supply it. Missing
                counts are reported as not reported, never as zero.
              </p>
            </details>
          </>
        ) : (
          <p>Loading local usage history...</p>
        )}
      </div>
      <UsageByFolder />
      <div className="usage-live">
        <div className="usage-live-heading">
          <h3>Live agent counts</h3>
          <span className="rail-count">
            {reported.length}/{agents.length}
          </span>
        </div>
        <p>
          {reported.length
            ? `${reported.length} of ${agents.length} agents have reported token counts.`
            : "No token counts reported yet."}
        </p>
      </div>
    </section>
  );
}

export function AgentList({
  agents,
  onSelect,
}: {
  agents: Agent[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="accessible-agent-list" aria-label="Accessible agent list">
      {agents.map((agent) => (
        <button className="agent-row" key={agent.id} onClick={() => onSelect(agent.id)}>
          <span className="summary-dot" style={{ background: statusColors[agent.status] }} />
          <span className="agent-row-main">
            <strong>
              <AgentName agent={agent} />
            </strong>
            <small>
              {agent.repositoryOwner}/{agent.repositoryName} · {agent.taskTitle ?? "No task title"}
            </small>
            <small>
              Tokens used: <AgentTokens agent={agent} />
            </small>
            <small>Activity: {officeActivityLabels[getOfficeActivity(agent)]}</small>
            {agent.status === "offline" && <small>{lastSeenLabel(agent)}</small>}
            {typeof agent.metadata.parentAgentId === "string" && (
              <small>Subagent team member</small>
            )}
          </span>
          <span className="agent-row-state">{statusLabels[agent.status]}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ))}
      {agents.length === 0 && <p className="empty-state">No agents match this view.</p>}
    </div>
  );
}

function AgentName({ agent }: { agent: Agent }) {
  const showSource = useOfficeStore((state) => state.showAgentSource);
  return <>{agentDisplayName(agent, showSource)}</>;
}

export function AgentDetails({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const usage = useOfficeStore((state) =>
    state.usage?.agents.find((item) => item.agentId === agent.id),
  );
  const showSource = useOfficeStore((state) => state.showAgentSource);
  const parentName = useOfficeStore((state) => {
    const parent = state.agents.find((item) => item.id === agent.metadata.parentAgentId);
    return parent ? agentDisplayName(parent, state.showAgentSource) : undefined;
  });
  const [color, setColor] = useState(agent.avatarColor);
  const [savingColor, setSavingColor] = useState(false);
  const [colorMessage, setColorMessage] = useState("");
  const [sendingHome, setSendingHome] = useState(false);
  const [homeError, setHomeError] = useState("");
  const sendHome = async () => {
    setSendingHome(true);
    setHomeError("");
    try {
      const response = await fetch(`/api/v1/agents/${encodeURIComponent(agent.id)}/home`, {
        method: "POST",
      });
      const payload = (await response.json()) as { data?: Agent; error?: { message?: string } };
      if (!response.ok || !payload.data)
        throw new Error(payload.error?.message ?? "Agent could not be sent home.");
      useOfficeStore.getState().upsertAgent(payload.data);
      onClose();
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : "Agent could not be sent home.");
    } finally {
      setSendingHome(false);
    }
  };
  useEffect(() => {
    setColor(agent.avatarColor);
  }, [agent.id, agent.avatarColor]);
  const saveColor = async (event: FormEvent) => {
    event.preventDefault();
    setSavingColor(true);
    setColorMessage("");
    try {
      const response = await fetch(`/api/v1/agents/${encodeURIComponent(agent.id)}/color`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message ?? "Agent color could not be saved.");
      }
      const result = (await response.json()) as { data: Agent };
      const current = useOfficeStore.getState().agents.find((item) => item.id === agent.id);
      if (current)
        useOfficeStore.getState().upsertAgent({ ...current, avatarColor: result.data.avatarColor });
      setColorMessage("Agent color saved.");
    } catch (error) {
      setColorMessage(error instanceof Error ? error.message : "Agent color could not be saved.");
    } finally {
      setSavingColor(false);
    }
  };
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/agents/${encodeURIComponent(agent.id)}/activity`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ data: AgentActivity[] }>)
          : Promise.reject(new Error("Activity unavailable.")),
      )
      .then((payload) => {
        if (active) setActivity(payload.data);
      })
      .catch(() => {
        if (active) setActivity([]);
      });
    return () => {
      active = false;
    };
  }, [agent.id]);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const outside = (event: Event) => {
      const target = event.target;
      return (
        target instanceof Node &&
        !panelRef.current?.contains(target) &&
        !(target instanceof Element && target.closest(".fullscreen-button, .scene-controls"))
      );
    };
    const down = (event: PointerEvent) => {
      start = outside(event) ? { x: event.clientX, y: event.clientY } : null;
    };
    // Close on a click outside the card, but not when the pointer was dragged to orbit the camera.
    const up = (event: PointerEvent) => {
      if (
        start &&
        outside(event) &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
      )
        closeRef.current();
      start = null;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <aside
      ref={panelRef}
      className="detail-panel"
      aria-label={`${agentDisplayName(agent, showSource)} details`}
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AGENT PROFILE</span>
          <h2>
            <AgentName agent={agent} />
          </h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close details">
          <X size={18} />
        </button>
      </div>
      <div className="detail-status" style={{ color: statusColors[agent.status] }}>
        <span className="summary-dot" style={{ background: statusColors[agent.status] }} />
        <strong>{statusLabels[agent.status]}</strong>
        <span className="inference-badge">{agent.statusKind}</span>
      </div>
      <p className="detail-reason">{agent.statusReason ?? "No status explanation is available."}</p>
      <button
        className="toolbar-button"
        disabled={sendingHome || Boolean(agent.metadata.homeDeparture)}
        onClick={() => void sendHome()}
      >
        {agent.metadata.homeDeparture
          ? "Heading home..."
          : sendingHome
            ? "Sending home..."
            : "Send home"}
      </button>
      <p className="detail-reason">
        Clears this agent's desk after it leaves. New work brings it back automatically; its session
        is not stopped.
      </p>
      {homeError && <p role="alert">{homeError}</p>}
      <form className="agent-color-settings" onSubmit={(event) => void saveColor(event)}>
        <label>
          Avatar color
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            disabled={savingColor}
          />
        </label>
        <button
          className="toolbar-button"
          type="submit"
          disabled={savingColor || color.toLowerCase() === agent.avatarColor.toLowerCase()}
        >
          {savingColor ? "Saving..." : "Save color"}
        </button>
        {colorMessage && <p role="status">{colorMessage}</p>}
      </form>
      {agent.statusKind === "inferred" && (
        <p className="confidence-line">
          Inferred from provider evidence · {Math.round(agent.statusConfidence * 100)}% confidence
        </p>
      )}
      <dl className="detail-grid">
        <dt>Office activity</dt>
        <dd>{officeActivityLabels[getOfficeActivity(agent)]}</dd>
        {typeof agent.metadata.parentAgentId === "string" && (
          <>
            <dt>Parent session</dt>
            <dd>{parentName ?? "Parent session unavailable"}</dd>
          </>
        )}
        <dt>Repository</dt>
        <dd>
          {agent.repositoryOwner && agent.repositoryName
            ? `${agent.repositoryOwner}/${agent.repositoryName}`
            : "—"}
        </dd>
        <dt>Related work</dt>
        <dd>
          {agent.taskUrl ? (
            <a href={agent.taskUrl} target="_blank" rel="noreferrer">
              {agent.taskTitle ?? "Open GitHub item"}
            </a>
          ) : (
            (agent.taskTitle ?? "—")
          )}
        </dd>
        <dt>Issue / PR</dt>
        <dd>
          {agent.issueNumber
            ? `Issue #${agent.issueNumber}`
            : agent.pullRequestNumber
              ? `Pull request #${agent.pullRequestNumber}`
              : "—"}
        </dd>
        <dt>Started</dt>
        <dd>{agent.startedAt ? new Date(agent.startedAt).toLocaleString() : "—"}</dd>
        <dt>Last activity</dt>
        <dd>{agent.lastActivityAt ? new Date(agent.lastActivityAt).toLocaleString() : "—"}</dd>
        <dt>Tokens used</dt>
        <dd>
          <AgentTokens agent={agent} />
        </dd>
        {usage && (
          <>
            <dt>Input / output · 30 days</dt>
            <dd>
              {usage.inputTokens?.toLocaleString() ?? "Not reported"} /{" "}
              {usage.outputTokens?.toLocaleString() ?? "Not reported"}
            </dd>
            <dt>Recorded calls · 30 days</dt>
            <dd>{usage.calls}</dd>
            <dt>AI credits · 30 days</dt>
            <dd>{creditLabel(usage)}</dd>
            <dt>Usage repository</dt>
            <dd>{usage.repository ?? "Not reported"}</dd>
          </>
        )}
      </dl>
      {!usage && agent.tokensUsed == null && (
        <p className="detail-reason">
          No exact local-history identity match with recorded counts for this agent. Lifecycle hooks
          do not supply counts; repository totals are never assigned to individual agents.
        </p>
      )}
      {agent.statusEvidence.length > 0 && (
        <div className="evidence-block">
          <h3>Status evidence</h3>
          {agent.statusEvidence.map((item, index) => (
            <p key={`${item.observedAt}-${index}`}>
              <strong>{item.kind}</strong> · {item.description}
              <small>
                {new Date(item.observedAt).toLocaleString()} · {Math.round(item.confidence * 100)}%
              </small>
            </p>
          ))}
        </div>
      )}
      <div className="evidence-block">
        <h3>Recent activity</h3>
        {activity.length ? (
          activity.map((item) => (
            <p key={item.id}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.summary}
                </a>
              ) : (
                item.summary
              )}
              <small>{new Date(item.occurredAt).toLocaleString()}</small>
            </p>
          ))
        ) : (
          <p>No recent activity is available.</p>
        )}
      </div>
    </aside>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const state = useOfficeStore();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void fetch("/api/v1/config")
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ data: AppConfig }>)
          : Promise.reject(new Error("Settings could not be loaded.")),
      )
      .then((result) => setConfig(result.data))
      .catch(() => setSaveMessage("Provider settings could not be loaded."));
  }, []);
  const options: Array<[keyof typeof state, string]> = [
    ["labels", "Show name labels"],
    ["showAgentSource", "Show agent source"],
    ["decorations", "Show office decorations"],
    ["shadows", "Enable shadows"],
    ["performanceMode", "Performance mode"],
    ["autoFocus", "Focus on new agents"],
  ];
  const saveConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/v1/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message ?? "Settings were not saved.");
      }
      const result = (await response.json()) as { data: AppConfig };
      setConfig(result.data);
      state.setOfficeTitle(result.data.officeTitle);
      setSaveMessage("Provider settings saved.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Settings were not saved.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PREFERENCES</span>
            <h2 id="settings-title">Office settings</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close settings">
            <X size={18} />
          </button>
        </div>
        {options.map(([key, label]) => (
          <label className="setting-row" key={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              checked={Boolean(state[key])}
              onChange={() =>
                state.toggle(
                  key as
                    | "labels"
                    | "decorations"
                    | "shadows"
                    | "performanceMode"
                    | "autoFocus"
                    | "showAgentSource",
                )
              }
            />
          </label>
        ))}
        <form className="provider-settings" onSubmit={(event) => void saveConfig(event)}>
          <h3>Provider thresholds</h3>
          {config ? (
            <>
              <label className="setting-list">
                Office title
                <input
                  className="office-title-input"
                  type="text"
                  required
                  maxLength={120}
                  pattern=".*\S.*"
                  value={config.officeTitle}
                  onChange={(event) => setConfig({ ...config, officeTitle: event.target.value })}
                />
              </label>
              <label>
                Refresh interval (seconds)
                <input
                  type="number"
                  min="10"
                  max="3600"
                  value={config.pollingIntervalSeconds}
                  onChange={(event) =>
                    setConfig({ ...config, pollingIntervalSeconds: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Idle threshold (minutes)
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={config.idleThresholdMinutes}
                  onChange={(event) =>
                    setConfig({ ...config, idleThresholdMinutes: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Idle delay (seconds)
                <input
                  type="number"
                  min="0"
                  max="3600"
                  value={config.idleDelaySeconds}
                  onChange={(event) =>
                    setConfig({ ...config, idleDelaySeconds: Number(event.target.value) })
                  }
                />
              </label>
              <p>
                Local Copilot waits at its desk in Needs attention before relaxing on the couch. Set
                to 0 to become idle immediately.
              </p>
              <label>
                Offline threshold (minutes)
                <input
                  type="number"
                  min="1"
                  max="10080"
                  value={config.offlineThresholdMinutes}
                  onChange={(event) =>
                    setConfig({ ...config, offlineThresholdMinutes: Number(event.target.value) })
                  }
                />
              </label>
              <label className="setting-list">
                Needs-attention markers (one per line)
                <textarea
                  aria-label="Needs-attention markers"
                  rows={3}
                  value={config.questionMarkers.join("\n")}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      questionMarkers: event.target.value
                        .split(/\r?\n/)
                        .map((marker) => marker.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="setting-list">
                Completion markers (one per line)
                <textarea
                  aria-label="Completion markers"
                  rows={3}
                  value={config.completionMarkers.join("\n")}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      completionMarkers: event.target.value
                        .split(/\r?\n/)
                        .map((marker) => marker.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <button className="toolbar-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save provider settings"}
              </button>
            </>
          ) : (
            <p>Loading provider settings…</p>
          )}
          {saveMessage && <p role="status">{saveMessage}</p>}
        </form>
        <p className="settings-footnote">
          Display preferences apply locally. Provider thresholds are stored in SQLite. GitHub
          credentials are configured only on the local server.
        </p>
      </section>
    </div>
  );
}

export function App() {
  const state = useOfficeStore();
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    void state.refreshUsage();
    const timer = window.setInterval(() => void state.refreshUsage(), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const resetRef = useRef<(() => void) | null>(null);
  const zoomRef = useRef<((direction: number) => void) | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === sceneRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement === sceneRef.current) {
        await document.exitFullscreen();
      } else {
        if (!sceneRef.current?.requestFullscreen)
          throw new Error("Fullscreen is not supported by this browser.");
        await sceneRef.current.requestFullscreen();
      }
    } catch (error) {
      setFullscreenError(
        error instanceof Error ? error.message : "Could not change fullscreen mode.",
      );
    }
  };
  const officeView = state.officeView;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoMessage, setDemoMessage] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  useEffect(() => {
    void state.refresh();
  }, []);
  useEffect(() => {
    const socket: Socket = io();
    socket.on("connect", () => state.setConnected(true));
    socket.on("disconnect", () => state.setConnected(false));
    socket.on("agent:created", (agent: Agent) => {
      state.upsertAgent(agent);
      if (useOfficeStore.getState().autoFocus) state.select(agent.id);
      setDemoMessage(
        `New agent joined: ${agentDisplayName(agent, useOfficeStore.getState().showAgentSource)}`,
      );
      window.setTimeout(() => setDemoMessage(""), 3000);
    });
    socket.on("agent:updated", (agent: Agent) => state.upsertAgent(agent));
    socket.on("agent:removed", () => void state.refresh());
    socket.on("provider:health", state.setHealth);
    socket.on("refresh:completed", () => void state.refresh());
    socket.on("refresh:failed", () => {
      void state
        .refresh()
        .finally(() =>
          state.setError("Provider refresh failed. The last successful office state is retained."),
        );
    });
    socket.on("desk:created", () => void state.refresh());
    return () => {
      socket.disconnect();
    };
  }, []);

  const filtered = useMemo(
    () => filterAgents(state.agents, state.filter, state.query),
    [state.agents, state.filter, state.query],
  );
  const selectedAgent = state.agents.find((agent) => agent.id === state.selectedId);
  const desks = state.desks;
  const attention = attentionQueue(state.agents);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/v1/refresh", { method: "POST" });
      if (!response.ok)
        throw new Error("Refresh failed. Your last successful data is still available.");
      await state.refresh();
    } catch (error) {
      await state.refresh();
      state.setError(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  };
  const triggerDemo = async (eventName: string) => {
    try {
      const response = await fetch(`/api/v1/demo/events/${eventName}`, { method: "POST" });
      const payload = (await response.json()) as { data?: Agent; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Demo event failed.");
      if (payload.data) state.upsertAgent(payload.data);
      await state.refresh();
      setDemoMessage(`Demo event: ${demoLabels[eventName]}`);
      window.setTimeout(() => setDemoMessage(""), 2600);
    } catch (error) {
      state.setError(error instanceof Error ? error.message : "Demo event failed.");
    }
  };
  const selectAgent = (id: string) => {
    if (!filtered.some((agent) => agent.id === id)) {
      state.setFilter("all");
      state.setQuery("");
    }
    state.select(id);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <MonitorCog size={22} />
          <div>
            <strong>Copilot Agent Office</strong>
            <span>LOCAL AGENT MONITOR</span>
          </div>
        </div>
        <div className="scope-pill">
          {state.health?.provider === "github" ? <Github size={15} /> : <MonitorCog size={15} />}
          {state.health?.provider === "github"
            ? "GitHub organization"
            : state.health?.provider === "local"
              ? "Local Copilot sessions"
              : "Sample workspace"}
        </div>
        <div className="topbar-meta">
          <ConnectionStatus connected={state.connected} />
          {state.stale && <span className="stale-pill">STALE DATA</span>}
          <span className="sync-time">
            {state.lastSync
              ? `Synced ${new Date(state.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Waiting for sync"}
          </span>
          <button className="toolbar-button" onClick={() => void refresh()} disabled={isRefreshing}>
            <RefreshCw size={15} className={isRefreshing ? "spin" : ""} />
            Refresh
          </button>
          <button
            className="icon-button topbar-settings"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <section className="office-column">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">YOUR TEAM, AT A GLANCE</p>
              <h1>{state.officeTitle}</h1>
              <p className="subtitle">
                {state.health?.message ?? "Connecting to the local agent office…"}
              </p>
            </div>
            <StatusSummary agents={state.agents} />
          </div>
          {state.error && (
            <div className="error-banner" role="status">
              <AlertCircle size={17} />
              {state.error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => state.setError(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {demoMessage && (
            <div className="toast" role="status">
              <Check size={16} />
              {demoMessage}
            </div>
          )}
          <div className="toolbar">
            <AgentFilterTabs value={state.filter} onChange={state.setFilter} />
            <div className="filter-tools">
              <label className="search-box">
                <Search size={15} />
                <input
                  aria-label="Search agents"
                  placeholder="Find an agent…"
                  value={state.query}
                  onChange={(event) => state.setQuery(event.target.value)}
                />
                {state.query && (
                  <button aria-label="Clear search" onClick={() => state.setQuery("")}>
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
          </div>
          <div ref={sceneRef} className={`scene-wrap ${state.listMode ? "list-view" : ""}`}>
            {fullscreenError && (
              <p className="fullscreen-error" role="alert">
                {fullscreenError}
              </p>
            )}
            {state.listMode ? (
              <AgentList agents={filtered} onSelect={selectAgent} />
            ) : (
              <OfficeScene
                view={officeView}
                agents={filtered}
                allAgents={state.agents}
                allIdle={everyoneIdle(state.agents)}
                desks={desks}
                selectedId={state.selectedId}
                onSelect={selectAgent}
                labels={state.labels}
                decorations={state.decorations}
                shadows={state.shadows}
                performanceMode={state.performanceMode}
                reducedMotion={reducedMotion}
                resetRef={resetRef}
                zoomRef={zoomRef}
              />
            )}
            {!state.listMode && (
              <button
                className="icon-button fullscreen-button"
                title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                aria-pressed={fullscreen}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
              </button>
            )}
            {!state.listMode && (
              <div className="scene-controls">
                <select
                  className="office-view-select"
                  aria-label="Office view"
                  value={officeView}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value in officeViews) state.setOfficeView(value as OfficeView);
                  }}
                >
                  {Object.entries(officeViews).map(([value, preset]) => (
                    <option key={value} value={value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  title="Zoom in"
                  aria-label="Zoom in"
                  onClick={() => zoomRef.current?.(1)}
                >
                  <ZoomIn size={17} />
                </button>
                <button
                  className="icon-button"
                  title="Zoom out"
                  aria-label="Zoom out"
                  onClick={() => zoomRef.current?.(-1)}
                >
                  <ZoomOut size={17} />
                </button>
                <button
                  className="icon-button"
                  title="Reset camera"
                  aria-label="Reset camera"
                  onClick={() => resetRef.current?.()}
                >
                  <Crosshair size={16} />
                </button>
                <button
                  className="icon-button view-toggle"
                  title="Show agent list"
                  aria-label="Show agent list"
                  onClick={() => state.toggle("listMode")}
                >
                  <Table2 size={16} />
                </button>
              </div>
            )}
            {state.listMode && (
              <button
                className="icon-button list-toggle"
                title="Show 3D office"
                aria-label="Show 3D office"
                onClick={() => state.toggle("listMode")}
              >
                <MonitorCog size={17} />
              </button>
            )}
            {state.agents.length === 0 && !state.error && (
              <EmptyOffice loaded={state.health !== null} />
            )}
            {state.performanceMode && (
              <div className="performance-panel" aria-label="Performance panel">
                <strong>PERFORMANCE MODE</strong>
                <span>
                  {state.agents.length} agents · {desks.length} desks ·{" "}
                  {state.connected ? "socket connected" : "socket reconnecting"}
                </span>
              </div>
            )}
          </div>
          <div className="scene-caption">
            <span>
              <span className="live-orb" />
              Live office floor
            </span>
            <span>
              {filtered.length} of {state.agents.length} agents shown · drag to pan · scroll to zoom
            </span>
          </div>
          <div className="office-footer">
            <button
              className={`footer-toggle ${state.listMode ? "selected" : ""}`}
              onClick={() => state.toggle("listMode")}
            >
              <List size={15} />
              Accessible list view
            </button>
            {reducedMotion && <span className="reduced-note">Reduced motion enabled</span>}
          </div>
        </section>

        <aside className="right-rail">
          <section className="rail-card attention-card">
            <div className="rail-title">
              <div>
                <span className="eyebrow">PRIORITY QUEUE</span>
                <h2>Needs attention</h2>
              </div>
              <span className="rail-count">{attention.length}</span>
            </div>
            {attention.length ? (
              attention.map((agent) => (
                <button
                  key={agent.id}
                  className="attention-item"
                  onClick={() => selectAgent(agent.id)}
                >
                  <span className="attention-icon">
                    <AlertCircle size={17} />
                  </span>
                  <span className="attention-copy">
                    <strong>
                      <AgentName agent={agent} />
                    </strong>
                    <small>{agent.statusReason ?? agent.taskTitle}</small>
                    <small>{waitingLabel(agent, now)} · Select to inspect</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <div className="rail-empty">
                <Check size={18} />
                <span>Everyone is moving along nicely.</span>
              </div>
            )}
          </section>
          <section className="rail-card team-card">
            <div className="rail-title">
              <div>
                <span className="eyebrow">ON THE FLOOR</span>
                <h2>Team roster</h2>
              </div>
              <span className="rail-count">{state.agents.length}</span>
            </div>
            {state.agents.slice(0, 8).map((agent) => (
              <button
                className={`roster-item ${selectedAgent?.id === agent.id ? "selected" : ""}`}
                key={agent.id}
                onClick={() => selectAgent(agent.id)}
              >
                <span className="roster-avatar" style={{ background: agent.avatarColor }}>
                  {agentDisplayName(agent, state.showAgentSource).slice(0, 1)}
                </span>
                <span className="roster-copy">
                  <strong>
                    <AgentName agent={agent} />
                  </strong>
                  <small>{agent.repositoryName ?? "Unassigned"}</small>
                  <small>
                    Tokens used: <AgentTokens agent={agent} />
                  </small>
                  {agent.status === "offline" && <small>Away · {lastSeenLabel(agent)}</small>}
                </span>
                <span className="status-mini" style={{ background: statusColors[agent.status] }} />
              </button>
            ))}
            {state.agents.length > 8 && (
              <button className="more-agents" onClick={() => state.toggle("listMode")}>
                View all {state.agents.length} agents
              </button>
            )}
          </section>
          <TokenUsageSummary agents={state.agents} />
          {demoOpen && state.health?.provider === "mock" && (
            <section className="rail-card demo-card">
              <div className="rail-title">
                <div>
                  <span className="eyebrow">DEVELOPMENT ONLY</span>
                  <h2>Demo controls</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close demo controls"
                  onClick={() => setDemoOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              {demoEvents.map((event) => (
                <button className="demo-event" key={event} onClick={() => void triggerDemo(event)}>
                  <span>{demoLabels[event]}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </section>
          )}
          {state.health?.provider === "mock" && (
            <button className="demo-open" onClick={() => setDemoOpen((open) => !open)}>
              <MonitorCog size={15} />
              {demoOpen ? "Hide demo controls" : "Open demo controls"}
            </button>
          )}
          <div className="health-card">
            <span className={`health-icon ${state.health?.healthy ? "ok" : ""}`}>
              {state.health?.healthy ? <Signal size={15} /> : <SignalZero size={15} />}
            </span>
            <div>
              <strong>{state.health?.healthy ? "Provider connected" : "Provider status"}</strong>
              <small>
                {state.health?.provider === "local" && state.agents.length === 0
                  ? "Start or resume a local Copilot session"
                  : state.health?.lastSuccessAt
                    ? `Last event ${new Date(state.health.lastSuccessAt).toLocaleTimeString()}`
                    : "No successful sync yet"}
              </small>
            </div>
            <Clock3 size={15} className="health-clock" />
          </div>
        </aside>
      </div>
      {selectedAgent &&
        createPortal(
          <AgentDetails
            key={selectedAgent.id}
            agent={selectedAgent}
            onClose={() => state.select(null)}
          />,
          // The browser only shows the fullscreen element, so the profile must render inside it.
          fullscreen && sceneRef.current ? sceneRef.current : document.body,
        )}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
