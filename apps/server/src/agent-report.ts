import { z } from "zod";
import type { Agent, AgentReport, AgentReportDay } from "@agent-office/shared";
import type { AgentRunState, AgentWorkingInterval, AgentRuntimeDay } from "@prisma/client";
import { addCounts, emptyCounts, readDailyAttributedUsage } from "./usage-attribution.js";
import { nextReportDate, startOfReportDate } from "./report-time.js";

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
    timeZone: z
      .string()
      .max(100)
      .default("UTC")
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Invalid time zone."),
    agentId: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) => [...new Set(typeof value === "string" ? [value] : (value ?? []))])
      .pipe(z.array(z.string().min(1).max(200)).max(50)),
    allAgents: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .refine((value) => !value.allAgents || value.agentId.length === 0, {
    message: "Choose all agents or individual agents, not both.",
    path: ["allAgents"],
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
  usage: Pick<ReturnType<typeof readDailyAttributedUsage>, "sources" | "usage"> &
    Partial<Pick<ReturnType<typeof readDailyAttributedUsage>, "estimatedIntervals">>,
  now = new Date(),
  observedDays: AgentRuntimeDay[] = [],
): AgentReport {
  const selected = new Set(query.allAgents ? agents.map((agent) => agent.id) : query.agentId);
  const byId = new Map(states.map((state) => [state.agentId, state]));
  const days: AgentReportDay[] = [];
  const rows = new Map<string, AgentReportDay>();
  const observed = new Set(observedDays.map((day) => `${day.agentId}:${day.date}`));
  const dates: Array<{ date: string; start: number; end: number }> = [];
  for (let date = query.start; date <= query.end; date = nextReportDate(date)) {
    dates.push({
      date,
      start: startOfReportDate(date, query.timeZone),
      end: startOfReportDate(nextReportDate(date), query.timeZone),
    });
  }
  for (const agent of agents.filter((agent) => selected.has(agent.id))) {
    for (const { date, start } of dates) {
      const row: AgentReportDay = {
        ...emptyCounts(),
        agentId: agent.id,
        date,
        workingMilliseconds:
          query.timeZone === "UTC" && observed.has(`${agent.id}:${date}`) && start < now.getTime()
            ? 0
            : null,
        estimatedMilliseconds: null,
        inputTokenCalls: 0,
        outputTokenCalls: 0,
      };
      days.push(row);
      rows.set(`${agent.id}:${date}`, row);
    }
  }
  for (const interval of intervals) {
    for (const { date, start, end } of dates) {
      const row = rows.get(`${interval.agentId}:${date}`);
      if (!row) continue;
      const milliseconds = Math.max(
        0,
        Math.min(interval.endedAt.getTime(), end, now.getTime()) -
          Math.max(interval.startedAt.getTime(), start),
      );
      if (milliseconds > 0) row.workingMilliseconds = (row.workingMilliseconds ?? 0) + milliseconds;
    }
  }
  const estimatesByAgent = new Map<string, Array<{ start: number; end: number }>>();
  for (const interval of usage.estimatedIntervals ?? []) {
    if (!selected.has(interval.agentId)) continue;
    const list = estimatesByAgent.get(interval.agentId) ?? [];
    list.push({ start: interval.start, end: Math.min(interval.end, now.getTime()) });
    estimatesByAgent.set(interval.agentId, list);
  }
  for (const [agentId, estimates] of estimatesByAgent) {
    estimates.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const estimate of estimates) {
      if (estimate.end <= estimate.start) continue;
      const last = merged.at(-1);
      if (last && estimate.start <= last.end) last.end = Math.max(last.end, estimate.end);
      else merged.push({ ...estimate });
    }
    for (const interval of merged) {
      for (const { date, start, end } of dates) {
        const row = rows.get(`${agentId}:${date}`);
        const milliseconds = Math.max(
          0,
          Math.min(interval.end, end) - Math.max(interval.start, start),
        );
        if (row && milliseconds > 0)
          row.estimatedMilliseconds = (row.estimatedMilliseconds ?? 0) + milliseconds;
      }
    }
  }
  const unattributed = emptyCounts();
  const repositoriesByAgent = new Map<string, Set<string>>();
  for (const item of usage.usage) {
    if (!item.agentId) {
      addCounts(unattributed, item.counts);
      continue;
    }
    if (item.repository?.trim()) {
      const repositories = repositoriesByAgent.get(item.agentId) ?? new Set<string>();
      repositories.add(item.repository.trim());
      repositoriesByAgent.set(item.agentId, repositories);
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
    timezone: query.timeZone,
    asOf: now.toISOString(),
    agents: agents.map((agent) => ({
      id: agent.id,
      displayName: agent.displayName,
      source: agent.source,
      runtime: typeof agent.metadata.runtime === "string" ? agent.metadata.runtime : null,
      repositories: [
        ...new Set([
          ...(agent.repositoryOwner && agent.repositoryName
            ? [`${agent.repositoryOwner}/${agent.repositoryName}`]
            : []),
          ...(agent.source === "local" &&
          agent.metadata.runtime === "vscode" &&
          agent.repositoryName?.trim()
            ? [agent.repositoryName]
            : []),
          ...(repositoriesByAgent.get(agent.id) ?? []),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
      trackedSince: byId.get(agent.id)?.trackedSince.toISOString() ?? null,
    })),
    days,
    sources: usage.sources,
    unattributed,
  };
}
