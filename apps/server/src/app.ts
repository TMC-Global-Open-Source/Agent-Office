import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import {
  ActivitySchema,
  AgentSchema,
  ConfigSchema,
  defaultConfig,
  type Agent,
  type AppConfig,
} from "@agent-office/shared";
import { nextDesk } from "@agent-office/shared";
import { env, projectRoot } from "./env.js";
import { z, ZodError } from "zod";
import { MockAgentProvider } from "./providers/mock.js";
import { GitHubAgentProvider } from "./providers/github.js";
import { LocalHooksProvider } from "./providers/local-hooks.js";
import type { AgentProvider } from "./providers/types.js";
import { randomAvatarColor } from "./avatar-color.js";
import { readUsageHistory } from "./usage-history.js";

export const prisma = new PrismaClient();
export const mockProvider = new MockAgentProvider();
export const localHooksProvider = new LocalHooksProvider();
export const provider: AgentProvider =
  env.AGENT_PROVIDER === "github"
    ? new GitHubAgentProvider()
    : env.AGENT_PROVIDER === "local"
      ? localHooksProvider
      : mockProvider;
export const app = express();
let io: Server | null = null;
let lastSuccessfulRefresh: string | null = null;
let config: AppConfig = {
  ...defaultConfig,
  provider: env.AGENT_PROVIDER,
  organization: env.GITHUB_ORG ?? "",
  repositories: env.GITHUB_REPOSITORIES.split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  pollingIntervalSeconds: env.POLL_INTERVAL_SECONDS,
  idleThresholdMinutes: env.IDLE_THRESHOLD_MINUTES,
  offlineThresholdMinutes: env.OFFLINE_THRESHOLD_MINUTES,
};

export function attachSocketServer(server: import("node:http").Server): Server {
  io = new Server(server, {
    cors: { origin: `http://127.0.0.1:${env.WEB_PORT}`, methods: ["GET", "POST"] },
  });
  io.on("connection", (socket) => {
    socket.emit("connection:status", { connected: true });
  });
  return io;
}

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  }),
);
app.use(cors({ origin: [`http://127.0.0.1:${env.WEB_PORT}`, `http://localhost:${env.WEB_PORT}`] }));
app.use(express.json({ limit: "64kb" }));
app.use((request, _response, next) => {
  console.info(JSON.stringify({ level: "info", method: request.method, path: request.path }));
  next();
});

function publicAgent(agent: {
  id: string;
  displayName: string;
  source: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
  issueNumber: number | null;
  pullRequestNumber: number | null;
  taskTitle: string | null;
  taskUrl: string | null;
  status: string;
  statusReason: string | null;
  statusConfidence: number;
  statusKind: string;
  lastActivityAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  metadata: string;
  tokensUsed: number | null;
  desk: { id: string } | null;
  avatar: { color: string } | null;
}) {
  const parsedMetadata: Record<string, unknown> = JSON.parse(agent.metadata || "{}");
  return AgentSchema.parse({
    ...agent,
    source: agent.source === "github" ? "github" : agent.source === "local" ? "local" : "mock",
    statusEvidence: Array.isArray(parsedMetadata.statusEvidence)
      ? parsedMetadata.statusEvidence
      : [],
    metadata: parsedMetadata,
    lastActivityAt: agent.lastActivityAt?.toISOString() ?? null,
    startedAt: agent.startedAt?.toISOString() ?? null,
    completedAt: agent.completedAt?.toISOString() ?? null,
    updatedAt: agent.updatedAt.toISOString(),
    deskId: agent.desk?.id ?? null,
    avatarColor: agent.avatar?.color ?? "#5690a8",
  });
}

async function getStoredAgents(includeArchived = false): Promise<Agent[]> {
  const records = await prisma.agent.findMany({
    where: provider.name === "local" ? { source: "local" } : undefined,
    include: { desk: true, avatar: true },
    orderBy: { createdAt: "asc" },
  });
  return records
    .map(publicAgent)
    .filter((agent) => includeArchived || typeof agent.metadata.archivedAt !== "string");
}

async function performSyncAgents(): Promise<Agent[]> {
  const expiredDesks = await prisma.desk.findMany({
    where: { active: false, reservedUntil: { lte: new Date() }, agent: { status: "offline" } },
  });
  for (const desk of expiredDesks) {
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: desk.agentId } });
    await prisma.$transaction([
      prisma.agent.update({
        where: { id: agent.id },
        data: {
          metadata: JSON.stringify({
            ...JSON.parse(agent.metadata),
            archivedAt: new Date().toISOString(),
          }),
        },
      }),
      prisma.desk.delete({ where: { id: desk.id } }),
    ]);
    io?.emit("agent:removed", { id: desk.agentId });
  }
  const incoming = (await provider.fetchAgents()).map((agent) => AgentSchema.parse(agent));
  const known = await prisma.agent.findMany({
    where: provider.name === "local" ? { source: "local" } : undefined,
    include: { desk: true },
  });
  const incomingIds = new Set(incoming.map((agent) => agent.id));
  const existingDesks = await prisma.desk.findMany();
  for (const agent of incoming) {
    const prior = known.find((item) => item.id === agent.id);
    if (
      agent.status === "offline" &&
      prior &&
      typeof JSON.parse(prior.metadata).archivedAt === "string"
    )
      continue;
    const desk =
      prior?.desk ??
      nextDesk(
        existingDesks.map(({ row, column }) => ({ row, column })),
        `desk-${agent.id}`,
      );
    if (!prior?.desk)
      existingDesks.push({
        id: desk.id,
        agentId: agent.id,
        row: desk.row,
        column: desk.column,
        active: true,
        reservedUntil: null,
        createdAt: new Date(),
      });
    const created = !prior || !prior.desk;
    const status = created && agent.source === "mock" ? "spawning" : agent.status;
    const metadata = JSON.stringify({ ...agent.metadata, statusEvidence: agent.statusEvidence });
    await prisma.agent.upsert({
      where: { id: agent.id },
      create: {
        id: agent.id,
        displayName: agent.displayName,
        source: agent.source,
        repositoryOwner: agent.repositoryOwner,
        repositoryName: agent.repositoryName,
        issueNumber: agent.issueNumber,
        pullRequestNumber: agent.pullRequestNumber,
        taskTitle: agent.taskTitle,
        taskUrl: agent.taskUrl,
        status,
        statusReason: agent.statusReason,
        statusConfidence: agent.statusConfidence,
        statusKind: agent.statusKind,
        lastActivityAt: agent.lastActivityAt ? new Date(agent.lastActivityAt) : null,
        startedAt: agent.startedAt ? new Date(agent.startedAt) : null,
        completedAt: agent.completedAt ? new Date(agent.completedAt) : null,
        metadata,
        tokensUsed: agent.tokensUsed,
        desk: { create: { id: desk.id, row: desk.row, column: desk.column } },
        avatar: {
          create: {
            color: randomAvatarColor(),
            seed: Array.from(agent.id).reduce((sum, char) => sum + char.charCodeAt(0), 0),
          },
        },
      },
      update: {
        ...(!prior?.desk
          ? { desk: { create: { id: desk.id, row: desk.row, column: desk.column } } }
          : {}),
        displayName: agent.displayName,
        status: agent.status,
        statusReason: agent.statusReason,
        statusConfidence: agent.statusConfidence,
        statusKind: agent.statusKind,
        lastActivityAt: agent.lastActivityAt ? new Date(agent.lastActivityAt) : null,
        completedAt: agent.completedAt ? new Date(agent.completedAt) : null,
        metadata,
        tokensUsed: agent.tokensUsed ?? prior?.tokensUsed ?? null,
      },
    });
    if (
      agent.status === "offline" &&
      (prior?.status !== "offline" || !prior?.desk?.reservedUntil)
    ) {
      await prisma.desk.updateMany({
        where: { agentId: agent.id },
        data: {
          active: false,
          reservedUntil: new Date(Date.now() + config.retainOfflineHours * 3_600_000),
        },
      });
    } else if (agent.status !== "offline" && prior?.status === "offline") {
      await prisma.desk.updateMany({
        where: { agentId: agent.id },
        data: { active: true, reservedUntil: null },
      });
    }
    const saved = await prisma.agent.findUniqueOrThrow({
      where: { id: agent.id },
      include: { desk: true, avatar: true },
    });
    const normalized = publicAgent(saved);
    if (created || prior?.status !== normalized.status) {
      await prisma.agentActivity.create({
        data: {
          id: `${agent.id}:${normalized.status}:${Date.now()}`,
          agentId: agent.id,
          kind: normalized.statusKind,
          summary: normalized.statusReason ?? `Status is ${normalized.status}.`,
          occurredAt: new Date(),
          url: agent.taskUrl,
        },
      });
    }
    if (created) {
      io?.emit("agent:created", normalized);
      io?.emit("desk:created", {
        id: desk.id,
        agentId: agent.id,
        row: desk.row,
        column: desk.column,
      });
    } else {
      io?.emit("agent:updated", normalized);
    }
  }
  const now = new Date();
  for (const old of known) {
    if (!incomingIds.has(old.id) && old.status !== "offline") {
      await prisma.agent.update({
        where: { id: old.id },
        data: {
          status: "offline",
          statusReason: "Agent was absent from the latest provider refresh.",
        },
      });
      await prisma.desk.updateMany({
        where: { agentId: old.id },
        data: {
          active: false,
          reservedUntil: new Date(now.getTime() + config.retainOfflineHours * 3_600_000),
        },
      });
      io?.emit("agent:updated", {
        ...publicAgent({
          ...old,
          status: "offline",
          statusReason: "Agent was absent from the latest provider refresh.",
          updatedAt: new Date(),
          desk: old.desk,
          avatar: await prisma.avatarProfile.findUnique({ where: { agentId: old.id } }),
        }),
      });
    }
  }
  lastSuccessfulRefresh = new Date().toISOString();
  const health = provider.health();
  await prisma.providerSnapshot.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      provider: health.provider,
      healthy: health.healthy,
      stale: health.stale,
      message: health.message,
      lastSuccessAt: health.lastSuccessAt ? new Date(health.lastSuccessAt) : null,
      rateLimitResetAt: health.rateLimitResetAt ? new Date(health.rateLimitResetAt) : null,
    },
    update: {
      provider: health.provider,
      healthy: health.healthy,
      stale: health.stale,
      message: health.message,
      lastSuccessAt: health.lastSuccessAt ? new Date(health.lastSuccessAt) : null,
      rateLimitResetAt: health.rateLimitResetAt ? new Date(health.rateLimitResetAt) : null,
    },
  });
  io?.emit("provider:health", health);
  io?.emit("refresh:completed", { at: lastSuccessfulRefresh });
  return getStoredAgents();
}

let activeSync: Promise<Agent[]> | null = null;
let localIdleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLocalIdleTransition(): void {
  if (localIdleTimer) clearTimeout(localIdleTimer);
  localIdleTimer = null;
  if (provider.name !== "local") return;
  const deadline = localHooksProvider.nextTransitionAt();
  if (deadline === null) return;
  localIdleTimer = setTimeout(
    () => {
      localIdleTimer = null;
      void syncAgents().catch(() => {
        console.error("Local Copilot idle transition refresh failed.");
        emitProviderFailure();
      });
    },
    Math.max(1, deadline - Date.now()),
  );
  localIdleTimer.unref();
}

export async function syncAgents(): Promise<Agent[]> {
  if (activeSync) return activeSync;
  const operation = performSyncAgents();
  activeSync = operation;
  try {
    const agents = await operation;
    scheduleLocalIdleTransition();
    return agents;
  } finally {
    if (activeSync === operation) activeSync = null;
  }
}

app.get("/api/v1/health", async (_request, response, next) => {
  try {
    const health = provider.health();
    const stored = await prisma.providerSnapshot.findUnique({ where: { id: 1 } });
    const lastSuccessAt = health.lastSuccessAt ?? stored?.lastSuccessAt?.toISOString() ?? null;
    response.json({
      data: {
        application: "copilot-agent-office",
        mode: env.NODE_ENV,
        healthy: health.healthy,
        provider: { ...health, lastSuccessAt },
        lastSuccessfulRefresh: lastSuccessfulRefresh ?? lastSuccessAt,
      },
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/v1/config", (_request, response) => {
  response.json({ data: config });
});
app.get("/api/v1/usage/history", (_request, response, next) => {
  try {
    response.json({ data: readUsageHistory(env.COPILOT_USAGE_DB_PATH) });
  } catch (error) {
    next(error);
  }
});
app.put("/api/v1/config", async (request, response, next) => {
  try {
    config = { ...ConfigSchema.parse(request.body), provider: env.AGENT_PROVIDER };
    await Promise.all(
      Object.entries(config).map(([key, value]) =>
        prisma.appSetting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value) },
          update: { value: JSON.stringify(value) },
        }),
      ),
    );
    provider.updateConfig?.(config);
    if (provider.name === "local") await syncAgents();
    response.json({ data: config });
  } catch (error) {
    next(error);
  }
});
app.get("/api/v1/agents", async (_request, response, next) => {
  try {
    response.json({ data: await getStoredAgents(), stale: provider.health().stale });
  } catch (error) {
    next(error);
  }
});
app.get("/api/v1/agents/:id", async (request, response, next) => {
  try {
    const item = await prisma.agent.findUnique({
      where: { id: request.params.id },
      include: { desk: true, avatar: true },
    });
    if (!item)
      return response
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Agent not found." } });
    return response.json({ data: publicAgent(item) });
  } catch (error) {
    return next(error);
  }
});
app.put("/api/v1/agents/:id/color", async (request, response, next) => {
  try {
    const { color } = z
      .object({ color: AgentSchema.shape.avatarColor })
      .strict()
      .parse(request.body);
    const agent = await prisma.agent.findUnique({ where: { id: request.params.id } });
    if (!agent || (provider.name === "local" && agent.source !== "local")) {
      return response.status(404).json({
        error: { code: "NOT_FOUND", message: "Agent not found." },
      });
    }
    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data: {
        avatar: {
          upsert: {
            create: { color, seed: 0 },
            update: { color },
          },
        },
      },
      include: { desk: true, avatar: true },
    });
    const data = publicAgent(updated);
    io?.emit("agent:updated", data);
    return response.json({ data });
  } catch (error) {
    return next(error);
  }
});
app.get("/api/v1/agents/:id/activity", async (request, response, next) => {
  try {
    const providerEvents = (await provider.fetchActivity(request.params.id)).map((event) =>
      ActivitySchema.parse(event),
    );
    for (const event of providerEvents) {
      await prisma.agentActivity.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          agentId: event.agentId,
          kind: event.kind,
          summary: event.summary,
          occurredAt: new Date(event.occurredAt),
          url: event.url,
        },
        update: {},
      });
    }
    const data = await prisma.agentActivity.findMany({
      where: { agentId: request.params.id },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });
    response.json({
      data: data.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/v1/desks", async (_request, response, next) => {
  try {
    response.json({
      data: await prisma.desk.findMany({
        where: provider.name === "local" ? { agent: { source: "local" } } : undefined,
        include: { agent: { include: { avatar: true } } },
        orderBy: [{ row: "asc" }, { column: "asc" }],
      }),
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/v1/provider/health", async (_request, response, next) => {
  try {
    const health = provider.health();
    const stored = await prisma.providerSnapshot.findUnique({ where: { id: 1 } });
    response.json({
      data: {
        ...health,
        lastSuccessAt: health.lastSuccessAt ?? stored?.lastSuccessAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/v1/refresh", async (_request, response, next) => {
  try {
    response.json({ data: await syncAgents() });
  } catch (error) {
    emitProviderFailure();
    next(error);
  }
});
app.post("/api/v1/local/hooks", async (request, response, next) => {
  try {
    if (provider.name !== "local") {
      return response.status(409).json({
        error: { code: "WRONG_PROVIDER", message: "Local hooks require local provider mode." },
      });
    }
    const expected = Buffer.from(env.AGENT_OFFICE_HOOK_TOKEN ?? "");
    const supplied = Buffer.from(request.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    if (
      expected.length < 32 ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return response
        .status(401)
        .json({ error: { code: "UNAUTHORIZED", message: "Local hook authentication failed." } });
    }
    localHooksProvider.recordEvent(request.body);
    const agents = await syncAgents();
    return response.json({ data: agents.filter((agent) => agent.source === "local") });
  } catch (error) {
    return next(error);
  }
});
app.post("/api/v1/demo/events/:eventName", async (request, response, next) => {
  try {
    if (env.ENABLE_DEMO_CONTROLS !== "true" || env.NODE_ENV === "production") {
      return response
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Demo controls are disabled." } });
    }
    if (provider.name !== "mock")
      return response
        .status(409)
        .json({ error: { code: "WRONG_PROVIDER", message: "Demo events require mock mode." } });
    const agent = mockProvider.applyEvent(request.params.eventName);
    if (!agent)
      return response
        .status(400)
        .json({ error: { code: "INVALID_EVENT", message: "Unknown or already-used demo event." } });
    const savedAgents = await syncAgents();
    if (request.params.eventName === "new-agent") {
      const transitionTimer = setTimeout(() => {
        void syncAgents().catch(() => {
          console.error("Demo agent transition refresh failed.");
        });
      }, 1800);
      transitionTimer.unref();
    }
    return response.json({ data: savedAgents.find((item) => item.id === agent.id) ?? agent });
  } catch (error) {
    return next(error);
  }
});
if (env.NODE_ENV === "production") {
  app.use(express.static(resolve(projectRoot, "apps/web/dist"), { index: false }));
  app.get("*", (request, response) => {
    if (request.path.startsWith("/api/"))
      return response
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Route not found." } });
    return response.sendFile(resolve(projectRoot, "apps/web/dist/index.html"));
  });
}
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  const validationError = error instanceof ZodError;
  response.status(validationError ? 400 : 500).json({
    error: {
      code: validationError ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
      message: validationError
        ? "The request contains invalid configuration."
        : "The request could not be completed.",
    },
  });
});

export async function loadSavedConfig(): Promise<void> {
  const settings = await prisma.appSetting.findMany();
  const values = Object.fromEntries(
    settings.map((setting) => [setting.key, JSON.parse(setting.value) as unknown]),
  );
  config = ConfigSchema.parse({ ...config, ...values, provider: env.AGENT_PROVIDER });
  provider.updateConfig?.(config);
  if (provider.name === "local") {
    localHooksProvider.hydrate(
      (await getStoredAgents(true)).filter((agent) => agent.source === "local"),
    );
  }
  const health = await prisma.providerSnapshot.findUnique({ where: { id: 1 } });
  if (health?.lastSuccessAt) lastSuccessfulRefresh = health.lastSuccessAt.toISOString();
}

export function getAppConfig(): AppConfig {
  return config;
}

export function emitProviderFailure(): void {
  io?.emit("provider:health", provider.health());
  io?.emit("refresh:failed", {
    message: "Provider refresh failed; the last successful office state is retained.",
  });
}
