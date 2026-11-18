import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { LocalHookEvent } from "./providers/local-hooks.js";

/** Serializes durable interval updates so hooks and refresh heartbeats cannot overlap. */
export class AgentRuntimeRecorder {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly database: PrismaClient) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result;
    return result;
  }

  recover(): Promise<void> {
    return this.serialize(async () => {
      // The persisted interval already ends at the last heartbeat. Never count server downtime.
      await this.database.agentRunState.updateMany({
        data: { working: false, intervalId: null },
      });
    });
  }

  record(
    agentId: string,
    event: LocalHookEvent,
    offlineMinutes: number,
    now = new Date(),
  ): Promise<void> {
    return this.serialize(() =>
      this.database.$transaction(async (transaction) => {
        const state = await transaction.agentRunState.findUnique({ where: { agentId } });
        const eventAt = new Date(Math.min(Date.parse(event.timestamp), now.getTime()));
        if (state && eventAt < state.lastEventAt) return;
        const stops = ["agentStop", "subagentStop", "sessionEnd"];
        if (
          state &&
          eventAt.getTime() === state.lastEventAt.getTime() &&
          (state.lastEventKind === event.event ||
            (stops.includes(state.lastEventKind) && !stops.includes(event.event)))
        )
          return;
        const cutoff = state
          ? new Date(Math.min(now.getTime(), state.lastEventAt.getTime() + offlineMinutes * 60_000))
          : now;
        if (state?.working && state.intervalId && cutoff > state.lastObservedAt) {
          await transaction.agentWorkingInterval.update({
            where: { id: state.intervalId },
            data: { endedAt: cutoff },
          });
        }
        const working =
          !["sessionStart", "agentStop", "subagentStop", "sessionEnd"].includes(event.event) &&
          now.getTime() - eventAt.getTime() < offlineMinutes * 60_000;
        const continuing = working && state?.working && cutoff.getTime() === now.getTime();
        const intervalId = working ? (continuing ? state.intervalId : randomUUID()) : null;
        const date = now.toISOString().slice(0, 10);
        await transaction.agentRuntimeDay.upsert({
          where: { agentId_date: { agentId, date } },
          create: { agentId, date },
          update: {},
        });
        if (working && !continuing && intervalId) {
          await transaction.agentWorkingInterval.create({
            data: { id: intervalId, agentId, startedAt: now, endedAt: now },
          });
        }
        await transaction.agentRunState.upsert({
          where: { agentId },
          create: {
            agentId,
            trackedSince: now,
            lastEventAt: eventAt,
            lastEventKind: event.event,
            lastObservedAt: now,
            working,
            intervalId,
          },
          update: {
            lastEventAt: eventAt,
            lastEventKind: event.event,
            lastObservedAt: now,
            working,
            intervalId,
          },
        });
      }),
    );
  }

  heartbeat(offlineMinutes: number, now = new Date()): Promise<void> {
    return this.serialize(() =>
      this.database.$transaction(async (transaction) => {
        const states = await transaction.agentRunState.findMany({ where: { working: true } });
        for (const state of states) {
          const end = new Date(
            Math.min(now.getTime(), state.lastEventAt.getTime() + offlineMinutes * 60_000),
          );
          if (state.intervalId && end > state.lastObservedAt) {
            await transaction.agentWorkingInterval.update({
              where: { id: state.intervalId },
              data: { endedAt: end },
            });
          }
          await transaction.agentRunState.update({
            where: { agentId: state.agentId },
            data: {
              lastObservedAt: end > state.lastObservedAt ? end : state.lastObservedAt,
              ...(end < now ? { working: false, intervalId: null } : {}),
            },
          });
        }
      }),
    );
  }
}
