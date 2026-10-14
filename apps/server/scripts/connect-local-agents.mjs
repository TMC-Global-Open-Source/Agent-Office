import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const envPath = join(root, ".env");
const hookDir = join(process.env.USERPROFILE ?? homedir(), ".copilot", "hooks");
const hookPath = join(hookDir, "agent-office.json");
const helperPath = join(root, "apps", "server", "scripts", "local-agent-hook.mjs");

async function readEnv() {
  try {
    return await readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return "";
  }
}

function readValue(contents, name) {
  const match = contents.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function setValue(contents, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^\\s*${name}\\s*=.*$`, "m");
  return pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.trimEnd()}${contents.trim() ? "\n" : ""}${line}\n`;
}

async function install() {
  let envText = await readEnv();
  let token = readValue(envText, "AGENT_OFFICE_HOOK_TOKEN");
  if (token.length < 32) token = randomBytes(32).toString("hex");
  envText = setValue(
    setValue(envText, "AGENT_PROVIDER", "local"),
    "AGENT_OFFICE_HOOK_TOKEN",
    token,
  );

  try {
    const existing = await readFile(hookPath, "utf8");
    if (!existing.includes("local-agent-hook.mjs")) {
      throw new Error(`${hookPath} already exists and was not created by Agent Office.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const command = `node "${helperPath.replaceAll('"', '\\"')}"`;
  const events = [
    "sessionStart",
    "userPromptSubmitted",
    "preToolUse",
    "postToolUse",
    "agentStop",
    "sessionEnd",
    "subagentStart",
    "subagentStop",
    "preCompact",
    "postToolUseFailure",
    "errorOccurred",
  ];
  const hooks = Object.fromEntries(
    events.map((event) => [
      event,
      [
        {
          type: "command",
          command: `${command} ${event}`,
          powershell: `${command} ${event}`,
          env: {
            AGENT_OFFICE_HOOK_TOKEN: token,
            AGENT_OFFICE_HOOK_URL: "http://127.0.0.1:4000/api/v1/local/hooks",
          },
          timeoutSec: 5,
        },
      ],
    ]),
  );
  await mkdir(hookDir, { recursive: true });
  await writeFile(hookPath, `${JSON.stringify({ version: 1, hooks }, null, 2)}\n`, "utf8");
  await writeFile(envPath, envText, "utf8");
  console.log(`Connected Copilot CLI and VS Code local-agent hooks at ${hookPath}.`);
  console.log(
    "Restart Agent Office and start or resume a local Copilot session to see live agents.",
  );
}

async function uninstall() {
  const existing = await readFile(hookPath, "utf8");
  if (!existing.includes("local-agent-hook.mjs")) {
    throw new Error(
      `${hookPath} does not appear to be the Agent Office hook file; leaving it unchanged.`,
    );
  }
  await rm(hookPath);
  let envText = await readEnv();
  envText = setValue(envText, "AGENT_PROVIDER", "mock");
  envText = envText.replace(/^\s*AGENT_OFFICE_HOOK_TOKEN\s*=.*(?:\r?\n|$)/m, "");
  await writeFile(envPath, envText, "utf8");
  console.log("Removed Agent Office Copilot hooks and restored mock provider mode.");
}

if (process.argv.includes("--remove")) {
  await uninstall();
} else {
  await install();
}
