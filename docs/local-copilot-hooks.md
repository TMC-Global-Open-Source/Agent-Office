# Local Copilot session integration

Agent Office can receive lifecycle events from Copilot CLI and VS Code agents through supported command hooks. The bridge does not inspect session databases, process memory, transcripts, prompts, tool arguments, or tool results.

## Install

Run `npm run connect:agents` from the repository root. The installer:

- creates or updates `%USERPROFILE%\.copilot\hooks\agent-office.json` on Windows (`~/.copilot/hooks/agent-office.json` on macOS/Linux);
- adds a random bearer token to the root `.env` and switches `AGENT_PROVIDER` to `local`;
- registers session, prompt, tool, stop, and subagent lifecycle hooks.

Restart Agent Office after installation. Start or resume local Copilot CLI or VS Code sessions to populate the office. Hooks are installed at user scope and therefore apply to eligible local sessions in any workspace. Remove this integration with `npm run disconnect:agents`; it removes only the Agent Office hook file and restores mock mode.

## Data and status

The hook command sends an event name, runtime label, opaque session/subagent identity,
timestamp, workspace folder name, session folder path, supplied subagent type, session-end
reason, and tool name to `127.0.0.1`. Identities are SHA-256 hashed before persistence. The
session folder path is kept only in server memory to watch pull requests (below); it is never
persisted or returned by the API. Prompt text,
transcript paths, tool arguments/results, error messages, and stack traces are discarded
before the request is sent. Tool names are classified into activities, not persisted as raw payloads.

### Office activities and subagent teams

Working status is independent of office activity. File reads/searches show reading;
edits show typing; web tools show research/note-taking; shell/build/test tools show
monitoring. Unknown tools return to a neutral working pose. Successful tool completion
returns to neutral work, not idle. Prompt submission starts typing. Subagent starts
give the parent a brief delegation gesture, context compaction shows organizing papers,
and tool/runtime failures show a brief puzzled reaction. These reactions last five seconds,
are cancelled by newer events, and retain working status. Existing turn-stop attention,
idle-delay/lounge, completion celebration, and offline behavior are unchanged.

The installer registers `preCompact`, `postToolUseFailure`, and `errorOccurred` in addition
to the original lifecycle events. Only events supported by the selected harness fire:
VS Code Local does not currently document separate tool-failure/runtime-error hooks.
Run `npm run connect:agents` again to update an older hook installation.

Identifiable subagents receive a hashed `parentAgentId` and sit in a labeled, flat
floor rectangle with their siblings. Parent sessions retain their original desks.
Grouping uses the full roster so filtering does not rearrange teams; idle children
still relax on the couch. Group layout is a scene-only override of stored desk assignments.
Hooks without a unique subagent ID only trigger parent delegation; no child identity
is invented. In particular, some CLI subagent-start payloads expose only an agent name,
so a child cannot appear until an event supplies its ID. Tool events without a child ID
cannot reliably be attributed to that child.

Session start, submitted prompts, and tool events report `working`. Turn-stop events first
report `needs_attention`: Copilot stays at its desk waiting for your next prompt. After the
**Idle delay (seconds)** setting (20 seconds by default), it becomes `idle` and moves to
the couch. Change this setting in Office settings; it is saved on the server and applies
to pending waits. Set it to 0 for immediate idle. New prompts or tool activity cancel the
wait and return the session to `working` immediately. Pending waits survive server restarts.

Inactivity beyond the configured offline threshold reports `offline`. Copilot CLI session-end events report `completed`, `failed`, or `offline` based on the end reason. VS Code Local hooks expose turn stop rather than an end-of-session event, so a stopped VS Code session remains idle after its prompt-wait delay until it resumes or reaches the offline threshold.

The server binds to loopback by default and requires the generated bearer token for hook requests. Do not expose the server to a network without adding appropriate authentication and transport security. Remote/cloud VS Code sessions are not delivered to this local hook bridge.

## Pull request merge party

For each online local session, the server runs `gh pr view --json number,state,mergedAt,url,title`
in the session folder (the PR for the checked-out branch). Checks run shortly after a session
starts, a few seconds after tool completions/turn stops/session end (at most once per 15 seconds
per session), and otherwise every `PR_WATCH_INTERVAL_SECONDS` (60 by default; `0` disables it).
This requires the [GitHub CLI](https://cli.github.com/) on `PATH` and `gh auth login`; if `gh`
is missing, watching is disabled with a log warning. Branches without a PR are ignored.

The agent's profile links the detected PR. When a watched PR changes from open to merged, or
a merge newer than ten minutes is first seen, the agent celebrates for 14 seconds at its desk:
jumps for joy, waves, does the floss and throws confetti, with a "PR #n merged!" label. Each
merge celebrates once (the timestamp is stored in `metadata.pullRequest.celebrationAt`) and
reduced motion shows a static arms-up pose without confetti. You do not need to rerun
`npm run connect:agents`: the installed hook already runs this repository's helper, which now
sends the folder.

## Token usage

Each agent stores a nullable `tokensUsed` count, shown as **Tokens used** in its profile.
The dashboard roster and accessible list also show each agent's count; the **Token usage**
card explains telemetry availability and how many sessions have reported counts.
`null` means usage has not been reported, distinct from a reported zero. The authenticated
local event adapter accepts an optional `tokensUsed` nonnegative integer (up to 2,147,483,647),
defined as the cumulative total for that exact session/subagent, not a per-event delta.
Repeated deliveries replace the total rather than add to it. Events without usage preserve
the last known count; stored counts survive restarts and provider refreshes.

The installed CLI/VS Code lifecycle hook bridge currently provides **no token count**.
It does not estimate usage or read transcripts/session databases. An adapter with actual
usage telemetry must supply the cumulative total explicitly. GitHub and demo providers
also leave usage unreported rather than fabricate totals.

## Last 30 days of local usage history

Agent Office independently reads `~/.copilot/session-store.db` in read-only mode and
shows recorded input/output tokens and API call counts for a rolling 30-day window.
This does **not** require Copilot Cost Lens to be installed or running. Set
`COPILOT_USAGE_DB_PATH` to override the local source path. The `/api/v1/usage/history`
endpoint returns totals and daily aggregates; the dashboard refreshes it every minute.

The history endpoint reads timestamp and token-count columns; no conversation content is returned.
This local database schema is not a public telemetry contract: incompatible versions
show an unavailable message. Missing counts stay unknown, and coverage is shown as
calls with counts versus recorded calls. These history totals cover the local database,
not necessarily every VS Code or CLI session.

`/api/v1/usage/attribution` additionally joins usage rows to `sessions.repository` and
`sessions.cwd` by exact `session_id` and groups the same 30-day counters by workspace
folder name (the desk label), listing known repositories per folder. It hashes the
database session/child identity using the same CLI namespace as the hook bridge and
matches only existing local CLI agents. Root totals exclude child calls. Child totals
require a matching child ID and hashed parent; unknown identities are not inferred
from workspace names or allocated a share of a folder total.
Raw session IDs and parent tool-call IDs are never returned.

The UI shows the verified 30-day input/output totals separately from hook-supplied
cumulative `tokensUsed`. Folder totals include sessions not present in the office;
those calls are **Unattributed** to agents. Missing folder metadata gets its own
bucket. Both breakdowns count each usage row once, but must not be added together.
Cache-token counters are not added to input/output. Missing databases, incompatible
schemas, and query errors are surfaced rather than converted to zero.

When present, `total_nano_aiu` is summed and divided by 1,000,000,000 to report recorded
AI credits (`aiCredits`) with `aiCreditCalls` coverage in both endpoints. The column is
optional: without it, credits are `null` (**Not reported**) and token reporting still works.

## VS Code usage

Both usage endpoints also read VS Code's local chat session logs read-only:
`<user data>/workspaceStorage/*/chatSessions/*.jsonl` and
`<user data>/globalStorage/emptyWindowChatSessions/*.jsonl` (no folder). The user-data
folder defaults to `%APPDATA%\Code\User` (Windows), `~/Library/Application Support/Code/User`
(macOS) or `~/.config/Code/User` (Linux); override it with `VSCODE_USER_DATA_PATH`, or set
`VSCODE_USAGE_TRACKING=false` to disable the source. Each log is an append-only operation
log that is replayed in memory; only each request's `timestamp`, `promptTokens`,
`completionTokens`, and `copilotCredits` are retained. Logs older than the window are
skipped by modification time, and parsed results are cached by path/mtime/size.

The log file name is the VS Code chat session ID, which equals the hook `sessionId`, so a
session's usage is attributed to the VS Code root agent with that exact hashed identity.
Subagent usage is not separable and stays with the root agent. Counts are per chat
request (one request may span several model calls). Both endpoints return a `sources`
array with per-source totals and availability; VS Code remote/cloud sessions are not covered.

## Supported hook references

- [Copilot CLI hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- [VS Code agent hooks](https://code.visualstudio.com/docs/agent-customization/hooks)
- [VS Code Local hooks reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference)
