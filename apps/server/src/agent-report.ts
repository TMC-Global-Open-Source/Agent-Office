import { z } from "zod";
import type { Agent, AgentReport, AgentReportDay } from "@agent-office/shared";
import type { AgentRunState, AgentWorkingInterval, AgentRuntimeDay } from "@prisma/client";
import { addCounts, emptyCounts, readDailyAttributedUsage } from "./usage-attribution.js";

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value,
    "Use a real calendar date in YYYY-MM-DD format.",
  );
export const ReportQuery = z
  .object({
    start: day,
    end: day,
    agentId: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) => [...new Set(typeof value === "string" ? [value] : (value ?? []))])
      .pipe(z.array(z.string().min(1).max(200)).max(50)),
  })
  .refine(
    (value) => {
      const days = (Date.parse(value.end) - Date.parse(value.start)) / 86_400_000;
      return days >= 0 && days < 366;
    },
    { message: "Choose an inclusive date range of 1 to 366 days.", path: ["end"] },
  );

export function buildAgentReport(
  agents: Agent[],
  states: AgentRunState[],
  intervals: AgentWorkingInterval[],
  query: z.infer<typeof ReportQuery>,
  usage: ReturnType<typeof readDailyAttributedUsage>,
  now = new Date(),
  observedDays: AgentRuntimeDay[] = [],
): AgentReport {
  const selected = new Set(query.agentId);
  const byId = new Map(states.map((state) => [state.agentId, state]));
  const days: AgentReportDay[] = [];
  const rows = new Map<string, AgentReportDay>();
  const observed = new Set(observedDays.map((day) => `${day.agentId}:${day.date}`));
  const start = Date.parse(query.start);
  const end = Date.parse(query.end) + 86_400_000;
  for (const agent of agents.filter((agent) => selected.has(agent.id))) {
    for (let timestamp = start; timestamp < end; timestamp += 86_400_000) {
      const date = new Date(timestamp).toISOString().slice(0, 10);
      const row: AgentReportDay = {
        ...emptyCounts(),
        agentId: agent.id,
        date,
        workingMilliseconds:
          observed.has(`${agent.id}:${date}`) && timestamp < now.getTime() ? 0 : null,
        inputTokenCalls: 0,
        outputTokenCalls: 0,
      };
      days.push(row);
      rows.set(`${agent.id}:${date}`, row);
    }
  }
  for (const interval of intervals) {
    for (
      let timestamp = Math.max(
        start,
        Math.floor(interval.startedAt.getTime() / 86_400_000) * 86_400_000,
      );
      timestamp < Math.min(end, interval.endedAt.getTime());
      timestamp += 86_400_000
    ) {
      const row = rows.get(`${interval.agentId}:${new Date(timestamp).toISOString().slice(0, 10)}`);
      if (!row) continue;
      const milliseconds = Math.max(
        0,
        Math.min(interval.endedAt.getTime(), timestamp + 86_400_000, now.getTime()) -
          Math.max(interval.startedAt.getTime(), timestamp),
      );
      row.workingMilliseconds = (row.workingMilliseconds ?? 0) + milliseconds;
    }
  }
  const unattributed = emptyCounts();
  for (const item of usage.usage) {
    if (!item.agentId) {
      addCounts(unattributed, item.counts);
      continue;
    }
    const row = rows.get(`${item.agentId}:${item.date}`);
    if (row) {
      addCounts(row, item.counts);
      row.inputTokenCalls += item.inputTokenCalls;
      row.outputTokenCalls += item.outputTokenCalls;
    }
  }
  return {
    start: query.start,
    end: query.end,
    timezone: "UTC",
    asOf: now.toISOString(),
    agents: agents.map((agent) => ({
      id: agent.id,
      displayName: agent.displayName,
      source: agent.source,
      runtime: typeof agent.metadata.runtime === "string" ? agent.metadata.runtime : null,
      trackedSince: byId.get(agent.id)?.trackedSince.toISOString() ?? null,
    })),
    days,
    sources: usage.sources,
    unattributed,
  };
}
