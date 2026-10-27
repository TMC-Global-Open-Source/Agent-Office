import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import { app, isLoopbackAddress, prisma, provider, syncAgents } from "../src/app.js";
import * as usageAttribution from "../src/usage-attribution.js";

describe("Agent Office API", () => {
  beforeEach(async () => {
    await prisma.agentActivity.deleteMany();
    await prisma.desk.deleteMany();
    await prisma.avatarProfile.deleteMany();
    await prisma.agent.deleteMany();
  });
  afterEach(async () => {
    await prisma.agentActivity.deleteMany();
    await prisma.desk.deleteMany();
    await prisma.avatarProfile.deleteMany();
    await prisma.agent.deleteMany();
  });

  it("reports health without exposing credentials", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);
    expect(JSON.stringify(response.body)).not.toContain("GITHUB_TOKEN");
    expect(response.body.data.shared).toBe(false);
  });

  it("recognizes loopback addresses for host-only changes", () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"])
      expect(isLoopbackAddress(address)).toBe(true);
    for (const address of ["192.168.1.20", "::ffff:10.0.0.5", "0.0.0.0", "", undefined])
      expect(isLoopbackAddress(address)).toBe(false);
  });

  it("lets other computers view status but not change settings", async () => {
    const lanAddress = Object.values(networkInterfaces())
      .flat()
      .find((item) => item && item.family === "IPv4" && !item.internal)?.address;
    if (!lanAddress) return;
    const server = app.listen(0, "0.0.0.0");
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://${lanAddress}:${port}/api/v1`;
      expect((await fetch(`${base}/agents`)).status).toBe(200);
      const config = await fetch(`${base}/config`).then((response) => response.json());
      const update = await fetch(`${base}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.data),
      });
      expect(update.status).toBe(403);
      expect((await update.json()).error.code).toBe("VIEW_ONLY");
      const color = await fetch(`${base}/agents/any/color`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: "#123456" }),
      });
      expect(color.status).toBe(403);
      expect((await fetch(`${base}/agents/any/home`, { method: "POST" })).status).toBe(403);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("returns an empty agent list before the first refresh", async () => {
    const response = await request(app).get("/api/v1/agents").expect(200);
    expect(response.body.data).toEqual([]);
  });

  it("validates config and never accepts a token field", async () => {
    const response = await request(app)
      .put("/api/v1/config")
      .send({ ...(await request(app).get("/api/v1/config")).body.data, token: "secret" })
      .expect(200);
    expect(response.body.data.token).toBeUndefined();
  });

  it("rejects malformed configuration with a structured client error", async () => {
    const response = await request(app)
      .put("/api/v1/config")
      .send({ provider: "unknown", pollingIntervalSeconds: 1 })
      .expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("persists six desks and adds a new agent without moving existing desks", async () => {
    const initial = await syncAgents();
    const initialDesks = await prisma.desk.findMany({
      orderBy: [{ row: "asc" }, { column: "asc" }],
    });
    expect(initial).toHaveLength(6);
    expect(initialDesks).toHaveLength(6);

    await request(app).post("/api/v1/demo/events/new-agent").expect(200);
    const agents = await prisma.agent.findMany({ include: { desk: true } });
    const desks = await prisma.desk.findMany();
    expect(agents).toHaveLength(7);
    expect(desks).toHaveLength(7);
    for (const desk of initialDesks) {
      const unchanged = desks.find((item) => item.id === desk.id);
      expect(unchanged && [unchanged.row, unchanged.column]).toEqual([desk.row, desk.column]);
    }
  });

  it("clears an away agent's desk immediately and restores it when work resumes", async () => {
    const initial = await syncAgents();
    const offline = await request(app).post("/api/v1/demo/events/agent-offline").expect(200);
    expect(offline.body.data.status).toBe("offline");
    expect(await prisma.desk.findUnique({ where: { agentId: "demo-theo" } })).toBeNull();
    const remaining = await syncAgents();
    expect(remaining.some((agent) => agent.id === "demo-theo")).toBe(false);
    expect((await request(app).get("/api/v1/agents").expect(200)).body.data).toHaveLength(
      initial.length - 1,
    );
    expect((await request(app).get("/api/v1/desks").expect(200)).body.data).toHaveLength(
      initial.length - 1,
    );
    expect(await prisma.desk.findUnique({ where: { agentId: "demo-theo" } })).toBeNull();
    await request(app).post("/api/v1/demo/events/queued-to-working").expect(200);
    const resumed = await prisma.desk.findUnique({ where: { agentId: "demo-theo" } });
    expect(resumed?.active).toBe(true);
    expect(resumed?.reservedUntil).toBeNull();
    expect(await syncAgents()).toHaveLength(initial.length);
  });

  it("preserves desks and headcount when the provider refresh fails", async () => {
    const agents = await syncAgents();
    const desks = await prisma.desk.findMany();
    const fetch = vi
      .spyOn(provider, "fetchAgents")
      .mockRejectedValue(new Error("Provider unavailable"));
    try {
      await expect(syncAgents()).rejects.toThrow("Provider unavailable");
      expect(await prisma.desk.findMany()).toEqual(desks);
      expect((await request(app).get("/api/v1/agents").expect(200)).body.data).toHaveLength(
        agents.length,
      );
    } finally {
      fetch.mockRestore();
    }
  });

  it("reactivates a legacy reserved desk if its agent returns before cleanup", async () => {
    const [agent] = await syncAgents();
    const before = await prisma.desk.update({
      where: { agentId: agent!.id },
      data: { active: false, reservedUntil: new Date(Date.now() + 3_600_000) },
    });
    await prisma.agent.update({ where: { id: agent!.id }, data: { status: "offline" } });
    await syncAgents();
    const after = await prisma.desk.findUniqueOrThrow({ where: { agentId: agent!.id } });
    expect([after.id, after.row, after.column]).toEqual([before.id, before.row, before.column]);
    expect(after.active).toBe(true);
    expect(after.reservedUntil).toBeNull();
  });

  it("preserves away profiles, usage and history and restores their saved color on return", async () => {
    await syncAgents();
    await prisma.avatarProfile.update({
      where: { agentId: "demo-theo" },
      data: { color: "#123456" },
    });
    await prisma.agent.update({
      where: { id: "demo-theo" },
      data: { tokensUsed: 12345 },
    });
    await request(app).post("/api/v1/demo/events/agent-offline").expect(200);
    const remaining = await syncAgents();
    expect(remaining.some((agent) => agent.id === "demo-theo")).toBe(false);
    expect(await prisma.desk.findUnique({ where: { agentId: "demo-theo" } })).toBeNull();
    expect(
      (await prisma.avatarProfile.findUnique({ where: { agentId: "demo-theo" } }))?.color,
    ).toBe("#123456");
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: "demo-theo" } })).tokensUsed).toBe(
      12345,
    );
    expect(await prisma.agentActivity.count({ where: { agentId: "demo-theo" } })).toBeGreaterThan(
      0,
    );
    expect((await syncAgents()).some((agent) => agent.id === "demo-theo")).toBe(false);
    const returned = await request(app).post("/api/v1/demo/events/queued-to-working").expect(200);
    expect(returned.body.data.avatarColor).toBe("#123456");
    expect(returned.body.data.metadata.archivedAt).toBeUndefined();
    expect((await prisma.desk.findUnique({ where: { agentId: "demo-theo" } }))?.active).toBe(true);
  });

  it("consolidates remaining desks into the top-left slots after a desk is removed", async () => {
    await syncAgents();
    const before = await prisma.desk.findMany({ orderBy: [{ row: "asc" }, { column: "asc" }] });
    const removed = before[1]!;
    const snapshot = await provider.fetchAgents();
    const fetch = vi
      .spyOn(provider, "fetchAgents")
      .mockResolvedValue(
        snapshot.map((agent) =>
          agent.id === removed.agentId ? { ...agent, status: "offline" } : agent,
        ),
      );
    try {
      await syncAgents();
    } finally {
      fetch.mockRestore();
    }
    const after = await prisma.desk.findMany({ orderBy: [{ row: "asc" }, { column: "asc" }] });
    expect(after.map((desk) => desk.agentId)).toEqual(
      before.filter((desk) => desk.id !== removed.id).map((desk) => desk.agentId),
    );
    after.forEach((desk, index) => {
      expect([desk.row, desk.column]).toEqual([Math.floor(index / 5), index % 5]);
    });
  });

  it("clears missing agents and explicit away activity before allocating new desks", async () => {
    const initial = await syncAgents();
    const snapshot = await provider.fetchAgents();
    const missing = snapshot[0]!;
    const away = snapshot[1]!;
    const newcomer = { ...snapshot[2]!, id: "new-active-agent", status: "working" as const };
    const fetch = vi.spyOn(provider, "fetchAgents").mockResolvedValue([
      newcomer,
      ...snapshot
        .filter((agent) => agent.id !== missing.id)
        .map((agent) =>
          agent.id === away.id
            ? {
                ...agent,
                status: "working" as const,
                metadata: { ...agent.metadata, officeActivity: "away" },
              }
            : agent,
        ),
    ]);
    try {
      const active = await syncAgents();
      expect(active).toHaveLength(initial.length - 1);
      expect(active.some((agent) => [missing.id, away.id].includes(agent.id))).toBe(false);
      const desks = await prisma.desk.findMany({ orderBy: [{ row: "asc" }, { column: "asc" }] });
      expect(desks).toHaveLength(active.length);
      desks.forEach((desk, index) => {
        expect([desk.row, desk.column]).toEqual([Math.floor(index / 5), index % 5]);
      });
      expect((await prisma.agent.findUniqueOrThrow({ where: { id: missing.id } })).status).toBe(
        "offline",
      );
      expect(await syncAgents()).toHaveLength(active.length);
    } finally {
      fetch.mockRestore();
    }
  });

  it("never allocates a desk to a newly discovered away agent", async () => {
    const [sample] = await provider.fetchAgents();
    const fetch = vi
      .spyOn(provider, "fetchAgents")
      .mockResolvedValue([{ ...sample!, id: "new-away-agent", status: "offline" }]);
    try {
      expect(await syncAgents()).toEqual([]);
      expect(await prisma.desk.count()).toBe(0);
      expect(
        (await prisma.agent.findUniqueOrThrow({ where: { id: "new-away-agent" } })).status,
      ).toBe("offline");
    } finally {
      fetch.mockRestore();
    }
  });

  it("saves joining colors and preserves them instead of using provider colors on refresh", async () => {
    const initial = await syncAgents();
    for (const agent of initial) expect(agent.avatarColor).toMatch(/^#[0-9a-f]{6}$/);
    const first = initial[0]!;
    await prisma.avatarProfile.update({
      where: { agentId: first.id },
      data: { color: "#123456" },
    });

    const refreshed = await syncAgents();
    expect(refreshed.find((agent) => agent.id === first.id)?.avatarColor).toBe("#123456");
    const response = await request(app).get("/api/v1/agents").expect(200);
    expect(
      response.body.data.find((agent: { id: string }) => agent.id === first.id).avatarColor,
    ).toBe("#123456");
    for (const agent of initial.slice(1)) {
      expect(refreshed.find((item) => item.id === agent.id)?.avatarColor).toBe(agent.avatarColor);
    }
  });

  it("saves profile color changes and retains them through provider refreshes", async () => {
    const [agent] = await syncAgents();
    const response = await request(app)
      .put(`/api/v1/agents/${agent!.id}/color`)
      .send({ color: "#ad42ef" })
      .expect(200);
    expect(response.body.data.avatarColor).toBe("#ad42ef");
    expect((await syncAgents()).find((item) => item.id === agent!.id)?.avatarColor).toBe("#ad42ef");
    await request(app).put(`/api/v1/agents/${agent!.id}/color`).send({ color: "red" }).expect(400);
    await request(app)
      .put(`/api/v1/agents/${agent!.id}/color`)
      .send({ color: "#ffffff", status: "offline" })
      .expect(400);
    await request(app).put("/api/v1/agents/missing/color").send({ color: "#ffffff" }).expect(404);
    expect((await prisma.avatarProfile.findUnique({ where: { agentId: agent!.id } }))?.color).toBe(
      "#ad42ef",
    );
  });

  it("persists token counts and does not replace known usage with an unreported value", async () => {
    const [agent] = await syncAgents();
    expect(agent!.tokensUsed).toBeNull();
    await prisma.agent.update({ where: { id: agent!.id }, data: { tokensUsed: 12345 } });
    expect((await syncAgents()).find((item) => item.id === agent!.id)?.tokensUsed).toBe(12345);
    const response = await request(app).get(`/api/v1/agents/${agent!.id}`).expect(200);
    expect(response.body.data.tokensUsed).toBe(12345);
    await prisma.agent.update({ where: { id: agent!.id }, data: { tokensUsed: 0 } });
    expect((await syncAgents()).find((item) => item.id === agent!.id)?.tokensUsed).toBe(0);
  });

  it("sends an agent home, retains the dismissal through refreshes, and brings it back on fresh work", async () => {
    const [initial] = await syncAgents();
    const agent = {
      ...initial!,
      status: "idle" as const,
      lastActivityAt: new Date(Date.now() - 120_000).toISOString(),
    };
    const lookup = vi.spyOn(provider, "fetchAgents").mockResolvedValue([agent]);
    const emptyAttribution = usageAttribution.readUsageAttribution([], "", new Date(), null);
    const attribution = vi
      .spyOn(usageAttribution, "readUsageAttribution")
      .mockReturnValue(emptyAttribution);
    try {
      const sent = await request(app).post(`/api/v1/agents/${agent.id}/home`).expect(200);
      const startedAt = sent.body.data.metadata.homeDeparture.startedAt;
      expect(sent.body.data.avatarColor).toBe(initial!.avatarColor);
      await prisma.agent.update({ where: { id: agent.id }, data: { status: "offline" } });
      await prisma.desk.update({
        where: { agentId: agent.id },
        data: {
          active: false,
          reservedUntil: new Date(Date.now() - 1000),
        },
      });
      expect(
        (await request(app).post(`/api/v1/agents/${agent.id}/home`)).body.data.metadata
          .homeDeparture.startedAt,
      ).toBe(startedAt);
      expect(
        (await syncAgents()).find((item) => item.id === agent.id)?.metadata.homeDeparture,
      ).toEqual({ startedAt });
      expect(await prisma.desk.findUnique({ where: { agentId: agent.id } })).not.toBeNull();

      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          metadata: JSON.stringify({
            ...agent.metadata,
            homeDeparture: { startedAt: new Date(Date.now() - 30_000).toISOString() },
          }),
        },
      });
      expect((await syncAgents()).find((item) => item.id === agent.id)).toBeUndefined();
      await request(app).get("/api/v1/usage/attribution").expect(200);
      expect(attribution.mock.lastCall?.[0].some((item) => item.id === agent.id)).toBe(true);
      expect(await prisma.desk.findUnique({ where: { agentId: agent.id } })).toBeNull();
      expect(
        (await request(app).get("/api/v1/agents")).body.data.some(
          (item: { id: string }) => item.id === agent.id,
        ),
      ).toBe(false);
      expect((await syncAgents()).find((item) => item.id === agent.id)).toBeUndefined();

      lookup.mockResolvedValue([
        {
          ...agent,
          status: "working",
          lastActivityAt: new Date().toISOString(),
          metadata: { ...agent.metadata, homeDeparture: { startedAt } },
        },
      ]);
      const returned = (await syncAgents()).find((item) => item.id === agent.id)!;
      expect(returned.metadata.homeDeparture).toBeUndefined();
      expect(returned.avatarColor).toBe(initial!.avatarColor);
      expect(returned.deskId).toBeTruthy();
      await request(app).post("/api/v1/agents/missing/home").expect(404);
    } finally {
      lookup.mockRestore();
      attribution.mockRestore();
    }
  });
});
