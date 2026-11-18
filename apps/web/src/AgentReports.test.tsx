import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { AgentReport, AgentReportDay } from "@agent-office/shared";
import { AgentReports, combineReportDays, reportValue } from "./AgentReports.js";

const day: AgentReportDay = {
  agentId: "agent-one",
  date: "2026-11-18",
  workingMilliseconds: 60_000,
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
      trackedSince: "2026-11-17T00:00:00Z",
    },
    {
      id: "agent-two",
      displayName: "Agent Two",
      source: "local",
      runtime: "vscode",
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
    expect(
      screen.getByRole("region", { name: "Daily Active working time chart" }),
    ).toHaveTextContent("0h 1m 0s");
    expect(screen.getByText("VS Code history not found.", { exact: false })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-11-18" } });
    fireEvent.change(screen.getByLabelText("Through (UTC)"), { target: { value: "2026-11-18" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Agent Two/ }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply filters / refresh" })),
    );
    const url = new URL(fetchMock.mock.calls.at(-1)?.[0], "http://localhost");
    expect(url.searchParams.get("start")).toBe("2026-11-18");
    expect(url.searchParams.get("end")).toBe("2026-11-18");
    expect(url.searchParams.getAll("agentId")).toEqual(["agent-one", "agent-two"]);
    fireEvent.change(screen.getByLabelText("Chart metric"), { target: { value: "aiCredits" } });
    expect(screen.getByRole("region", { name: "Daily AI credits chart" })).toHaveTextContent(
      "1.25 (partial)",
    );
    fireEvent.change(screen.getByLabelText("View"), { target: { value: "comparison" } });
    expect(
      within(screen.getByRole("table")).getByRole("columnheader", { name: "Agent" }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText(/Agent One/)).toBeInTheDocument();
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
