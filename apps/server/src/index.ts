import { createServer } from "node:http";
import {
  app,
  attachSocketServer,
  getAppConfig,
  emitProviderFailure,
  loadSavedConfig,
  prisma,
  provider,
  syncAgents,
} from "./app.js";
import { env } from "./env.js";

const server = createServer(app);
attachSocketServer(server);

let retryAfter = 0;
let backoffMs = 30_000;
let initialTransitionCheck = true;
const refresh = async () => {
  if (Date.now() < retryAfter) return;
  try {
    await syncAgents();
    retryAfter = 0;
    backoffMs = 30_000;
  } catch {
    console.error("Provider refresh failed; retaining last successful state.");
    const health = provider.health();
    await prisma.providerSnapshot.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        provider: health.provider,
        healthy: health.healthy,
        stale: true,
        message: health.message,
        lastSuccessAt: health.lastSuccessAt ? new Date(health.lastSuccessAt) : null,
        rateLimitResetAt: health.rateLimitResetAt ? new Date(health.rateLimitResetAt) : null,
      },
      update: {
        provider: health.provider,
        healthy: health.healthy,
        stale: true,
        message: health.message,
        rateLimitResetAt: health.rateLimitResetAt ? new Date(health.rateLimitResetAt) : null,
      },
    });
    emitProviderFailure();
    const resetAt = Date.parse(provider.health().rateLimitResetAt ?? "");
    retryAfter =
      Number.isFinite(resetAt) && resetAt > Date.now() ? resetAt : Date.now() + backoffMs;
    backoffMs = Math.min(backoffMs * 2, 15 * 60_000);
  }
};

const scheduleRefresh = () => {
  const delay = initialTransitionCheck ? 1800 : getAppConfig().pollingIntervalSeconds * 1000;
  initialTransitionCheck = false;
  const timer = setTimeout(() => {
    void refresh().finally(scheduleRefresh);
  }, delay);
  timer.unref();
};

void loadSavedConfig()
  .then(() => {
    server.listen(env.PORT, env.HOST, () => {
      console.info(`Agent Office API listening on http://${env.HOST}:${env.PORT}`);
    });
    return refresh();
  })
  .then(scheduleRefresh)
  .catch(async () => {
    console.error("Application startup failed while loading local settings.");
    await prisma.$disconnect();
    process.exitCode = 1;
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void prisma.$disconnect());
  });
}
