import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, syncAgents } from "../src/app.js";

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

  it("marks a missing agent offline but retains its assigned desk", async () => {
    await syncAgents();
    const offline = await request(app).post("/api/v1/demo/events/agent-offline").expect(200);
    expect(offline.body.data.status).toBe("offline");
    const desk = await prisma.desk.findUnique({ where: { agentId: "demo-theo" } });
    expect(desk?.active).toBe(false);
    expect(desk?.reservedUntil).not.toBeNull();
    await syncAgents();
    expect(
      (await prisma.desk.findUnique({ where: { agentId: "demo-theo" } }))?.reservedUntil,
    ).toEqual(desk?.reservedUntil);
    await request(app).post("/api/v1/demo/events/queued-to-working").expect(200);
    const resumed = await prisma.desk.findUnique({ where: { agentId: "demo-theo" } });
    expect([resumed?.row, resumed?.column]).toEqual([desk?.row, desk?.column]);
    expect(resumed?.active).toBe(true);
    expect(resumed?.reservedUntil).toBeNull();
  });

  it("archives expired offline agents, frees desks, and restores their saved color on return", async () => {
    await syncAgents();
    await request(app).post("/api/v1/demo/events/agent-offline").expect(200);
    await prisma.avatarProfile.update({
      where: { agentId: "demo-theo" },
      data: { color: "#123456" },
    });
    await prisma.desk.update({
      where: { agentId: "demo-theo" },
      data: { reservedUntil: new Date(Date.now() - 1000) },
    });
    const remaining = await syncAgents();
    expect(remaining.some((agent) => agent.id === "demo-theo")).toBe(false);
    expect(await prisma.desk.findUnique({ where: { agentId: "demo-theo" } })).toBeNull();
    expect(
      (await prisma.avatarProfile.findUnique({ where: { agentId: "demo-theo" } }))?.color,
    ).toBe("#123456");
    expect(
      JSON.parse((await prisma.agent.findUniqueOrThrow({ where: { id: "demo-theo" } })).metadata)
        .archivedAt,
    ).toBeDefined();
    expect((await syncAgents()).some((agent) => agent.id === "demo-theo")).toBe(false);
    const returned = await request(app).post("/api/v1/demo/events/queued-to-working").expect(200);
    expect(returned.body.data.avatarColor).toBe("#123456");
    expect(returned.body.data.metadata.archivedAt).toBeUndefined();
    expect((await prisma.desk.findUnique({ where: { agentId: "demo-theo" } }))?.active).toBe(true);
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
});
