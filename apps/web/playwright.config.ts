import { defineConfig, devices } from "@playwright/test";

const apiPort = Number(process.env.E2E_API_PORT ?? 4400);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5273);

export default defineConfig({
  testDir: "./e2e",
  use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${webPort}` },
  webServer: [
    {
      command: "npm run dev:e2e --workspace @agent-office/server",
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        AGENT_PROVIDER: "mock",
        ENABLE_DEMO_CONTROLS: "true",
        PORT: String(apiPort),
        WEB_PORT: String(webPort),
      },
    },
    {
      command: `npm run dev --workspace @agent-office/web -- --port ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        E2E_API_PORT: String(apiPort),
        E2E_WEB_PORT: String(webPort),
        PORT: String(apiPort),
        WEB_PORT: String(webPort),
      },
    },
  ],
});
