import { Octokit } from "@octokit/rest";
import {
  defaultConfig,
  type Agent,
  type AgentActivity,
  type AppConfig,
  type ProviderHealth,
} from "@agent-office/shared";
import { hexAvatarColor } from "@agent-office/shared";
import { env, repositoryAllowlist, repositoryDenylist } from "../env.js";
import type { AgentProvider } from "./types.js";

export class GitHubAgentProvider implements AgentProvider {
  readonly name = "github" as const;
  private config: AppConfig = {
    ...defaultConfig,
    idleThresholdMinutes: env.IDLE_THRESHOLD_MINUTES,
    offlineThresholdMinutes: env.OFFLINE_THRESHOLD_MINUTES,
  };
  private readonly octokit = new Octokit({
    auth: env.GITHUB_TOKEN,
    userAgent: "copilot-agent-office",
  });
  private lastHealth: ProviderHealth = {
    provider: "github",
    healthy: false,
    stale: true,
    message: "No successful GitHub refresh yet.",
    lastSuccessAt: null,
    rateLimitResetAt: null,
  };

  health(): ProviderHealth {
    return this.lastHealth;
  }

  updateConfig(config: AppConfig): void {
    this.config = config;
  }

  async fetchAgents(): Promise<Agent[]> {
    try {
      const { data: repositories } = await this.octokit.repos.listForOrg({
        org: env.GITHUB_ORG ?? "",
        type: "all",
        per_page: 100,
      });
      const selected = repositories.filter(
        (repository) =>
          (!repositoryAllowlist.length || repositoryAllowlist.includes(repository.name)) &&
          !repositoryDenylist.includes(repository.name),
      );
      const agents: Agent[] = [];
      for (const repository of selected) {
        const { data: pulls } = await this.octokit.pulls.list({
          owner: env.GITHUB_ORG ?? "",
          repo: repository.name,
          state: "all",
          per_page: 100,
        });
        for (const pull of pulls) {
          const login = pull.user?.login;
          if (!login || !/copilot|agent/i.test(login)) continue;
          const updatedAt = pull.updated_at;
          const markerText = `${pull.title} ${pull.body ?? ""}`.toLowerCase();
          const matchesMarker = (markers: string[]) =>
            markers.some(
              (marker) => marker.trim() && markerText.includes(marker.trim().toLowerCase()),
            );
          const completedByMarker = matchesMarker(this.config.completionMarkers);
          const needsAttention = matchesMarker(this.config.questionMarkers);
          const completed = Boolean(pull.merged_at) || completedByMarker;
          const closedWithoutMerge = pull.state === "closed" && !completed;
          const activityAgeMinutes = Number.isFinite(Date.parse(updatedAt))
            ? (Date.now() - Date.parse(updatedAt)) / 60_000
            : 0;
          const offline =
            !completed &&
            !closedWithoutMerge &&
            activityAgeMinutes >= this.config.offlineThresholdMinutes;
          const idle =
            !completed &&
            !closedWithoutMerge &&
            !offline &&
            activityAgeMinutes >= this.config.idleThresholdMinutes;
          const status = completed
            ? "completed"
            : closedWithoutMerge
              ? "idle"
              : needsAttention
                ? "needs_attention"
                : offline
                  ? "offline"
                  : idle
                    ? "idle"
                    : "working";
          const reason = completed
            ? completedByMarker && !pull.merged_at
              ? "Configured completion marker found in the pull request."
              : "Pull request is merged."
            : closedWithoutMerge
              ? "Pull request closed without merging; no agent failure signal is available."
              : needsAttention
                ? "Configured question or attention marker found in the pull request."
                : offline
                  ? `Pull request has no update within the ${this.config.offlineThresholdMinutes}-minute offline threshold.`
                  : idle
                    ? `Pull request has no update within the ${this.config.idleThresholdMinutes}-minute idle threshold.`
                    : "Open pull request updated; session state is inferred.";
          agents.push({
            id: `github:${repository.full_name}:${pull.number}:${login}`,
            displayName: login,
            source: "github",
            repositoryOwner: repository.owner.login,
            repositoryName: repository.name,
            issueNumber: null,
            pullRequestNumber: pull.number,
            taskTitle: pull.title,
            taskUrl: pull.html_url,
            status,
            statusReason: reason,
            statusEvidence: [
              {
                kind: completed
                  ? completedByMarker && !pull.merged_at
                    ? "completion marker"
                    : "completed pull request"
                  : closedWithoutMerge
                    ? "closed pull request"
                    : needsAttention
                      ? "question marker"
                      : offline
                        ? "stale pull request"
                        : idle
                          ? "stale pull request"
                          : "pull request updated",
                description: reason,
                observedAt: pull.closed_at ?? updatedAt,
                confidence: completed ? 0.9 : needsAttention ? 0.8 : 0.6,
                url: pull.html_url,
              },
            ],
            statusConfidence: completed ? 0.9 : needsAttention ? 0.8 : 0.6,
            statusKind: "inferred",
            lastActivityAt: updatedAt,
            startedAt: pull.created_at,
            completedAt: pull.merged_at ?? (completedByMarker ? updatedAt : null),
            updatedAt,
            deskId: null,
            avatarColor: hexAvatarColor(`github:${repository.full_name}:${login}`),
            tokensUsed: null,
            metadata: { inference: true },
          });
        }
      }
      const rate = await this.octokit.rateLimit.get();
      this.lastHealth = {
        provider: "github",
        healthy: true,
        stale: false,
        message: `GitHub read-only refresh succeeded; ${agents.length} matching pull request agent(s).`,
        lastSuccessAt: new Date().toISOString(),
        rateLimitResetAt: new Date(rate.data.rate.reset * 1000).toISOString(),
      };
      return agents;
    } catch (error) {
      const status = (error as { status?: number }).status;
      const headers = (error as { response?: { headers?: Record<string, string> } }).response
        ?.headers;
      const reset = headers?.["x-ratelimit-reset"];
      this.lastHealth = {
        ...this.lastHealth,
        healthy: false,
        stale: true,
        message:
          status === 403 && headers?.["x-ratelimit-remaining"] === "0"
            ? "GitHub rate limit reached; showing last successful data."
            : status === 401
              ? "GitHub authentication failed; check the server token."
              : "GitHub refresh failed; showing last successful data.",
        rateLimitResetAt: reset
          ? new Date(Number(reset) * 1000).toISOString()
          : this.lastHealth.rateLimitResetAt,
      };
      throw error;
    }
  }

  async fetchActivity(agentId: string): Promise<AgentActivity[]> {
    const [, fullName, number] = agentId.split(":");
    const [owner, repo] = (fullName ?? "").split("/");
    const pullNumber = Number(number);
    if (!owner || !repo || !Number.isInteger(pullNumber) || pullNumber < 1) return [];
    const { data } = await this.octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 20,
    });
    return data.map((commit) => ({
      id: `github-commit-${commit.sha}`,
      agentId,
      kind: "commit",
      summary: commit.commit.message.split("\n")[0] ?? "Commit",
      occurredAt: commit.commit.author?.date ?? new Date().toISOString(),
      url: commit.html_url,
    }));
  }
}
