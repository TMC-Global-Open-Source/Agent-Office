import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadOfficeEnvironment } from "../../../scripts/office-paths.mjs";

loadOfficeEnvironment(fileURLToPath(new URL("../../..", import.meta.url)));

const [tool, ...args] = process.argv.slice(2);
if (!tool || !["prisma", "tsx"].includes(tool)) {
  console.error("Expected a local prisma or tsx command.");
  process.exit(2);
}
const command = process.platform === "win32" ? `${tool}.cmd` : tool;
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
