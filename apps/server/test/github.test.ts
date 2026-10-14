import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listForOrg: vi.fn(),
  listPulls: vi.fn(),
  listCommits: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    repos = { listForOrg: api.listForOrg };
    pulls = { list: api.listPulls, listCommits: api.listCommits };
    rateLimit = { get: api.rateLimit };
  },
}));

import { GitHubAgentProvider } from "../src/providers/github.js";

describe("GitHub adapter normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const recent = new Date().toISOString();
    api.listForOrg.mockResolvedValue({
      data: [{ full_name: "sample-org/office", name: "office", owner: { login: "sample-org" } }],
    });
    api.listPulls.mockResolvedValue({
      data: [
        {
          number: 7,
          user: { login: "copilot-swe-agent" },
          updated_at: recent,
          created_at: "2025-12-31T23:00:00.000Z",
          closed_at: null,
          merged_at: null,
          state: "open",
          title: "Add settings",
          html_url: "https://github.com/sample-org/office/pull/7",
        },
        {
          number: 8,
          user: { login: "human-contributor" },
          updated_at: recent,
          created_at: "2025-12-31T23:00:00.000Z",
          closed_at: null,
          merged_at: null,
          state: "open",
          title: "Human change",
          html_url: "https://github.com/sample-org/office/pull/8",
        },
        {
          number: 9,
          user: { login: "copilot-agent" },
          updated_at: recent,
          created_at: "2025-12-31T23:00:00.000Z",
          closed_at: "2026-01-01T00:00:00.000Z",
          merged_at: "2026-01-01T00:00:00.000Z",
          state: "closed",
          title: "Fix tests",
          html_url: "https://github.com/sample-org/office/pull/9",
        },
      ],
    });
    api.rateLimit.mockResolvedValue({ data: { rate: { reset: 1_800_000_000 } } });
  });

  it("normalizes only matching bot pull requests and labels evidence inferred", async () => {
    const agents = await new GitHubAgentProvider().fetchAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map((agent) => agent.status)).toEqual(["working", "completed"]);
    expect(agents[0]?.statusKind).toBe("inferred");
    expect(agents[0]?.statusEvidence[0]?.url).toContain("/pull/7");
    expect(api.listPulls).toHaveBeenCalledWith(expect.objectContaining({ state: "all" }));
  });

  it("marks rate limiting unhealthy and exposes a delayed retry hint", async () => {
    const error = Object.assign(new Error("limited"), {
      status: 403,
      response: {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1800000000",
        },
      },
    });
    api.listForOrg.mockRejectedValue(error);
    const provider = new GitHubAgentProvider();
    await expect(provider.fetchAgents()).rejects.toThrow("limited");
    expect(provider.health().healthy).toBe(false);
    expect(provider.health().message).toContain("rate limit");
    expect(provider.health().rateLimitResetAt).not.toBeNull();
  });

  it("distinguishes idle and offline pull requests using configured thresholds", async () => {
    const idle = new Date(Date.now() - 20 * 60_000).toISOString();
    const offline = new Date(Date.now() - 61 * 60_000).toISOString();
    api.listPulls.mockResolvedValue({
      data: [
        {
          number: 12,
          user: { login: "copilot-agent" },
          updated_at: idle,
          created_at: "2024-12-31T23:00:00.000Z",
          closed_at: null,
          merged_at: null,
          state: "open",
          title: "Recently idle change",
          html_url: "https://github.com/sample-org/office/pull/12",
        },
        {
          number: 13,
          user: { login: "copilot-agent" },
          updated_at: offline,
          created_at: "2024-12-31T23:00:00.000Z",
          closed_at: null,
          merged_at: null,
          state: "open",
          title: "Offline change",
          html_url: "https://github.com/sample-org/office/pull/13",
        },
      ],
    });
    const provider = new GitHubAgentProvider();
    provider.updateConfig?.({
      officeTitle: "Good work happens together.",
      provider: "github",
      organization: "sample-org",
      repositories: [],
      pollingIntervalSeconds: 30,
      idleThresholdMinutes: 10,
      idleDelaySeconds: 20,
      offlineThresholdMinutes: 60,
      retainOfflineHours: 24,
      autoFocusNewAgent: true,
      questionMarkers: [],
      completionMarkers: [],
    });
    const agents = await provider.fetchAgents();
    expect(agents.map((agent) => agent.status)).toEqual(["idle", "offline"]);
    expect(agents[0]?.statusReason).toContain("idle threshold");
    expect(agents[1]?.statusReason).toContain("offline threshold");
  });

  it("applies configured question and completion markers to pull request text", async () => {
    const recent = new Date().toISOString();
    api.listPulls.mockResolvedValue({
      data: [
        {
          number: 14,
          user: { login: "copilot-agent" },
          updated_at: recent,
          created_at: recent,
          closed_at: null,
          merged_at: null,
          state: "open",
          title: "Waiting for reviewer input",
          body: "Please review this change.",
          html_url: "https://github.com/sample-org/office/pull/14",
        },
        {
          number: 15,
          user: { login: "copilot-agent" },
          updated_at: recent,
          created_at: recent,
          closed_at: null,
          merged_at: null,
          state: "open",
          title: "Office: done",
          body: null,
          html_url: "https://github.com/sample-org/office/pull/15",
        },
      ],
    });
    const provider = new GitHubAgentProvider();
    provider.updateConfig?.({
      officeTitle: "Good work happens together.",
      provider: "github",
      organization: "sample-org",
      repositories: [],
      pollingIntervalSeconds: 30,
      idleThresholdMinutes: 10,
      idleDelaySeconds: 20,
      offlineThresholdMinutes: 60,
      retainOfflineHours: 24,
      autoFocusNewAgent: true,
      questionMarkers: ["reviewer input"],
      completionMarkers: ["office: done"],
    });

    const agents = await provider.fetchAgents();

    expect(agents.map((agent) => agent.status)).toEqual(["needs_attention", "completed"]);
    expect(agents[0]?.statusReason).toContain("question or attention marker");
    expect(agents[1]?.completedAt).toBe(recent);
    expect(agents[1]?.statusReason).toContain("completion marker");
  });
});
