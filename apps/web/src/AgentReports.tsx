import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { AgentReport, AgentReportDay } from "@agent-office/shared";
import "./agent-reports.css";

type Metric =
  "workingMilliseconds" | "estimatedMilliseconds" | "aiCredits" | "inputTokens" | "outputTokens";
type ReportRow = AgentReportDay & { partialMetrics?: Metric[] };
const metrics: Record<Metric, string> = {
  workingMilliseconds: "Active working time",
  estimatedMilliseconds: "Estimated historical time",
  aiCredits: "AI credits",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
};
const dateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const recentRange = (days: number) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  return { start: dateString(start), end: dateString(end) };
};
const duration = (value: number) => {
  const seconds = Math.floor(value / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
};
export function reportValue(row: ReportRow, metric: Metric): string {
  const value = row[metric];
  if (value === null) return "Not recorded";
  if (metric === "workingMilliseconds" || metric === "estimatedMilliseconds")
    return `${duration(value)}${row.partialMetrics?.includes(metric) ? " (partial)" : ""}`;
  const calls =
    metric === "aiCredits"
      ? row.aiCreditCalls
      : metric === "inputTokens"
        ? row.inputTokenCalls
        : row.outputTokenCalls;
  const maximumFractionDigits = metric === "aiCredits" ? (Math.abs(value) < 0.01 ? 9 : 2) : 0;
  return `${value.toLocaleString(undefined, { maximumFractionDigits })}${calls < row.calls || row.partialMetrics?.includes(metric) ? " (partial)" : ""}`;
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
  const [start, setStart] = useState(() => recentRange(7).start);
  const [end, setEnd] = useState(() => recentRange(7).end);
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [selected, setSelected] = useState<string[]>(initialAgentId ? [initialAgentId] : []);
  const [allAgents, setAllAgents] = useState(false);
  const [metric, setMetric] = useState<Metric>("estimatedMilliseconds");
  const [mode, setMode] = useState("comparison");
  const [report, setReport] = useState<AgentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [agentsExpanded, setAgentsExpanded] = useState(!initialAgentId);
  const [requestNumber, setRequestNumber] = useState(0);
  const [applied, setApplied] = useState({ start, end, selected, allAgents });
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
    const query = new URLSearchParams({ start: applied.start, end: applied.end, timeZone });
    if (applied.allAgents) query.set("allAgents", "true");
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
  }, [applied, requestNumber, timeZone]);

  const names = new Map(
    report?.agents.map((agent) => [
      agent.id,
      `${agent.displayName} · ${agent.runtime ?? agent.source} · ${agent.id.slice(-8)}`,
    ]) ?? [],
  );
  const repositories = new Map(
    report?.agents.map((agent) => [
      agent.id,
      agent.repositories.length ? agent.repositories.join(", ") : "Not reported",
    ]) ?? [],
  );
  const combined = useMemo(() => combineReportDays(report?.days ?? []), [report]);
  const totals = useMemo(
    () => combineReportDays((report?.days ?? []).map((day) => ({ ...day, date: "total" })))[0],
    [report],
  );
  const recordedDays = useMemo(
    () =>
      (report?.days ?? []).filter(
        (day) =>
          day.calls > 0 || (Object.keys(metrics) as Metric[]).some((key) => day[key] !== null),
      ),
    [report],
  );
  const agentsWithRecords = useMemo(
    () => new Set(recordedDays.map((day) => day.agentId)),
    [recordedDays],
  );
  const comparison = useMemo(
    () =>
      [...recordedDays].sort(
        (a, b) => a.date.localeCompare(b.date) || a.agentId.localeCompare(b.agentId),
      ),
    [recordedDays],
  );
  const rows = mode === "combined" ? combined : comparison;
  const maximum = rows.reduce((max, row) => Math.max(max, row[metric] ?? 0), 0);
  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (
      Date.parse(end) < Date.parse(start) ||
      Date.parse(end) - Date.parse(start) >= 366 * 86_400_000
    ) {
      setError("Choose an inclusive date range of 1 to 366 days.");
      return;
    }
    setApplied({ start, end, selected, allAgents });
    setRequestNumber((number) => number + 1);
    if (allAgents || selected.length) setAgentsExpanded(false);
  };
  const applyPreset = (days: number) => {
    const range = recentRange(days);
    setStart(range.start);
    setEnd(range.end);
    setApplied({ ...range, selected, allAgents });
    setRequestNumber((number) => number + 1);
    if (allAgents || selected.length) setAgentsExpanded(false);
  };
  const visibleAgents =
    report?.agents.filter(
      (agent) =>
        (!selectedOnly || selected.includes(agent.id)) &&
        `${names.get(agent.id)} ${repositories.get(agent.id)}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    ) ?? [];
  const additionalAgents = visibleAgents.filter((agent) => !selected.includes(agent.id));
  const filtersChanged =
    start !== applied.start ||
    end !== applied.end ||
    allAgents !== applied.allAgents ||
    selected.length !== applied.selected.length ||
    selected.some((id) => !applied.selected.includes(id));
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
            <p>Daily activity and recorded usage · {timeZone} calendar days</p>
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
        <div className="report-workspace">
          <form className="report-filters" onSubmit={apply}>
            <h3>Filters</h3>
            <fieldset>
              <legend>Date range</legend>
              <div className="report-date-presets" aria-label="Quick date ranges">
                <button type="button" onClick={() => applyPreset(1)}>
                  Today
                </button>
                <button type="button" onClick={() => applyPreset(7)}>
                  Last 7 days
                </button>
                <button type="button" onClick={() => applyPreset(30)}>
                  Last 30 days
                </button>
              </div>
              <div className="report-date-filters">
                <label>
                  From
                  <input
                    type="date"
                    required
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label>
                  Through
                  <input
                    type="date"
                    required
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>
                Agents ({allAgents ? "all selected" : `${selected.length}/50 selected`})
              </legend>
              {allAgents ? (
                <p className="report-hint">All recorded agents are selected.</p>
              ) : selected.length ? (
                <div className="report-selected-agents" aria-label="Selected agents">
                  {selected.map((id) => (
                    <button
                      type="button"
                      key={id}
                      className="report-selected-agent"
                      aria-label={`Remove ${names.get(id) ?? id}`}
                      onClick={() => setSelected((ids) => ids.filter((item) => item !== id))}
                    >
                      <span>{names.get(id) ?? id}</span>
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="report-hint">Choose one or more agents.</p>
              )}
              <div className="report-agent-actions">
                <button
                  type="button"
                  aria-pressed={allAgents}
                  onClick={() => {
                    setAllAgents(true);
                    setSelected([]);
                    setSelectedOnly(false);
                    setAgentsExpanded(false);
                  }}
                >
                  Select all agents
                </button>
                <button
                  type="button"
                  aria-expanded={agentsExpanded}
                  aria-controls="report-agent-picker"
                  onClick={() => {
                    if (allAgents) {
                      setAllAgents(false);
                      setAgentsExpanded(true);
                    } else {
                      setAgentsExpanded((value) => !value);
                    }
                  }}
                >
                  {allAgents
                    ? "Choose individual agents"
                    : agentsExpanded
                      ? "Hide agent list"
                      : "Choose agents"}
                </button>
                {(allAgents || selected.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAllAgents(false);
                      setSelected([]);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {agentsExpanded && (
                <div id="report-agent-picker" className="report-agent-picker">
                  <label className="report-agent-search">
                    Find an agent
                    <input
                      type="search"
                      placeholder="Search name, ID, or repository"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <div className="report-agent-actions">
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedOnly}
                        onChange={(event) => setSelectedOnly(event.target.checked)}
                      />
                      Selected only
                    </label>
                    <button
                      type="button"
                      disabled={
                        additionalAgents.length === 0 ||
                        selected.length + additionalAgents.length > 50
                      }
                      onClick={() =>
                        setSelected((ids) => [...ids, ...additionalAgents.map((agent) => agent.id)])
                      }
                    >
                      Select visible
                    </button>
                  </div>
                  <p className="report-hint">
                    {visibleAgents.length} shown
                    {selected.length + additionalAgents.length > 50
                      ? " · Refine the search to select up to 50."
                      : ""}
                  </p>
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
                        <span>{names.get(agent.id)}</span>
                      </label>
                    ))}
                    {report && visibleAgents.length === 0 && (
                      <p className="report-hint">No matching agents.</p>
                    )}
                  </div>
                </div>
              )}
              {report?.agents.length === 0 && <p>No agents have been recorded yet.</p>}
            </fieldset>
            <button type="submit" className="report-apply" disabled={loading}>
              {loading ? "Loading…" : "Apply filters / refresh"}
            </button>
            {filtersChanged && (
              <p className="report-hint" role="status">
                Filters changed. Apply to update the report.
              </p>
            )}
          </form>
          <section className="report-results" aria-label="Report results">
            {loading && <p role="status">Loading report…</p>}
            {error && <p role="alert">{error}</p>}
            {ready && (
              <>
                <div className="report-results-heading">
                  <div>
                    <h3>Report overview</h3>
                    <p>
                      {applied.start} to {applied.end} ·{" "}
                      {applied.allAgents
                        ? `All ${report.agents.length} agents`
                        : `${applied.selected.length} ${applied.selected.length === 1 ? "agent" : "agents"}`}
                    </p>
                  </div>
                </div>
                <p className="report-hint">
                  Select a total to change the chart. Totals can be partial and are not billing
                  figures.
                </p>
                {applied.allAgents && (
                  <p className="report-hint">
                    All recorded agents are included. Usage that cannot be attributed to an agent is
                    excluded; see Coverage and limitations.
                  </p>
                )}
                <div className="report-summary" aria-label="Report totals">
                  {(["estimatedMilliseconds", "aiCredits"] as const).map((key) => (
                    <button
                      type="button"
                      key={key}
                      className="report-summary-card"
                      aria-pressed={metric === key}
                      onClick={() => setMetric(key)}
                    >
                      <span>{metrics[key]}</span>
                      <strong>{totals ? reportValue(totals, key) : "Select agents"}</strong>
                    </button>
                  ))}
                </div>
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
                            {mode === "comparison" && (
                              <>
                                <small>{names.get(row.agentId)}</small>
                                <small>Repository: {repositories.get(row.agentId)}</small>
                              </>
                            )}
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
                            <th scope="col">Day ({report.timezone})</th>
                            {mode === "comparison" && (
                              <>
                                <th scope="col">Agent</th>
                                <th scope="col">Repository</th>
                              </>
                            )}
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
                              {mode === "comparison" && (
                                <>
                                  <td>{names.get(row.agentId)}</td>
                                  <td>{repositories.get(row.agentId)}</td>
                                </>
                              )}
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
                  <p className="report-empty">
                    {applied.allAgents || applied.selected.length > 0
                      ? "No records for the selected agents in this date range."
                      : "Select at least one agent and apply filters to see daily graphs and totals."}
                  </p>
                )}
                <details className="report-note" aria-label="Report coverage">
                  <summary>Coverage and limitations</summary>
                  <p>
                    These are sums of recorded data, not billing totals. Missing metrics are not
                    zero. A combined value may cover only some selected agents. Token counts exclude
                    cache counters and VS Code's context-cumulative counts. Usage is matched only by
                    exact session/child identity; unmatched usage is never assigned to an agent.
                  </p>
                  <p>
                    Active time is collected from local working hooks only, beginning when tracking
                    starts. Recording pauses while this server is stopped. Missing stop hooks are
                    bounded by the configured offline timeout; the most recent heartbeat is retained
                    after a restart. Days with no observed hook or working interval show Not
                    recorded, not zero. Waits without a stop hook cannot be distinguished from work.
                    No background runtime is inferred for GitHub or demo agents.
                  </p>
                  <p>
                    Estimated historical time is separate from hook-recorded time and must not be
                    added to it. It includes measured CLI model durations and VS Code turn durations
                    (capped at 20 minutes each), with overlaps removed per agent. It may omit tool
                    work or other activity and is not a continuous runtime or billing total. Log
                    recovery is available in this report only and may be incomplete.
                  </p>
                  {report.agents
                    .filter((agent) => agentsWithRecords.has(agent.id))
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
                    Unattributed model calls in this range:{" "}
                    {report.unattributed.calls.toLocaleString()}. Snapshot:{" "}
                    {new Date(report.asOf).toLocaleString()}.
                  </p>
                </details>
              </>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
