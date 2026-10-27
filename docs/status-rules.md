# Status rules and evidence

Statuses are normalized to `spawning`, `working`, `idle`, `needs_attention`, `queued`, `completed`, `failed`, and `offline`.

The shared inference helper applies attention/blocking evidence first, then failures, active work, queued work, successful completion, and idle fallback. Each evidence record carries its kind, description, UTC observation time, confidence, and optional source URL. UI detail labels mock and inferred status separately and does not invent a failure message.

The GitHub adapter observes pull requests with Copilot/agent-like author logins. An open pull request is weak evidence for working; a merged pull request is completion evidence when observed. Configured question markers in a pull request title or body infer `needs_attention`, and completion markers infer `completed`; these are evidence-based inferences, not direct session telemetry. An open pull request crosses the configured idle threshold to become `idle` and the offline threshold to become `offline`. Closed, unmerged pull requests remain `idle` because GitHub does not expose whether the agent itself failed.

The local hook provider reports session lifecycle directly from supported Copilot CLI and VS Code local-harness hooks. Prompt, transcript, tool input, and tool output content are deliberately discarded. CLI session end events distinguish completion and errors; the VS Code Local harness's stop event represents an idle turn, not a closed session. Sessions with no hook activity past the offline threshold become `offline`.

Local turn-stop events spend the saved **Idle delay (seconds)** in `needs_attention` at
the desk before becoming `idle` and moving to the couch (default: 20 seconds; range:
0-3600). This is a prompt-wait grace period, not a claim that Copilot reported a blocker.
The evidence retains the stop event and records the elapsed wait separately. Work resuming
or a session ending cancels the pending transition; genuine terminal statuses are unchanged.

The adapter does not currently observe workflow/check, review, or direct Copilot session state. Unsupported state remains unknown rather than fabricated. Configure marker lists in Office settings; each non-empty line is treated as a case-insensitive substring in the pull request title or body.

Mock status is generated from fixed sample agents and controllable demo transitions. An agent missing from one successful provider refresh goes offline and its desk is cleared immediately. Offline agents and working agents explicitly reporting `officeActivity: "away"` are excluded from office headcount; their profiles and history remain stored. Joining and queued agents keep their desks. A failed provider fetch never clears desks or overwrites the stored snapshot.
