import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const port = 4501;
export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-render.spec.ts",
  use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    command: "npm run db:migrate --workspace @agent-office/server && npm start",
    url: `http://127.0.0.1:${port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      AGENT_PROVIDER: "mock",
      DATABASE_URL: "file:./production-test.db",
      PORT: String(port),
    },
  },
});
