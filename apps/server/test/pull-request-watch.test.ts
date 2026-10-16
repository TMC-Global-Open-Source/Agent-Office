import { describe, expect, it } from "vitest";
import { LocalHooksProvider } from "../src/providers/local-hooks.js";
import {
  nextPullRequestMetadata,
  type PullRequestInfo,
} from "../src/providers/pull-request-watch.js";

const base = {
  runtime: "copilot-cli",
  sessionId: "merge-party",
  workspace: "project",
  cwd: "C:\\work\\project",
};

function providerWith(responses: Array<PullRequestInfo | null>) {
  const provider = new LocalHooksProvider();
  const calls: string[] = [];
  provider.watchPullRequests(async (cwd) => {
    calls.push(cwd);
    return responses.shift() ?? null;
  }, 60);
  return { provider, calls };
}

describe("pull request merge detection", () => {
  it("celebrates once when a watched pull request changes from open to merged", async () => {
    const { provider, calls } = providerWith([
      { number: 7, state: "OPEN", url: "https://github.com/o/r/pull/7", title: "Feature" },
      {
        number: 7,
        state: "MERGED",
        mergedAt: new Date().toISOString(),
        url: "https://github.com/o/r/pull/7",
      },
      {
        number: 7,
        state: "MERGED",
        mergedAt: new Date().toISOString(),
        url: "https://github.com/o/r/pull/7",
      },
    ]);
    const agent = provider.recordEvent({
      ...base,
      event: "sessionStart",
      timestamp: new Date().toISOString(),
    });
    expect(agent.metadata).not.toHaveProperty("cwd");
    expect(JSON.stringify(agent)).not.toContain("C:\\\\work");

    let now = Date.now() + 5_000;
    expect(await provider.checkPullRequests(now)).toBe(true);
    let [current] = await provider.fetchAgents();
    expect(current!.pullRequestNumber).toBe(7);
    expect(current!.taskUrl).toBe("https://github.com/o/r/pull/7");
    expect(current!.metadata.pullRequest).toMatchObject({ state: "OPEN", celebrationAt: null });

    now += 61_000;
    expect(await provider.checkPullRequests(now)).toBe(true);
    [current] = await provider.fetchAgents();
    const celebrationAt = (current!.metadata.pullRequest as { celebrationAt: string })
      .celebrationAt;
    expect(celebrationAt).toEqual(expect.any(String));

    // A later hook event keeps the pull request state and does not restart the party.
    provider.recordEvent({ ...base, event: "agentStop", timestamp: new Date().toISOString() });
    now += 61_000;
    expect(await provider.checkPullRequests(now)).toBe(false);
    [current] = await provider.fetchAgents();
    expect(current!.metadata.pullRequest).toMatchObject({ state: "MERGED", celebrationAt });
    expect(calls).toEqual(["C:\\work\\project", "C:\\work\\project", "C:\\work\\project"]);
  });

  it("only celebrates merges first seen within the recent window", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    const merged = (minutesAgo: number): PullRequestInfo => ({
      number: 3,
      state: "MERGED",
      mergedAt: new Date(now - minutesAgo * 60_000).toISOString(),
      url: "https://github.com/o/r/pull/3",
    });
    expect(nextPullRequestMetadata(null, merged(2), now).celebrationAt).toBe(
      new Date(now).toISOString(),
    );
    expect(nextPullRequestMetadata(null, merged(30), now).celebrationAt).toBeNull();
    const closed = nextPullRequestMetadata(
      { number: 3, state: "OPEN", url: null, title: null, mergedAt: null, celebrationAt: null },
      { number: 3, state: "CLOSED", url: "https://github.com/o/r/pull/3" },
      now,
    );
    expect(closed.celebrationAt).toBeNull();
  });

  it("skips offline agents and agents without a session folder", async () => {
    const { provider, calls } = providerWith([]);
    provider.recordEvent({
      runtime: "copilot-cli",
      sessionId: "no-folder",
      workspace: "project",
      event: "sessionStart",
      timestamp: new Date().toISOString(),
    });
    provider.recordEvent({
      ...base,
      event: "sessionEnd",
      reason: "user_exit",
      timestamp: new Date().toISOString(),
    });
    expect(await provider.checkPullRequests(Date.now() + 5_000)).toBe(false);
    expect(calls).toEqual([]);
  });
});
