import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  backupOffice,
  diagnoseOffice,
  restoreOffice,
  unregisterHooks,
} from "../../../scripts/office-maintenance.mjs";

let directory: string;
let root: string;
let data: string;
let environment: NodeJS.ProcessEnv;
const token = "private-token-that-must-not-be-in-diagnostics";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "office-maintenance-"));
  root = join(directory, "app");
  data = join(directory, "data");
  await mkdir(root);
  await mkdir(data);
  await writeFile(join(root, "package.json"), JSON.stringify({ version: "0.1.0" }));
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No port assigned.");
  environment = {
    AGENT_OFFICE_DATA_DIR: data,
    USERPROFILE: directory,
    HOST: "127.0.0.1",
    PORT: String(address.port),
  };
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  await writeFile(
    join(data, ".env"),
    `PORT=${environment.PORT}\nAGENT_PROVIDER=local\nAGENT_OFFICE_HOOK_TOKEN=${token}\nGITHUB_TOKEN=super-secret\nDATABASE_URL=file:./dev.db\n`,
  );
  const database = new Database(join(data, "dev.db"));
  database.exec("CREATE TABLE settings (title TEXT); INSERT INTO settings VALUES ('original')");
  database.close();
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("backs up and restores the database and settings while retaining a pre-restore snapshot", async () => {
  const snapshot = await backupOffice(root, environment);
  expect(snapshot).not.toBeNull();
  const database = new Database(join(data, "dev.db"));
  database.exec("UPDATE settings SET title='changed'");
  database.close();
  await restoreOffice(root, snapshot!, environment);
  const restored = new Database(join(data, "dev.db"));
  try {
    expect(restored.prepare("SELECT title FROM settings").get()).toEqual({ title: "original" });
  } finally {
    restored.close();
  }
  expect((await readdir(join(data, "backups"))).length).toBe(2);
  expect(await readFile(join(data, ".env"), "utf8")).toContain(token);
});

it("rejects a corrupt snapshot without changing current data", async () => {
  const snapshot = await backupOffice(root, environment);
  await writeFile(join(snapshot!, "database.db"), "damaged");
  await expect(restoreOffice(root, snapshot!, environment)).rejects.toThrow(
    "integrity verification failed",
  );
  const database = new Database(join(data, "dev.db"));
  expect(database.prepare("SELECT title FROM settings").get()).toEqual({ title: "original" });
  database.close();
});

it("reports diagnostics without including tokens, settings contents, or hook commands", async () => {
  const hooks = join(directory, ".copilot", "hooks");
  await mkdir(hooks, { recursive: true });
  await writeFile(
    join(hooks, "agent-office.json"),
    JSON.stringify({
      hooks: {
        sessionStart: [
          {
            command: `node "${join(root, "apps", "server", "scripts", "local-agent-hook.mjs")}"`,
            env: { AGENT_OFFICE_HOOK_TOKEN: token },
          },
        ],
      },
    }),
  );
  const result = await diagnoseOffice(root, environment);
  expect(result.hookTokenMatches).toBe(true);
  expect(result.health).toContain("unreachable");
  expect(JSON.stringify(result)).not.toContain(token);
  expect(JSON.stringify(result)).not.toContain("super-secret");
});

it("rejects modified backup settings before replacing either live file", async () => {
  const snapshot = await backupOffice(root, environment);
  await writeFile(join(snapshot!, "settings.env"), "DATABASE_URL=file:./other.db\n");
  await expect(restoreOffice(root, snapshot!, environment)).rejects.toThrow(
    "settings integrity verification failed",
  );
  expect(await readFile(join(data, ".env"), "utf8")).toContain(token);
});

it("unregisters only hooks belonging to this installation and never removes data", async () => {
  const hooks = join(directory, ".copilot", "hooks");
  const path = join(hooks, "agent-office.json");
  await mkdir(hooks, { recursive: true });
  await writeFile(
    path,
    JSON.stringify({
      hooks: { sessionStart: [{ command: 'node "C:\\another-app\\local-agent-hook.mjs"' }] },
    }),
  );
  expect(await unregisterHooks(root, environment)).toBe(false);
  expect(await readFile(path, "utf8")).toContain("another-app");
  await writeFile(
    path,
    JSON.stringify({
      hooks: {
        sessionStart: [
          { command: `node "${join(root, "apps", "server", "scripts", "local-agent-hook.mjs")}"` },
        ],
      },
    }),
  );
  expect(await unregisterHooks(root, environment)).toBe(true);
  await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(data, ".env"), "utf8")).toContain(token);
});

it("does not include malformed hook contents in diagnostic errors", async () => {
  const hooks = join(directory, ".copilot", "hooks");
  await mkdir(hooks, { recursive: true });
  await writeFile(join(hooks, "agent-office.json"), `{"token":"${token}",broken}`);
  await expect(diagnoseOffice(root, environment)).rejects.toThrow(
    "Hook registration is invalid JSON",
  );
  try {
    await diagnoseOffice(root, environment);
  } catch (error) {
    expect(String(error)).not.toContain(token);
  }
});

it("refuses backup while an application is listening on the configured port", async () => {
  const server = createServer();
  await new Promise<void>((resolve) =>
    server.listen(Number(environment.PORT), "127.0.0.1", resolve),
  );
  try {
    await expect(backupOffice(root, environment)).rejects.toThrow("port is in use");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
