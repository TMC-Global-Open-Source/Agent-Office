import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  AgentFilterTabs,
  AgentList,
  ConnectionStatus,
  StatusSummary,
  TokenUsageSummary,
} from "./App.js";
import { filterAgents } from "./store.js";
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
          },
        }),
      }),
    );
    render(<TokenUsageSummary agents={[sample]} />);
    expect(await screen.findByText((12345).toLocaleString())).toBeInTheDocument();
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

  it("filters by state, repository, and case-insensitive search", () => {
    expect(filterAgents([sample], "working", "ARIA")).toHaveLength(1);
    expect(filterAgents([sample], "idle", "agent-office")).toHaveLength(0);
    expect(filterAgents([sample], "all", "sample-org")).toHaveLength(1);
    expect(filterAgents([sample], "all", "", "sample-org/agent-office")).toHaveLength(1);
    expect(filterAgents([sample], "all", "", "other/repo")).toHaveLength(0);
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
