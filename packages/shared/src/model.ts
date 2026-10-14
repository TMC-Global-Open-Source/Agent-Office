import { z } from "zod";

const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Only HTTPS links are allowed.");

export const agentStates = [
  "spawning",
  "working",
  "idle",
  "needs_attention",
  "queued",
  "completed",
  "failed",
  "offline",
] as const;

export const AgentStateSchema = z.enum(agentStates);
export type AgentState = z.infer<typeof AgentStateSchema>;

export const StatusEvidenceSchema = z.object({
  kind: z.string(),
  description: z.string(),
  observedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  url: HttpsUrlSchema.optional(),
});
export type StatusEvidence = z.infer<typeof StatusEvidenceSchema>;

export const AgentSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: z.enum(["mock", "github", "local"]),
  repositoryOwner: z.string().nullable(),
  repositoryName: z.string().nullable(),
  issueNumber: z.number().int().positive().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  taskTitle: z.string().nullable(),
  taskUrl: HttpsUrlSchema.nullable(),
  status: AgentStateSchema,
  statusReason: z.string().nullable(),
  statusEvidence: z.array(StatusEvidenceSchema).default([]),
  statusConfidence: z.number().min(0).max(1).default(1),
  statusKind: z.enum(["direct", "inferred", "mock"]).default("mock"),
  lastActivityAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  deskId: z.string().nullable(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tokensUsed: z.number().int().min(0).max(2_147_483_647).nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
});
export type Agent = z.infer<typeof AgentSchema>;

export const ActivitySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  kind: z.string(),
  summary: z.string(),
  occurredAt: z.string().datetime(),
  url: HttpsUrlSchema.nullable().default(null),
});
export type AgentActivity = z.infer<typeof ActivitySchema>;

export const ConfigSchema = z.object({
  officeTitle: z.string().trim().min(1).max(120).default("Good work happens together."),
  provider: z.enum(["mock", "github", "local"]),
  organization: z.string().default(""),
  repositories: z.array(z.string()).default([]),
  pollingIntervalSeconds: z.number().int().min(10).max(3600),
  idleThresholdMinutes: z.number().int().min(1).max(1440),
  idleDelaySeconds: z.number().int().min(0).max(3600).default(20),
  offlineThresholdMinutes: z.number().int().min(1).max(10080),
  autoFocusNewAgent: z.boolean().default(true),
  retainOfflineHours: z.number().int().min(1).max(8760).default(24),
  questionMarkers: z.array(z.string()).default(["help wanted", "blocked", "need help", "?"]),
  completionMarkers: z.array(z.string()).default(["agent-office: completed"]),
});
export type AppConfig = z.infer<typeof ConfigSchema>;

export interface UsageHistory {
  available: boolean;
  message: string;
  days: 30;
  since: string;
  asOf: string;
  source: "copilot-local-history";
  inputTokens: number | null;
  outputTokens: number | null;
  calls: number;
  callsWithTokenCounts: number;
  daily: Array<{
    date: string;
    inputTokens: number | null;
    outputTokens: number | null;
    calls: number;
  }>;
}

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export interface ProviderHealth {
  provider: "mock" | "github" | "local";
  healthy: boolean;
  stale: boolean;
  message: string;
  lastSuccessAt: string | null;
  rateLimitResetAt: string | null;
}

export const defaultConfig: AppConfig = {
  officeTitle: "Good work happens together.",
  provider: "mock",
  organization: "",
  repositories: [],
  pollingIntervalSeconds: 30,
  idleThresholdMinutes: 10,
  idleDelaySeconds: 20,
  offlineThresholdMinutes: 60,
  autoFocusNewAgent: true,
  retainOfflineHours: 24,
  questionMarkers: ["help wanted", "blocked", "need help", "?"],
  completionMarkers: ["agent-office: completed"],
};
