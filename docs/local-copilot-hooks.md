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
timestamp, workspace folder name, supplied subagent type, session-end reason, and
tool name to `127.0.0.1`. Identities are SHA-256 hashed before persistence. Prompt text,
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

Only timestamp and token-count columns are read; no conversation content is returned.
This local database schema is not a public telemetry contract: incompatible versions
show an unavailable message. Missing counts stay unknown, and coverage is shown as
calls with counts versus recorded calls. These history totals cover the local database,
not necessarily every VS Code or CLI session, and are not attributed to live agents.

## Supported hook references

- [Copilot CLI hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
- [VS Code agent hooks](https://code.visualstudio.com/docs/agent-customization/hooks)
- [VS Code Local hooks reference](https://code.visualstudio.com/docs/agents/reference/hooks-reference)
