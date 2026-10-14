import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("forwards tool names and child identity through the installed bridge without sensitive contents", async () => {
  let received: unknown;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test listener did not bind.");
    const helper = fileURLToPath(new URL("../scripts/local-agent-hook.mjs", import.meta.url));
    const child = spawn(process.execPath, [helper, "preToolUse"], {
      env: {
        ...process.env,
        AGENT_OFFICE_HOOK_URL: `http://127.0.0.1:${address.port}/`,
        AGENT_OFFICE_HOOK_TOKEN: "fixture-token",
      },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    child.stdin.end(
      JSON.stringify({
        session_id: "session",
        agent_id: "child",
        agent_type: "research",
        hook_event_name: "PreToolUse",
        timestamp: new Date().toISOString(),
        cwd: "C:\\private\\project",
        tool_name: "Read",
        prompt: "private",
        tool_input: { content: "private" },
        tool_response: "private",
        error: "private",
        transcript_path: "private",
      }),
    );
    expect(await exited).toBe(0);
    expect(errors).toBe("");
    expect(received).toMatchObject({
      event: "preToolUse",
      runtime: "vscode",
      workspace: "project",
      toolName: "Read",
      subagentId: "child",
      subagentType: "research",
    });
    expect(JSON.stringify(received)).not.toContain("private");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
