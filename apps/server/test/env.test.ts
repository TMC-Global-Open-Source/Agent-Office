import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({ config: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "file:./test.db");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("hook token configuration", () => {
  it("accepts the blank optional token from .env.example in mock mode", async () => {
    vi.stubEnv("AGENT_PROVIDER", "mock");
    vi.stubEnv("AGENT_OFFICE_HOOK_TOKEN", "");

    const { env } = await import("../src/env.js");

    expect(env.AGENT_OFFICE_HOOK_TOKEN).toBeUndefined();
  });

  it("still requires a token in local mode", async () => {
    vi.stubEnv("AGENT_PROVIDER", "local");
    vi.stubEnv("AGENT_OFFICE_HOOK_TOKEN", "");

    await expect(import("../src/env.js")).rejects.toThrow(
      "AGENT_OFFICE_HOOK_TOKEN is required when AGENT_PROVIDER=local",
    );
  });

  it("rejects a nonempty token shorter than 32 characters", async () => {
    vi.stubEnv("AGENT_PROVIDER", "mock");
    vi.stubEnv("AGENT_OFFICE_HOOK_TOKEN", "too-short");

    await expect(import("../src/env.js")).rejects.toThrow(
      "Invalid environment configuration: AGENT_OFFICE_HOOK_TOKEN",
    );
  });

  it("preserves a valid token in local mode", async () => {
    const token = "a".repeat(32);
    vi.stubEnv("AGENT_PROVIDER", "local");
    vi.stubEnv("AGENT_OFFICE_HOOK_TOKEN", token);

    const { env } = await import("../src/env.js");

    expect(env.AGENT_OFFICE_HOOK_TOKEN).toBe(token);
  });
});
