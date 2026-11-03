import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertPortAvailable, prepareInstallation } from "../../../scripts/manage-installation.mjs";
import { resolveDatabaseUrl, resolveOfficePaths } from "../../../scripts/office-paths.mjs";

let directory: string;
let root: string;
let environment: NodeJS.ProcessEnv;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agent-office-install-"));
  root = join(directory, "app with spaces");
  await mkdir(root);
  await writeFile(
    join(root, ".env.example"),
    "PORT=4000\nAGENT_PROVIDER=mock\nDATABASE_URL=file:./dev.db\n",
  );
  environment = { LOCALAPPDATA: join(directory, "user data") };
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("portable installation", () => {
  it("creates per-user settings and records a stable Node executable", async () => {
    const manifest = await prepareInstallation(root, environment);
    expect(manifest.dataDirectory).toBe(join(environment.LOCALAPPDATA!, "AgentOffice"));
    expect(manifest.nodePath).toBe(realpathSync(process.execPath));
    const paths = resolveOfficePaths(root, environment);
    expect(paths.legacy).toBe(false);
    expect(await readFile(paths.envPath, "utf8")).toContain("PORT=4000");
    await expect(readFile(join(root, ".env"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("copies legacy configuration and the SQLite database including WAL contents", async () => {
    const prisma = join(root, "apps", "server", "prisma");
    await mkdir(prisma, { recursive: true });
    const original =
      "PORT=4567\nAGENT_PROVIDER=local\nAGENT_OFFICE_HOOK_TOKEN=" +
      "a".repeat(32) +
      "\nDATABASE_URL=file:./dev.db\n";
    await writeFile(join(root, ".env"), original);
    const database = new Database(join(prisma, "dev.db"));
    database.pragma("journal_mode = WAL");
    database.exec(
      "CREATE TABLE settings (title TEXT); INSERT INTO settings VALUES ('Preserved office')",
    );
    try {
      const { dataDirectory } = await prepareInstallation(root, environment);
      const migrated = new Database(join(dataDirectory, "dev.db"), { readonly: true });
      try {
        expect(migrated.prepare("SELECT title FROM settings").get()).toEqual({
          title: "Preserved office",
        });
      } finally {
        migrated.close();
      }
      expect(await readFile(join(root, ".env"), "utf8")).toBe(original);
      expect(await readFile(join(dataDirectory, ".env"), "utf8")).toBe(original);
    } finally {
      database.close();
    }
  });

  it("preserves existing per-user data on repeated repair", async () => {
    const { dataDirectory } = await prepareInstallation(root, environment);
    await writeFile(join(dataDirectory, ".env"), "PORT=4567\nDATABASE_URL=file:./dev.db\n");
    await writeFile(join(dataDirectory, "dev.db"), "unchanged");
    await prepareInstallation(root, environment);
    expect(await readFile(join(dataDirectory, "dev.db"), "utf8")).toBe("unchanged");
    expect(await readFile(join(dataDirectory, ".env"), "utf8")).toContain("PORT=4567");
  });

  it("refuses ambiguous legacy/per-user data unless explicitly reused", async () => {
    const data = join(environment.LOCALAPPDATA!, "AgentOffice");
    await mkdir(data, { recursive: true });
    await writeFile(join(data, ".env"), "PORT=4567");
    await writeFile(join(root, ".env"), "PORT=4000");
    await expect(prepareInstallation(root, environment)).rejects.toThrow(
      "Both legacy and per-user settings exist",
    );
    await prepareInstallation(root, { ...environment, AGENT_OFFICE_USE_EXISTING_DATA: "true" });
    expect(await readFile(join(data, ".env"), "utf8")).toBe("PORT=4567");
  });

  it("does not turn a missing legacy database into a new empty office", async () => {
    await writeFile(join(root, ".env"), "DATABASE_URL=file:./missing.db\n");
    await expect(prepareInstallation(root, environment)).rejects.toThrow(
      "legacy database is missing",
    );
    await expect(
      readFile(join(environment.LOCALAPPDATA!, "AgentOffice", ".env")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to abandon an orphaned legacy database when settings were not copied", async () => {
    const prisma = join(root, "apps", "server", "prisma");
    await mkdir(prisma, { recursive: true });
    await writeFile(join(prisma, "dev.db"), "preserve");
    await expect(prepareInstallation(root, environment)).rejects.toThrow(
      "database was found without its .env",
    );
  });

  it("does not recreate a missing database from a completed installation", async () => {
    await prepareInstallation(root, environment);
    const paths = resolveOfficePaths(root, environment);
    await writeFile(
      paths.manifestPath,
      JSON.stringify({
        ...paths.installation,
        initialized: true,
      }),
    );
    await expect(prepareInstallation(root, environment)).rejects.toThrow(
      "installed database is missing",
    );
  });

  it("honors explicit separate data directories and resolves relative databases there", async () => {
    const custom = join(directory, "separate instance");
    await prepareInstallation(root, { ...environment, AGENT_OFFICE_DATA_DIR: custom });
    const paths = resolveOfficePaths(root, environment);
    expect(paths.dataDirectory).toBe(custom);
    expect(resolveDatabaseUrl("file:./dev.db", paths.databaseDirectory)).toBe(
      `file:${join(custom, "dev.db").replaceAll("\\", "/")}`,
    );
    expect(() => resolveOfficePaths(root, { AGENT_OFFICE_DATA_DIR: "relative" })).toThrow(
      "absolute path",
    );
  });

  it("retains schema-relative paths for unmigrated legacy installations", async () => {
    await writeFile(join(root, ".env"), "DATABASE_URL=file:./dev.db\n");
    const paths = resolveOfficePaths(root, environment);
    expect(paths.legacy).toBe(true);
    expect(paths.databaseDirectory).toBe(join(root, "apps", "server", "prisma"));
  });

  it("uses active per-user data, not the preserved legacy copy, when changing data directories", async () => {
    const { dataDirectory } = await prepareInstallation(root, environment);
    await writeFile(join(root, ".env"), "PORT=4000\nDATABASE_URL=file:./stale.db\n");
    await writeFile(
      join(dataDirectory, ".env"),
      "PORT=4567\nDATABASE_URL=file:./dev.db?connection_limit=1\n",
    );
    const database = new Database(join(dataDirectory, "dev.db"));
    database.exec(
      "CREATE TABLE settings (title TEXT); INSERT INTO settings VALUES ('Latest office')",
    );
    database.close();
    const destination = join(directory, "new data");
    await prepareInstallation(root, { ...environment, AGENT_OFFICE_DATA_DIR: destination });
    const migrated = new Database(join(destination, "dev.db"), { readonly: true });
    try {
      expect(migrated.prepare("SELECT title FROM settings").get()).toEqual({
        title: "Latest office",
      });
    } finally {
      migrated.close();
    }
    expect(await readFile(join(destination, ".env"), "utf8")).toContain("PORT=4567");
    expect(await readFile(join(destination, ".env"), "utf8")).toContain("?connection_limit=1");
  });

  it("rejects data stored inside the application folder", async () => {
    await expect(
      prepareInstallation(root, {
        ...environment,
        AGENT_OFFICE_DATA_DIR: join(root, "data"),
      }),
    ).rejects.toThrow("outside the application folder");
  });

  it("detects an occupied port before migrations without stopping its owner", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port assigned.");
    try {
      await expect(assertPortAvailable({ PORT: String(address.port) }, {})).rejects.toThrow(
        "port is in use",
      );
      expect(server.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    await expect(assertPortAvailable({ PORT: String(address.port) }, {})).resolves.toBeUndefined();
  });

  it("registers hooks with the configured port, persistent settings and stable runtime", async () => {
    const data = join(directory, "hook data");
    await mkdir(data);
    await writeFile(join(data, ".env"), "PORT=4567\nHOST=::1\nAGENT_PROVIDER=mock\n");
    const script = fileURLToPath(new URL("../scripts/connect-local-agents.mjs", import.meta.url));
    const hookEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      AGENT_OFFICE_DATA_DIR: data,
      USERPROFILE: directory,
    };
    delete hookEnvironment.PORT;
    delete hookEnvironment.HOST;
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: hookEnvironment,
    });
    expect(result.status, result.stderr).toBe(0);
    const registration = JSON.parse(
      await readFile(join(directory, ".copilot", "hooks", "agent-office.json"), "utf8"),
    );
    const hook = registration.hooks.sessionStart[0];
    expect(hook.env.AGENT_OFFICE_HOOK_URL).toBe("http://[::1]:4567/api/v1/local/hooks");
    expect(hook.env.AGENT_OFFICE_HOOK_TOKEN).toHaveLength(64);
    expect(hook.command).toContain(realpathSync(process.execPath));
    expect(hook.powershell).toMatch(/^& '/);
    expect(await readFile(join(data, ".env"), "utf8")).toContain("AGENT_PROVIDER=local");
  });
});
