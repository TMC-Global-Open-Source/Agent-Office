import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  AgentFilterTabs,
  AgentDetails,
  AgentList,
  ConnectionStatus,
  StatusSummary,
  TokenUsageSummary,
  UsageByFolder,
} from "./App.js";
import { filterAgents, useOfficeStore } from "./store.js";
import type { Agent } from "@agent-office/shared";

const sample: Agent = {
  id: "demo",
  displayName: "Aria Chen",
  source: "mock",
  repositoryOwner: "sample-org",
  repositoryName: "agent-office",
  issueNumber: null,
  pullRequestNumber: 10,
  taskTitle: "Add project search",
  taskUrl: null,
  status: "working",
  statusReason: "Demo status: working.",
  statusEvidence: [],
  statusConfidence: 1,
  statusKind: "mock",
  lastActivityAt: null,
  startedAt: null,
  completedAt: null,
  updatedAt: new Date().toISOString(),
  deskId: "desk-demo",
  avatarColor: "#43a5bc",
  tokensUsed: null,
  metadata: {},
};

describe("dashboard components", () => {
  it("shows folder totals and unattributed usage as separate non-additive breakdowns", () => {
    useOfficeStore.setState({
      usage: {
        available: true,
        message: "Exact matches only",
        since: "2026-09-14T00:00:00Z",
        asOf: "2026-10-14T00:00:00Z",
        agents: [],
        sources: [
          {
            source: "vscode",
            available: true,
            message: "VS Code chat requests",
            inputTokens: 200,
            outputTokens: 50,
            calls: 2,
            aiCredits: 1,
            aiCreditCalls: 2,
          },
        ],
        folders: [
          {
            folder: "ConnectWise Main",
            repositories: ["org/repo"],
            sources: ["copilot-cli", "vscode"],
            inputTokens: 500,
            outputTokens: 100,
            calls: 5,
            sessions: 2,
            aiCredits: 2.5,
            aiCreditCalls: 5,
          },
        ],
        unattributed: {
          inputTokens: 500,
          outputTokens: 100,
          calls: 5,
          aiCredits: 2.5,
          aiCreditCalls: 5,
        },
      },
      usageError: null,
    });
    const { unmount } = render(<UsageByFolder />);
    expect(screen.getByText("By folder · 30 days")).toBeInTheDocument();
    expect(screen.getByText("ConnectWise Main")).toBeInTheDocument();
    expect(screen.getByText("Repository: org/repo")).toBeInTheDocument();
    expect(screen.getByText(/Copilot CLI \+ VS Code/)).toBeInTheDocument();
    expect(screen.getByText("VS Code: VS Code chat requests")).toBeInTheDocument();
    expect(screen.getByText("600 tokens")).toBeInTheDocument();
    expect(screen.getByText("AI credits: 2.5")).toBeInTheDocument();
    expect(
      screen.getByText("Unattributed to office agents: 600 tokens · AI credits: 2.5 · 5 calls."),
    ).toBeInTheDocument();
    unmount();
    useOfficeStore.setState({ usage: null });
  });
  it("shows exact per-agent counts without assigning repository totals to other agents", () => {
    useOfficeStore.setState({
      usage: {
        available: true,
        message: "Exact matches only",
        since: "2026-09-14T00:00:00Z",
        asOf: "2026-10-14T00:00:00Z",
        agents: [
          {
            agentId: sample.id,
            folder: "repo",
            repository: "org/repo",
            inputTokens: 12,
            outputTokens: 3,
            calls: 1,
            aiCredits: 0.5,
            aiCreditCalls: 1,
          },
        ],
        sources: [],
        folders: [
          {
            folder: "repo",
            repositories: ["org/repo"],
            sources: ["copilot-cli"],
            inputTokens: 500,
            outputTokens: 100,
            calls: 5,
            sessions: 2,
            aiCredits: 2.5,
            aiCreditCalls: 5,
          },
        ],
        unattributed: {
          inputTokens: 488,
          outputTokens: 97,
          calls: 4,
          aiCredits: 2,
          aiCreditCalls: 4,
        },
      },
    });
    const { unmount } = render(
      <AgentList
        agents={[sample, { ...sample, id: "unmatched", displayName: "Other agent" }]}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Tokens used: 15 · 0.5 AI credits · 30 days")).toBeInTheDocument();
    expect(screen.getByText("Tokens used: Not reported")).toBeInTheDocument();
    expect(screen.queryByText("600")).not.toBeInTheDocument();
    unmount();
    useOfficeStore.setState({ usage: null });
  });
  it("uses the source display setting in agent list names", () => {
    useOfficeStore.setState({ showAgentSource: false });
    render(
      <AgentList
        agents={[{ ...sample, source: "local", displayName: "Copilot CLI · Office" }]}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Office")).toBeInTheDocument();
    expect(screen.queryByText("Copilot CLI · Office")).not.toBeInTheDocument();
    act(() => useOfficeStore.setState({ showAgentSource: true }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it("shows token telemetry availability without treating missing counts as zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { available: false, message: "No local database." } }),
      }),
    );
    const { rerender } = render(<TokenUsageSummary agents={[sample]} />);
    expect(await screen.findByText("No local database.")).toBeInTheDocument();
    expect(screen.getByText("No token counts reported yet.")).toBeInTheDocument();
    rerender(<TokenUsageSummary agents={[sample, { ...sample, id: "reported", tokensUsed: 0 }]} />);
    expect(screen.getByText("1 of 2 agents have reported token counts.")).toBeInTheDocument();
  });

  it("shows independent historical totals without assigning them to agents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            available: true,
            message: "Recorded local usage.",
            since: "2026-09-14T00:00:00Z",
            asOf: "2026-10-14T00:00:00Z",
            inputTokens: 12345,
            outputTokens: 0,
            calls: 3,
            callsWithTokenCounts: 2,
            aiCredits: 7.25,
            aiCreditCalls: 3,
            sources: [
              {
                source: "copilot-cli",
                available: true,
                message: "CLI",
                inputTokens: 12000,
                outputTokens: 0,
                calls: 1,
                aiCredits: 5,
                aiCreditCalls: 1,
              },
              {
                source: "vscode",
                available: false,
                message: "Not found",
                inputTokens: null,
                outputTokens: null,
                calls: 0,
                aiCredits: null,
                aiCreditCalls: 0,
              },
            ],
          },
        }),
      }),
    );
    render(<TokenUsageSummary agents={[sample]} />);
    expect(await screen.findByText((12345).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText("AI credits")).toBeInTheDocument();
    expect(
      screen.getByText((7.3).toLocaleString(undefined, { minimumFractionDigits: 1 })),
    ).toBeInTheDocument();
    expect(screen.getByText("Copilot CLI")).toBeInTheDocument();
    expect(
      screen.getByText(
        `${(5).toLocaleString(undefined, { minimumFractionDigits: 1 })} AI credits · ${(12000).toLocaleString()} tokens · 1 calls`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText("No token counts reported yet.")).toBeInTheDocument();
    const notes = screen.getByText("Source & coverage").closest("details");
    expect(notes).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Source & coverage"));
    expect(notes).toHaveAttribute("open");
    expect(screen.getByText(/No Cost Lens dependency/)).toBeInTheDocument();
  });

  it("shows reported token counts and unknown usage in the agent list", () => {
    render(
      <AgentList
        agents={[sample, { ...sample, id: "reported", tokensUsed: 12345 }]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Tokens used: Not reported")).toBeInTheDocument();
    expect(screen.getByText(`Tokens used: ${(12345).toLocaleString()}`)).toBeInTheDocument();
  });
  it("shows last-seen time for offline agents", () => {
    render(
      <AgentList
        agents={[{ ...sample, status: "offline", lastActivityAt: "2026-10-14T00:00:00Z" }]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Last seen /)).toBeInTheDocument();
    expect(screen.getByText("Activity: Away")).toBeInTheDocument();
  });
  it("summarizes normalized agent states with readable labels", () => {
    render(<StatusSummary agents={[sample]} />);
    expect(screen.getByLabelText("1 Working")).toBeInTheDocument();
    expect(screen.getByLabelText("0 Needs attention")).toBeInTheDocument();
  });

  it("exposes the agent list as keyboard-activatable buttons", () => {
    const onSelect = vi.fn();
    render(<AgentList agents={[sample]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Aria Chen/ }));
    expect(onSelect).toHaveBeenCalledWith("demo");
  });

  it("closes the agent profile on an outside click or Escape, but not on drags or inside clicks", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    );
    const onClose = vi.fn();
    render(
      <>
        <div data-testid="outside" />
        <AgentDetails agent={sample} onClose={onClose} />
      </>,
    );
    // jsdom has no PointerEvent; MouseEvents with pointer event names carry the coordinates.
    const pointer = (target: Element, type: string, clientX: number) =>
      act(() => {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY: 10 }));
      });
    const panel = screen.getByLabelText("Aria Chen details");
    pointer(panel, "pointerdown", 1);
    pointer(panel, "pointerup", 1);
    expect(onClose).not.toHaveBeenCalled();
    const outside = screen.getByTestId("outside");
    pointer(outside, "pointerdown", 10);
    pointer(outside, "pointerup", 80);
    expect(onClose).not.toHaveBeenCalled();
    pointer(outside, "pointerdown", 10);
    pointer(outside, "pointerup", 11);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("filters by state and case-insensitive search", () => {
    expect(filterAgents([sample], "working", "ARIA")).toHaveLength(1);
    expect(filterAgents([sample], "idle", "agent-office")).toHaveLength(0);
    expect(filterAgents([sample], "all", "sample-org")).toHaveLength(1);
  });

  it("provides accessible filter and disconnected controls", () => {
    const onChange = vi.fn();
    render(
      <>
        <AgentFilterTabs value="all" onChange={onChange} />
        <ConnectionStatus connected={false} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    expect(onChange).toHaveBeenCalledWith("needs_attention");
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");
  });
});
