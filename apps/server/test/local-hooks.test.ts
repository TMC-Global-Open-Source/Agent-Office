import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalHooksProvider, normalizeLocalHookPayload } from "../src/providers/local-hooks.js";
import { defaultConfig } from "@agent-office/shared";

describe("local Copilot hook provider", () => {
  afterEach(() => vi.useRealTimers());
  it("maps office activities separately from status and resets brief reactions", async () => {
    vi.useFakeTimers();
    const provider = new LocalHooksProvider();
    const base = {
      runtime: "copilot-cli",
      sessionId: "activities",
      workspace: "project",
      timestamp: new Date().toISOString(),
    };
    expect(
      provider.recordEvent({ ...base, event: "preToolUse", toolName: "view" }).metadata
        .officeActivity,
    ).toBe("reading");
    expect(provider.recordEvent({ ...base, event: "postToolUse" }).metadata.officeActivity).toBe(
      "working",
    );
    expect(
      provider.recordEvent({ ...base, event: "preToolUse", toolName: "apply_patch" }).metadata
        .officeActivity,
    ).toBe("typing");
    expect(
      provider.recordEvent({ ...base, event: "preToolUse", toolName: "powershell" }).metadata
        .officeActivity,
    ).toBe("monitoring");
    for (const [event, activity] of [
      ["preCompact", "organizing"],
      ["postToolUseFailure", "puzzled"],
      ["errorOccurred", "puzzled"],
    ] as const) {
      const agent = provider.recordEvent({ ...base, event });
      expect(agent.status).toBe("working");
      expect(agent.metadata.officeActivity).toBe(activity);
      expect(provider.nextTransitionAt()).toBe(Date.now() + 5000);
      vi.advanceTimersByTime(5000);
      expect((await provider.fetchAgents())[0]?.metadata.officeActivity).toBe("working");
    }
    provider.recordEvent({ ...base, event: "preCompact" });
    provider.recordEvent({ ...base, event: "agentStop" });
    expect(provider.nextTransitionAt()).toBe(Date.now() + 20000);
  });

  it("links identifiable children to their exact parent session without exposing IDs", async () => {
    const provider = new LocalHooksProvider();
    const base = {
      runtime: "vscode",
      sessionId: "parent-secret",
      workspace: "same-workspace",
      timestamp: new Date().toISOString(),
    };
    const parent = provider.recordEvent({ ...base, event: "sessionStart" });
    const child = provider.recordEvent({
      ...base,
      event: "subagentStart",
      subagentId: "child-secret",
      subagentType: "research",
    });
    expect(child.id).not.toBe(parent.id);
    expect(child.metadata.parentAgentId).toBe(parent.id);
    expect(child.metadata.officeActivity).toBe("working");
    expect(
      (await provider.fetchAgents()).find((agent) => agent.id === parent.id)?.metadata
        .officeActivity,
    ).toBe("delegating");
    const stopped = provider.recordEvent({
      ...base,
      event: "subagentStop",
      subagentId: "child-secret",
    });
    expect(stopped.id).toBe(child.id);
    expect(stopped.displayName).toBe(child.displayName);
    expect(stopped.metadata.parentAgentId).toBe(parent.id);
    const other = provider.recordEvent({
      ...base,
      event: "subagentStart",
      sessionId: "other-parent",
      subagentId: "child-secret",
    });
    expect(other.metadata.parentAgentId).not.toBe(parent.id);
    expect(JSON.stringify(await provider.fetchAgents())).not.toContain("secret");
  });

  it("does not invent child identity when a CLI start only names an agent", async () => {
    const provider = new LocalHooksProvider();
    const event = normalizeLocalHookPayload("subagentStart", "copilot-cli", {
      sessionId: "parent",
      cwd: "C:\\workspace",
      timestamp: Date.now(),
      agentName: "research",
    });
    const parent = provider.recordEvent(event);
    expect(parent.metadata.officeActivity).toBe("delegating");
    expect(parent.metadata.subagent).toBe(false);
    expect(parent.displayName).not.toContain("(research)");
    expect(await provider.fetchAgents()).toHaveLength(1);
  });

  it("normalizes tool names but never forwards tool contents or errors", () => {
    const event = normalizeLocalHookPayload("preToolUse", "vscode", {
      session_id: "session",
      cwd: "C:\\private\\project",
      timestamp: new Date().toISOString(),
      tool_name: "Read",
      tool_input: { path: "private" },
      tool_response: "private",
      error: "private",
    });
    expect(event.toolName).toBe("Read");
    expect(JSON.stringify(event)).not.toContain("private");
  });
  it("maps lifecycle events to direct status and keeps prompt and path data private", () => {
    const event = normalizeLocalHookPayload("sessionStart", "copilot-cli", {
      sessionId: "opaque-session-id",
      timestamp: Date.now(),
      cwd: "C:\\private\\customer-project",
      initialPrompt: "private prompt contents",
      transcript_path: "C:\\private\\transcript.json",
    });
    const provider = new LocalHooksProvider();
    const started = provider.recordEvent(event);

    expect(started.source).toBe("local");
    expect(started.status).toBe("working");
    expect(started.statusKind).toBe("direct");
    expect(started.repositoryName).toBe("customer-project");
    expect(JSON.stringify(started)).not.toContain("private");
    expect(JSON.stringify(started)).not.toContain("opaque-session-id");

    const idle = provider.recordEvent({
      ...event,
      event: "agentStop",
      timestamp: new Date().toISOString(),
    });
    expect(idle.id).toBe(started.id);
    expect(idle.status).toBe("needs_attention");

    const complete = provider.recordEvent({
      ...event,
      event: "sessionEnd",
      reason: "complete",
      timestamp: new Date().toISOString(),
    });
    expect(complete.status).toBe("completed");
  });

  it("waits the configured 20 seconds before becoming idle and preserves hook activity time", async () => {
    vi.useFakeTimers();
    const provider = new LocalHooksProvider();
    const stopped = provider.recordEvent({
      event: "agentStop",
      runtime: "vscode",
      sessionId: "wait",
      timestamp: new Date().toISOString(),
      workspace: "workspace",
    });
    expect(stopped.status).toBe("needs_attention");
    expect(provider.nextIdleTransitionAt()).toBe(Date.now() + 20_000);
    vi.advanceTimersByTime(19_999);
    expect((await provider.fetchAgents())[0]?.status).toBe("needs_attention");
    vi.advanceTimersByTime(1);
    const [idle] = await provider.fetchAgents();
    expect(idle?.status).toBe("idle");
    expect(idle?.lastActivityAt).toBe(stopped.lastActivityAt);
    expect(provider.nextIdleTransitionAt()).toBeNull();
  });

  it("cancels the wait when work resumes and does not override terminal statuses", async () => {
    vi.useFakeTimers();
    for (const event of ["userPromptSubmitted", "preToolUse", "sessionEnd"] as const) {
      const provider = new LocalHooksProvider();
      const input = {
        runtime: "copilot-cli",
        sessionId: "wait",
        workspace: "workspace",
        timestamp: new Date().toISOString(),
      };
      provider.recordEvent({ ...input, event: "agentStop" });
      vi.advanceTimersByTime(10_000);
      provider.recordEvent({
        ...input,
        timestamp: new Date().toISOString(),
        event,
        reason: "complete",
      });
      expect(provider.nextIdleTransitionAt()).toBeNull();
      vi.advanceTimersByTime(20_000);
      expect((await provider.fetchAgents())[0]?.status).toBe(
        event === "sessionEnd" ? "completed" : "working",
      );
    }
  });

  it("restores pending waits across restarts and applies changed settings to them", async () => {
    vi.useFakeTimers();
    const original = new LocalHooksProvider();
    const agent = original.recordEvent({
      event: "subagentStop",
      runtime: "vscode",
      sessionId: "wait",
      timestamp: new Date().toISOString(),
      workspace: "workspace",
    });
    vi.advanceTimersByTime(10_000);
    const restored = new LocalHooksProvider();
    restored.hydrate([agent]);
    restored.updateConfig({ ...defaultConfig, idleDelaySeconds: 30 });
    vi.advanceTimersByTime(10_000);
    expect((await restored.fetchAgents())[0]?.status).toBe("needs_attention");
    restored.updateConfig({ ...defaultConfig, idleDelaySeconds: 0 });
    expect((await restored.fetchAgents())[0]?.status).toBe("idle");
    expect(
      restored.recordEvent({
        event: "agentStop",
        runtime: "vscode",
        sessionId: "instant",
        timestamp: new Date().toISOString(),
        workspace: "workspace",
      }).status,
    ).toBe("idle");
  });

  it("marks inactive sessions offline after the configured threshold", async () => {
    const provider = new LocalHooksProvider();
    provider.updateConfig?.({ ...defaultConfig, offlineThresholdMinutes: 1 });
    provider.recordEvent({
      event: "sessionStart",
      runtime: "vscode",
      sessionId: "session",
      timestamp: new Date(Date.now() - 2 * 60_000).toISOString(),
      workspace: "workspace",
    });

    const [agent] = await provider.fetchAgents();

    expect(agent?.status).toBe("offline");
  });

  it("retains explicitly reported cumulative token counts without summing duplicate events", async () => {
    const provider = new LocalHooksProvider();
    const event = {
      event: "postToolUse",
      runtime: "copilot-cli",
      sessionId: "usage",
      timestamp: new Date().toISOString(),
      workspace: "workspace",
    };
    expect(provider.recordEvent(event).tokensUsed).toBeNull();
    expect(provider.recordEvent({ ...event, tokensUsed: 1200 }).tokensUsed).toBe(1200);
    expect(provider.recordEvent({ ...event, tokensUsed: 1200 }).tokensUsed).toBe(1200);
    expect(provider.recordEvent(event).tokensUsed).toBe(1200);
    const restored = new LocalHooksProvider();
    restored.hydrate(await provider.fetchAgents());
    expect(restored.recordEvent(event).tokensUsed).toBe(1200);
    expect(provider.recordEvent({ ...event, tokensUsed: 0 }).tokensUsed).toBe(0);
    for (const tokensUsed of [-1, 1.5, 2_147_483_648]) {
      expect(() => provider.recordEvent({ ...event, tokensUsed })).toThrow();
    }
  });
});
