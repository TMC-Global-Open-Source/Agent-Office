import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const projectRoot = fileURLToPath(new URL("../../..", import.meta.url));
config({ path: resolve(projectRoot, ".env") });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  DATABASE_URL: z.string().default("file:./dev.db"),
  AGENT_PROVIDER: z.enum(["mock", "github", "local"]).default("mock"),
  AGENT_OFFICE_HOOK_TOKEN: z.string().min(32).optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_ORG: z.string().optional(),
  GITHUB_REPOSITORIES: z.string().default(""),
  GITHUB_REPOSITORY_DENYLIST: z.string().default(""),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(3600).default(30),
  IDLE_THRESHOLD_MINUTES: z.coerce.number().int().min(1).default(10),
  OFFLINE_THRESHOLD_MINUTES: z.coerce.number().int().min(1).default(60),
  ENABLE_DEMO_CONTROLS: z.string().default("true"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  COPILOT_USAGE_DB_PATH: z.string().min(1).optional(),
  VSCODE_USAGE_TRACKING: z.enum(["true", "false"]).default("true"),
  VSCODE_USER_DATA_PATH: z.string().min(1).optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
  );
}
if (
  parsed.data.AGENT_PROVIDER === "github" &&
  (!parsed.data.GITHUB_TOKEN || !parsed.data.GITHUB_ORG)
) {
  throw new Error("GITHUB_TOKEN and GITHUB_ORG are required when AGENT_PROVIDER=github");
}
if (parsed.data.AGENT_PROVIDER === "local" && !parsed.data.AGENT_OFFICE_HOOK_TOKEN) {
  throw new Error("AGENT_OFFICE_HOOK_TOKEN is required when AGENT_PROVIDER=local");
}
export const env = parsed.data;
process.env.DATABASE_URL ??= env.DATABASE_URL;
export const repositoryAllowlist = env.GITHUB_REPOSITORIES.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
export const repositoryDenylist = env.GITHUB_REPOSITORY_DENYLIST.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
