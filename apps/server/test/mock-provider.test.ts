import { describe, expect, it } from "vitest";
import { MockAgentProvider } from "../src/providers/mock.js";

describe("mock provider demo events", () => {
  it("demonstrates the requested state transitions on appropriate agents", async () => {
    const provider = new MockAgentProvider();
    const initial = await provider.fetchAgents();
    expect(initial.filter((agent) => agent.status === "working")).toHaveLength(2);
    expect(initial.filter((agent) => agent.status === "idle")).toHaveLength(2);
    expect(initial.some((agent) => agent.status === "needs_attention")).toBe(true);

    expect(provider.applyEvent("queued-to-working")?.id).toBe("demo-theo");
    expect(provider.applyEvent("working-to-attention")?.id).toBe("demo-aria");
    expect(provider.applyEvent("attention-to-working")?.id).toBe("demo-noor");
    expect(provider.applyEvent("working-to-completed")?.id).toBe("demo-milo");
    expect(provider.applyEvent("agent-offline")?.status).toBe("offline");
    expect(provider.applyEvent("new-agent")?.status).toBe("spawning");
  });
});
