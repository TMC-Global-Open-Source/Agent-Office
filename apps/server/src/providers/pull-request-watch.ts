import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { z } from "zod";

const PullRequestViewSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(["OPEN", "MERGED", "CLOSED"]),
  mergedAt: z.string().nullable().optional(),
  url: z.string(),
  title: z.string().optional(),
});
export type PullRequestInfo = z.infer<typeof PullRequestViewSchema>;

/** Returns the pull request for the branch checked out in `cwd`, or null when there is none. */
export type PullRequestLookup = (cwd: string) => Promise<PullRequestInfo | null>;

export class GhUnavailableError extends Error {}

/** Uses the signed-in GitHub CLI; no token is read or stored by Agent Office. */
export const ghPullRequestLookup: PullRequestLookup = (cwd) =>
  new Promise((resolvePromise, reject) => {
    if (!existsSync(cwd)) return resolvePromise(null);
    execFile(
      "gh",
      ["pr", "view", "--json", "number,state,mergedAt,url,title"],
      { cwd, timeout: 15_000, windowsHide: true, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return reject(new GhUnavailableError("GitHub CLI (gh) is not installed."));
          return resolvePromise(null);
        }
        try {
          resolvePromise(PullRequestViewSchema.parse(JSON.parse(stdout)));
        } catch {
          resolvePromise(null);
        }
      },
    );
  });

export interface PullRequestMetadata {
  number: number;
  state: PullRequestInfo["state"];
  url: string | null;
  title: string | null;
  mergedAt: string | null;
  celebrationAt: string | null;
}

/** A merge recent enough to celebrate when the office first learns about the pull request. */
export const recentMergeWindowMs = 10 * 60_000;

export function nextPullRequestMetadata(
  previous: PullRequestMetadata | null,
  info: PullRequestInfo,
  now: number,
): PullRequestMetadata {
  const samePullRequest = previous?.number === info.number;
  const mergedAt = info.mergedAt ?? null;
  const mergedMs = mergedAt ? Date.parse(mergedAt) : NaN;
  const celebrate =
    info.state === "MERGED" &&
    (samePullRequest
      ? previous!.state === "OPEN"
      : Number.isFinite(mergedMs) && now - mergedMs <= recentMergeWindowMs);
  return {
    number: info.number,
    state: info.state,
    url: /^https:\/\//.test(info.url) ? info.url : null,
    title: info.title?.slice(0, 200) ?? null,
    mergedAt,
    celebrationAt: celebrate
      ? new Date(now).toISOString()
      : samePullRequest
        ? previous!.celebrationAt
        : null,
  };
}

export function readPullRequestMetadata(value: unknown): PullRequestMetadata | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PullRequestMetadata>;
  return typeof candidate.number === "number" && typeof candidate.state === "string"
    ? (candidate as PullRequestMetadata)
    : null;
}
