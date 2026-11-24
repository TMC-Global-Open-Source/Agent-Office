import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { AgentReport, AgentReportDay } from "@agent-office/shared";
import { AgentReports, combineReportDays, reportValue } from "./AgentReports.js";

const day: AgentReportDay = {
  agentId: "agent-one",
  date: "2026-11-18",
  workingMilliseconds: 60_000,
  estimatedMilliseconds: 45_000,
  inputTokens: 0,
  outputTokens: null,
  calls: 2,
  aiCredits: 1.25,
  aiCreditCalls: 1,
  inputTokenCalls: 1,
  outputTokenCalls: 0,
};
const fixture: AgentReport = {
  start: "2026-11-18",
  end: "2026-11-18",
  timezone: "UTC",
  asOf: "2026-11-18T12:00:00Z",
  agents: [
    {
      id: "agent-one",
      displayName: "Agent One",
      source: "local",
      runtime: "copilot-cli",
      repositories: ["owner/project"],
      trackedSince: "2026-11-17T00:00:00Z",
    },
    {
      id: "agent-two",
      displayName: "Agent Two",
      source: "local",
      runtime: "vscode",
      repositories: [],
      trackedSince: null,
    },
  ],
  days: [day],
  sources: [
    {
      source: "vscode",
      available: false,
      message: "VS Code history not found.",
      inputTokens: null,
      outputTokens: null,
      calls: 0,
      aiCredits: null,
      aiCreditCalls: 0,
    },
  ],
  unattributed: {
    inputTokens: null,
    outputTokens: null,
    calls: 3,
    aiCredits: null,
    aiCreditCalls: 0,
  },
};
afterEach(() => vi.unstubAllGlobals());
describe("agent reporting", () => {
  it("sums a group without converting unknown values to zero or hiding incomplete members", () => {
    const result = combineReportDays([
      day,
      {
        ...day,
        agentId: "agent-two",
        workingMilliseconds: null,
        inputTokens: null,
        calls: 0,
        aiCredits: 0,
        aiCreditCalls: 0,
      },
    ]);
    expect(result[0]?.inputTokens).toBe(0);
    expect(result[0]?.outputTokens).toBeNull();
    expect(reportValue(result[0]!, "workingMilliseconds")).toBe("0h 1m 0s (partial)");
    expect(reportValue(result[0]!, "aiCredits")).toContain("partial");
    expect(reportValue(result[0]!, "outputTokens")).toBe("Not recorded");
    expect(reportValue({ ...day, aiCredits: 377.6450055, calls: 1 }, "aiCredits")).toBe("377.65");
    expect(reportValue({ ...day, aiCredits: 0.000000001, calls: 1 }, "aiCredits")).toBe(
      "0.000000001",
    );
  });
  it("loads a selected agent, applies arbitrary selections/dates, and switches chart and comparison views", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: fixture }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentReports initialAgentId="agent-one" onClose={vi.fn()} />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByLabelText("View")).toHaveValue("comparison");
    expect(
      within(screen.getByRole("table")).getByRole("columnheader", { name: "Repository" }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("owner/project")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Daily Estimated historical time chart" }),
    ).toHaveTextContent("0h 0m 45s");
    const totals = screen.getByLabelText("Report totals");
    expect(
      within(totals).getByRole("button", { name: /Estimated historical time/ }),
    ).toHaveTextContent("0h 0m 45s");
    expect(within(totals).getByRole("button", { name: /AI credits/ })).toHaveTextContent(
      "1.25 (partial)",
    );
    expect(screen.getByRole("button", { name: /Remove Agent One/ })).toBeInTheDocument();
    expect(screen.getByText("VS Code history not found.", { exact: false })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-18" } });
    fireEvent.change(screen.getByLabelText("Through"), { target: { value: "2026-11-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose agents" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Agent Two/ }));
    expect(screen.getByText("Filters changed. Apply to update the report.")).toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply filters / refresh" })),
    );
    const url = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(url.searchParams.get("start")).toBe("2026-11-18");
    expect(url.searchParams.get("end")).toBe("2026-11-18");
    expect(url.searchParams.get("timeZone")).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    expect(url.searchParams.getAll("agentId")).toEqual(["agent-one", "agent-two"]);
    fireEvent.click(
      within(screen.getByLabelText("Report totals")).getByRole("button", { name: /AI credits/ }),
    );
    expect(screen.getByRole("region", { name: "Daily AI credits chart" })).toHaveTextContent(
      "1.25 (partial)",
    );
    fireEvent.change(screen.getByLabelText("View"), { target: { value: "comparison" } });
    expect(
      within(screen.getByRole("table")).getByRole("columnheader", { name: "Agent" }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText(/Agent One/)).toBeInTheDocument();
  });
  it("searches and selects visible agents, then applies quick date ranges", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: fixture }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentReports onClose={vi.fn()} />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Find an agent"), { target: { value: "agent two" } });
    expect(screen.queryByRole("checkbox", { name: /Agent One/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select visible" }));
    expect(screen.getByRole("button", { name: /Remove Agent Two/ })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Today" })));
    const url = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(url.searchParams.get("start")).toBe(url.searchParams.get("end"));
    expect(url.searchParams.getAll("agentId")).toEqual(["agent-two"]);
    expect(screen.getByRole("button", { name: "Choose agents" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
  it("selects all agents regardless of search and the individual selection limit", async () => {
    const agents = Array.from({ length: 55 }, (_, i) => ({
      ...fixture.agents[0]!,
      id: `agent-${i}`,
      displayName: `Agent ${i}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { ...fixture, agents, days: agents.map((agent) => ({ ...day, agentId: agent.id })) },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentReports onClose={vi.fn()} />);
    await screen.findByText("55 shown · Refine the search to select up to 50.");
    fireEvent.change(screen.getByLabelText("Find an agent"), { target: { value: "agent 1" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-18" } });
    fireEvent.change(screen.getByLabelText("Through"), { target: { value: "2026-11-19" } });
    fireEvent.click(screen.getByRole("button", { name: "Select all agents" }));
    expect(screen.getByText("All recorded agents are selected.")).toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply filters / refresh" })),
    );
    let url = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(url.searchParams.get("allAgents")).toBe("true");
    expect(url.searchParams.getAll("agentId")).toEqual([]);
    expect(url.searchParams.get("start")).toBe("2026-11-18");
    expect(url.searchParams.get("end")).toBe("2026-11-19");
    expect(screen.getByText(/All 55 agents/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be attributed to an agent/)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Today" })));
    url = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(url.searchParams.get("allAgents")).toBe("true");
    expect(url.searchParams.get("start")).toBe(url.searchParams.get("end"));
    fireEvent.click(screen.getByRole("button", { name: "Choose individual agents" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Agent 1 ·/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply filters / refresh" })),
    );
    url = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(url.searchParams.has("allAgents")).toBe(false);
    expect(url.searchParams.getAll("agentId")).toEqual(["agent-1"]);
  });
  it("omits unrecorded agent-days from comparisons but retains recorded zeroes and calls", async () => {
    const emptyDay: AgentReportDay = {
      ...day,
      workingMilliseconds: null,
      estimatedMilliseconds: null,
      aiCredits: null,
      inputTokens: null,
      outputTokens: null,
      calls: 0,
      aiCreditCalls: 0,
      inputTokenCalls: 0,
      outputTokenCalls: 0,
    };
    const emptyAgent = { ...fixture.agents[0]!, id: "agent-empty", displayName: "Empty Agent" };
    const response = {
      ...fixture,
      agents: [...fixture.agents, emptyAgent],
      days: [
        day,
        { ...emptyDay, date: "2026-11-19" },
        { ...emptyDay, agentId: "agent-two", date: "2026-11-18" },
        { ...emptyDay, agentId: "agent-two", date: "2026-11-19", workingMilliseconds: 0 },
        { ...emptyDay, agentId: "agent-two", date: "2026-11-20", calls: 1 },
        { ...emptyDay, agentId: "agent-empty" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: response }) }),
    );
    render(<AgentReports initialAgentId="agent-one" onClose={vi.fn()} />);
    await screen.findByRole("table");
    const total = within(screen.getByLabelText("Report totals")).getByRole("button", {
      name: /AI credits/,
    });
    expect(total).toHaveTextContent("1.25 (partial)");
    fireEvent.change(screen.getByLabelText("View"), { target: { value: "comparison" } });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Agent One");
    expect(rows[1]).toHaveTextContent("Agent Two");
    expect(rows[1]).toHaveTextContent("0h 0m 0s");
    expect(rows[1]).toHaveTextContent("Not reported");
    expect(rows[2]).toHaveTextContent("2026-11-20");
    expect(screen.getByLabelText("Report totals")).toHaveTextContent("1.25 (partial)");
    expect(screen.getByLabelText("Report coverage")).not.toHaveTextContent("Empty Agent");
  });
  it("explains when a selected agent has no comparison records", async () => {
    const emptyDay = {
      ...day,
      workingMilliseconds: null,
      estimatedMilliseconds: null,
      aiCredits: null,
      inputTokens: null,
      outputTokens: null,
      calls: 0,
      aiCreditCalls: 0,
      inputTokenCalls: 0,
      outputTokenCalls: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { ...fixture, days: [emptyDay] } }),
      }),
    );
    render(<AgentReports initialAgentId="agent-one" onClose={vi.fn()} />);
    expect(
      await screen.findByText("No records for the selected agents in this date range."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("reports load failures, supports retry, and closes with Escape", async () => {
    const close = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Usage database is locked." } }),
      })
      .mockResolvedValue({ ok: true, json: async () => ({ data: { ...fixture, days: [] } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentReports onClose={close} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Usage database is locked.");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply filters / refresh" })),
    );
    expect(screen.getByText(/Select at least one agent/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("cancels a pending request when the report is closed", async () => {
    let resolveOlder: ((value: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: fixture }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, json: async () => ({ data: { ...fixture, days: [] } }) });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<AgentReports initialAgentId="agent-one" onClose={vi.fn()} />);
    await screen.findByRole("table");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply filters / refresh" })),
    );
    unmount();
    await act(async () => resolveOlder?.({ ok: true, json: async () => ({ data: fixture }) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[1].signal.aborted).toBe(true);
  });
});
