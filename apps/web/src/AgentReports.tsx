import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { AgentReport, AgentReportDay } from "@agent-office/shared";
import "./agent-reports.css";

type Metric = "workingMilliseconds" | "aiCredits" | "inputTokens" | "outputTokens";
type ReportRow = AgentReportDay & { partialMetrics?: Metric[] };
const metrics: Record<Metric, string> = {
  workingMilliseconds: "Active working time",
  aiCredits: "AI credits",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
};
const dateString = (date: Date) => date.toISOString().slice(0, 10);
const duration = (value: number) => {
  const seconds = Math.floor(value / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
};
export function reportValue(row: ReportRow, metric: Metric): string {
  const value = row[metric];
  if (value === null) return "Not recorded";
  if (metric === "workingMilliseconds")
    return `${duration(value)}${row.partialMetrics?.includes(metric) ? " (partial)" : ""}`;
  const calls =
    metric === "aiCredits"
      ? row.aiCreditCalls
      : metric === "inputTokens"
        ? row.inputTokenCalls
        : row.outputTokenCalls;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: metric === "aiCredits" ? 9 : 0 })}${calls < row.calls || row.partialMetrics?.includes(metric) ? " (partial)" : ""}`;
}

export function combineReportDays(days: AgentReportDay[]): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const day of days) {
    const current = groups.get(day.date);
    if (!current) {
      groups.set(day.date, {
        ...day,
        agentId: "combined",
        partialMetrics: (Object.keys(metrics) as Metric[]).filter((key) => day[key] === null),
      });
      continue;
    }
    for (const metric of Object.keys(metrics) as Metric[]) {
      if (day[metric] === null && !current.partialMetrics?.includes(metric))
        current.partialMetrics?.push(metric);
      if (day[metric] !== null) current[metric] = (current[metric] ?? 0) + day[metric];
    }
    current.calls += day.calls;
    current.aiCreditCalls += day.aiCreditCalls;
    current.inputTokenCalls += day.inputTokenCalls;
    current.outputTokenCalls += day.outputTokenCalls;
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function AgentReports({
  initialAgentId,
  onClose,
}: {
  initialAgentId?: string;
  onClose: () => void;
}) {
  const [start, setStart] = useState(() => dateString(new Date(Date.now() - 6 * 86_400_000)));
  const [end, setEnd] = useState(() => dateString(new Date()));
  const [selected, setSelected] = useState<string[]>(initialAgentId ? [initialAgentId] : []);
  const [metric, setMetric] = useState<Metric>("workingMilliseconds");
  const [mode, setMode] = useState("combined");
  const [report, setReport] = useState<AgentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [requestNumber, setRequestNumber] = useState(0);
  const [applied, setApplied] = useState({ start, end, selected });
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous !== document.body && previous.isConnected)
        previous.focus();
      else document.querySelector<HTMLButtonElement>(".reports-button")?.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ start: applied.start, end: applied.end });
    for (const id of applied.selected) query.append("agentId", id);
    void fetch(`/api/v1/reports/agents?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load agent reporting.");
        if (!controller.signal.aborted) setReport(body.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load agent reporting.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applied, requestNumber]);

  const names = new Map(
    report?.agents.map((agent) => [
      agent.id,
      `${agent.displayName} · ${agent.runtime ?? agent.source} · ${agent.id.slice(-8)}`,
    ]) ?? [],
  );
  const combined = useMemo(() => combineReportDays(report?.days ?? []), [report]);
  const comparison = useMemo(
    () =>
      [...(report?.days ?? [])].sort(
        (a, b) => a.date.localeCompare(b.date) || a.agentId.localeCompare(b.agentId),
      ),
    [report],
  );
  const rows = mode === "combined" ? combined : comparison;
  const maximum = Math.max(0, ...rows.map((row) => row[metric] ?? 0));
  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (
      Date.parse(end) < Date.parse(start) ||
      Date.parse(end) - Date.parse(start) >= 366 * 86_400_000
    ) {
      setError("Choose an inclusive date range of 1 to 366 days.");
      return;
    }
    setApplied({ start, end, selected });
    setRequestNumber((number) => number + 1);
  };
  const visibleAgents =
    report?.agents.filter((agent) =>
      names.get(agent.id)?.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const ready = report && !loading && !error;
  return createPortal(
    <div className="agent-reports-overlay">
      <div
        className="agent-reports"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
      >
        <header className="report-header">
          <div>
            <h2 id="report-title">Agent reporting</h2>
            <p>Daily activity and recorded usage · UTC calendar days</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close agent reporting"
          >
            Close
          </button>
        </header>
        <form className="report-filters" onSubmit={apply}>
          <div className="report-date-filters">
            <label>
              From (UTC)
              <input
                type="date"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              Through (UTC)
              <input
                type="date"
                required
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <button type="submit" disabled={loading}>
              Apply filters / refresh
            </button>
          </div>
          <fieldset>
            <legend>Agents ({selected.length}/50 selected)</legend>
            <label>
              Find an agent
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button type="button" onClick={() => setSelected([])}>
              Clear selection
            </button>
            <div className="report-agent-options">
              {visibleAgents.map((agent) => (
                <label key={agent.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(agent.id)}
                    disabled={selected.length >= 50 && !selected.includes(agent.id)}
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, agent.id]
                          : ids.filter((id) => id !== agent.id),
                      )
                    }
                  />
                  {names.get(agent.id)}
                </label>
              ))}
            </div>
            {report?.agents.length === 0 && <p>No agents have been recorded yet.</p>}
          </fieldset>
        </form>
        {loading && <p role="status">Loading report…</p>}
        {error && <p role="alert">{error}</p>}
        {ready && (
          <>
            <p className="report-note">
              Select one agent or any combination, then apply filters. Combined time is agent-hours:
              simultaneous agents add together. Idle and prompt-waiting time are excluded.
            </p>
            <div className="report-chart-controls">
              <label>
                Chart metric
                <select
                  value={metric}
                  onChange={(event) => setMetric(event.target.value as Metric)}
                >
                  {(Object.entries(metrics) as [Metric, string][]).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                View
                <select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="combined">Combined selection</option>
                  <option value="comparison">Compare agents</option>
                </select>
              </label>
            </div>
            {rows.length ? (
              <>
                <section aria-label={`Daily ${metrics[metric]} chart`} className="report-chart">
                  <h3>{metrics[metric]} by day</h3>
                  {rows.map((row) => (
                    <div className="report-chart-row" key={`${row.agentId}:${row.date}`}>
                      <span>
                        {row.date}
                        {mode === "comparison" && <small>{names.get(row.agentId)}</small>}
                      </span>
                      <div className="report-track" aria-hidden="true">
                        <div
                          className="report-bar"
                          style={{
                            width: `${maximum ? ((row[metric] ?? 0) / maximum) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span>{reportValue(row, metric)}</span>
                    </div>
                  ))}
                </section>
                <div
                  className="report-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable daily report"
                >
                  <table>
                    <caption>
                      Daily recorded totals (
                      {mode === "combined" ? "combined selection" : "per agent"})
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Day (UTC)</th>
                        {mode === "comparison" && <th scope="col">Agent</th>}
                        {(Object.entries(metrics) as [Metric, string][]).map(([key, label]) => (
                          <th key={key} scope="col">
                            {label}
                          </th>
                        ))}
                        <th scope="col">Recorded model calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.agentId}:${row.date}`}>
                          <th scope="row">{row.date}</th>
                          {mode === "comparison" && <td>{names.get(row.agentId)}</td>}
                          {(Object.keys(metrics) as Metric[]).map((key) => (
                            <td key={key}>{reportValue(row, key)}</td>
                          ))}
                          <td>{row.calls.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>Select at least one agent and apply filters to see daily graphs and totals.</p>
            )}
            <section className="report-note" aria-label="Report coverage">
              <h3>Coverage and limitations</h3>
              <p>
                These are sums of recorded data, not billing totals. Missing metrics are not zero. A
                combined value may cover only some selected agents. Token counts exclude cache
                counters. Usage is matched only by exact session/child identity; unmatched usage is
                never assigned to an agent.
              </p>
              <p>
                Active time is collected from local working hooks only, beginning when tracking
                starts. No earlier runtime is reconstructed. Recording pauses while this server is
                stopped. Missing stop hooks are bounded by the configured offline timeout; the most
                recent heartbeat is retained after a restart. Days with no observed hook or working
                interval show Not recorded, not zero. Waits without a stop hook cannot be
                distinguished from work. No background runtime is inferred for GitHub or demo
                agents.
              </p>
              {report.agents
                .filter((agent) => applied.selected.includes(agent.id))
                .map((agent) => (
                  <p key={agent.id}>
                    {names.get(agent.id)} — Runtime tracking:{" "}
                    {agent.trackedSince
                      ? `since ${new Date(agent.trackedSince).toISOString()}`
                      : "not available (no observed local hooks)"}
                  </p>
                ))}
              {report.sources.map((source) => (
                <p key={source.source}>
                  <strong>
                    {source.source}: {source.available ? "available" : "unavailable"}.
                  </strong>{" "}
                  {source.message}
                </p>
              ))}
              <p>
                Unattributed model calls in this range: {report.unattributed.calls.toLocaleString()}
                . Snapshot: {new Date(report.asOf).toLocaleString()}.
              </p>
            </section>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
