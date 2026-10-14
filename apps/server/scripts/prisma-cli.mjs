import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../../.env") });
process.env.DATABASE_URL ??= "file:./dev.db";

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
