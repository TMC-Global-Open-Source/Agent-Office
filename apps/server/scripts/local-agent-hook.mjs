import { basename } from "node:path";

const [event] = process.argv.slice(2);
const hookUrl = process.env.AGENT_OFFICE_HOOK_URL ?? "http://127.0.0.1:4000/api/v1/local/hooks";

try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1024 * 1024) throw new Error("Hook payload exceeded the size limit.");
  }
  const payload = JSON.parse(input);
  const sessionId = payload.sessionId ?? payload.session_id;
  const cwd = payload.cwd;
  const rawTimestamp = payload.timestamp;
  const runtime =
    payload.hook_event_name || (payload.session_id && !payload.sessionId)
      ? "vscode"
      : "copilot-cli";
  if (
    !event ||
    !["copilot-cli", "vscode"].includes(runtime) ||
    typeof sessionId !== "string" ||
    typeof cwd !== "string" ||
    (typeof rawTimestamp !== "string" && typeof rawTimestamp !== "number")
  ) {
    throw new Error("Hook payload is missing required session metadata.");
  }
  const timestamp = new Date(rawTimestamp).toISOString();
  const workspace = basename(cwd.replace(/[\\/]+$/, "")).slice(0, 128) || "local workspace";
  const subagentId = payload.agentId ?? payload.agent_id;
  const subagentType =
    payload.agentType ?? payload.agent_type ?? payload.agentName ?? payload.agent_name;
  const body = {
    event,
    runtime,
    sessionId,
    timestamp,
    workspace,
    cwd: cwd.slice(0, 1024),
    ...(event === "sessionEnd" && typeof payload.reason === "string"
      ? { reason: payload.reason }
      : {}),
    ...(typeof subagentId === "string" ? { subagentId } : {}),
    ...(typeof subagentType === "string" ? { subagentType } : {}),
    ...(typeof (payload.toolName ?? payload.tool_name) === "string"
      ? { toolName: (payload.toolName ?? payload.tool_name).slice(0, 128) }
      : {}),
  };
  const response = await fetch(hookUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.AGENT_OFFICE_HOOK_TOKEN ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`Agent Office returned HTTP ${response.status}.`);
} catch (error) {
  console.error(
    `Agent Office hook event was not delivered: ${error instanceof Error ? error.message : "unknown error"}`,
  );
}
