# GitHub integration

Set `AGENT_PROVIDER=github`, `GITHUB_TOKEN`, and `GITHUB_ORG` on the backend. Use a fine-grained, read-only token for repository metadata and pull-request listing in repositories the integration is allowed to inspect. The token is not persisted, logged, returned by the API, or bundled into the frontend.

The adapter uses Octokit's supported organization repository and pull-request REST endpoints and inspects rate-limit response data. Repository allowlist and denylist are comma-separated names. Rate-limit or network errors keep the last successful database state available. The current adapter polls sequentially and returns a readable provider-health message.

GitHub does not provide a general endpoint for an agent's live coding session, internal reasoning, or full lifecycle. The initial adapter only exposes observable pull-request evidence and clearly labels it inferred. Workflow runs, check suites, comments, issue activity, Copilot configuration and usage must only be added using documented endpoints and the proper read permissions; never manufacture a session endpoint or claim direct telemetry.

Credentials are environment-only. For local development, create `.env` from `.env.example`. Avoid exposing the server beyond localhost without adding proper authentication and deployment hardening.
