import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { prepareInstallation } from "../../../scripts/manage-installation.mjs";

const sourceRoot = fileURLToPath(new URL("../../..", import.meta.url));
let directory: string | undefined;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), "agent-office-launch-"));
  const root = join(directory, "moved app with spaces");
  const data = join(directory, "persistent data");
  await mkdir(join(root, "apps", "server", "dist"), { recursive: true });
  await cp(join(sourceRoot, "scripts"), join(root, "scripts"), { recursive: true });
  await cp(join(sourceRoot, "apps", "server", "dist"), join(root, "apps", "server", "dist"), {
    recursive: true,
  });
  await cp(join(sourceRoot, "apps", "web", "dist"), join(root, "apps", "web", "dist"), {
    recursive: true,
  });
  await symlink(join(sourceRoot, "node_modules"), join(root, "node_modules"), "junction");
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No port assigned.");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  await writeFile(
    join(root, ".env.example"),
    `HOST=127.0.0.1\nPORT=${port}\nAGENT_PROVIDER=mock\nAGENT_OFFICE_HOOK_TOKEN=\nDATABASE_URL=file:./dev.db\n`,
  );
  const environment: NodeJS.ProcessEnv = { ...process.env, AGENT_OFFICE_DATA_DIR: data };
  environment.COPILOT_USAGE_DB_PATH = join(data, "missing-usage.db");
  environment.VSCODE_USAGE_TRACKING = "false";
  for (const key of [
    "HOST",
    "PORT",
    "WEB_PORT",
    "AGENT_PROVIDER",
    "AGENT_OFFICE_HOOK_TOKEN",
    "DATABASE_URL",
    "NODE_ENV",
  ]) {
    delete environment[key];
  }
  const prepared = spawnSync(
    process.execPath,
    [join(root, "scripts", "manage-installation.mjs"), "prepare"],
    { env: environment, encoding: "utf8" },
  );
  expect(prepared.status, prepared.stderr).toBe(0);
  expect(
    JSON.parse(await readFile(join(root, ".agent-office", "installation.json"), "utf8"))
      .installationRoot,
  ).toBe(root);
  const migration = spawnSync(
    process.execPath,
    [
      join(sourceRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      join(sourceRoot, "apps", "server", "prisma", "schema.prisma"),
    ],
    {
      env: { ...environment, DATABASE_URL: `file:${join(data, "dev.db").replaceAll("\\", "/")}` },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  expect(migration.status, migration.stderr).toBe(0);
  return { root, data, environment, port };
}

describe.skipIf(process.platform !== "win32" || process.env.AGENT_OFFICE_INSTALL_TEST !== "true")(
  "Windows production launcher",
  () => {
    it("verifies the migrated database, API and dashboard then stops its smoke-test server", async () => {
      const { root: originalRoot, data, environment, port } = await fixture();
      const root = `${originalRoot} relocated`;
      await rename(originalRoot, root);
      await prepareInstallation(root, environment);
      const manifest = JSON.parse(
        await readFile(join(root, ".agent-office", "installation.json"), "utf8"),
      );
      expect(manifest.dataDirectory).toBe(data);
      expect(manifest.installationRoot).toBe(root);
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(root, "scripts", "Launch-AgentOffice.ps1"),
          "-SmokeTest",
          "-NoBrowser",
        ],
        { env: environment, encoding: "utf8", timeout: 45_000 },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("Startup check passed");
      const completed = spawnSync(
        process.execPath,
        [join(root, "scripts", "manage-installation.mjs"), "complete"],
        { env: environment, encoding: "utf8" },
      );
      expect(completed.status, completed.stderr).toBe(0);
      expect(
        JSON.parse(await readFile(join(root, ".agent-office", "installation.json"), "utf8"))
          .initialized,
      ).toBe(true);
      await expect(fetch(`http://127.0.0.1:${port}/api/v1/health`)).rejects.toThrow();
      await expect(readFile(join(root, ".agent-office", "server.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }, 60_000);

    it("prints the actual server error when startup fails", async () => {
      const { root, data, environment } = await fixture();
      await writeFile(
        join(data, ".env"),
        (await readFile(join(data, ".env"), "utf8")).replace(
          "AGENT_OFFICE_HOOK_TOKEN=",
          "AGENT_OFFICE_HOOK_TOKEN=invalid",
        ),
      );
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(root, "scripts", "Launch-AgentOffice.ps1"),
          "-SmokeTest",
          "-NoBrowser",
        ],
        { env: environment, encoding: "utf8", timeout: 45_000 },
      );
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stdout).toContain("Invalid environment configuration: AGENT_OFFICE_HOOK_TOKEN");
    }, 60_000);

    it("registers an owned shortcut, launches in the background, and disables without stopping the server", async () => {
      const { root, environment, port } = await fixture();
      const startup = join(directory!, "isolated Startup");
      await mkdir(startup);
      const manage = (action: string, appRoot = root) =>
        spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            join(appRoot, "scripts", "Manage-Autostart.ps1"),
            "-Action",
            action,
            "-StartupDirectory",
            startup,
          ],
          { env: environment, encoding: "utf8", timeout: 45_000 },
        );
      const shortcut = join(startup, "Copilot Agent Office.lnk");
      const enable = manage("Enable");
      expect(enable.status, enable.stdout + enable.stderr).toBe(0);
      expect(manage("Enable").stdout).toContain("already enabled");
      const probe = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:TEST_SHORTCUT); $s | Select-Object TargetPath,Arguments,WorkingDirectory | ConvertTo-Json -Compress",
        ],
        { env: { ...environment, TEST_SHORTCUT: shortcut }, encoding: "utf8" },
      );
      expect(probe.status, probe.stderr).toBe(0);
      const spec = JSON.parse(probe.stdout);
      expect(spec.TargetPath.toLowerCase()).toMatch(/powershell\.exe$/);
      expect(spec.Arguments).toContain(
        `-File "${join(root, "scripts", "Start-AgentOfficeAutostart.ps1")}"`,
      );
      expect(spec.WorkingDirectory).toBe(root);

      try {
        const run = spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "$s = New-Object -ComObject WScript.Shell; exit $s.Run(('\"' + $env:TEST_SHORTCUT + '\"'), 0, $false)",
          ],
          { env: { ...environment, TEST_SHORTCUT: shortcut }, stdio: "ignore", timeout: 10_000 },
        );
        expect(run.status).toBe(0);
        let health: { data?: { application?: string } } | undefined;
        for (let attempt = 0; attempt < 60 && !health; attempt++) {
          try {
            health = await fetch(`http://127.0.0.1:${port}/api/v1/health`).then((r) => r.json());
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        expect(health?.data?.application).toBe("copilot-agent-office");
        let log = "";
        for (let attempt = 0; attempt < 30 && !log.includes("Agent Office is running"); attempt++) {
          log = await readFile(join(root, ".agent-office", "autostart.log"), "utf8");
          if (!log.includes("Agent Office is running"))
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        expect(log).toContain("Agent Office is running");
        expect(manage("Disable").status).toBe(0);
        expect((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).ok).toBe(true);
        expect(manage("Disable").stdout).toContain("not enabled");
        await expect(readFile(shortcut)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        const stop = spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            join(root, "scripts", "Stop-AgentOffice.ps1"),
          ],
          { env: environment, encoding: "utf8", timeout: 30_000 },
        );
        expect(stop.status, stop.stdout + stop.stderr).toBe(0);
      }
    }, 90_000);

    it("preserves a startup shortcut owned by another installation", async () => {
      const { root, environment } = await fixture();
      const startup = join(directory!, "isolated Startup");
      await mkdir(startup);
      const path = join(startup, "Copilot Agent Office.lnk");
      const create = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:TEST_SHORTCUT); $s.TargetPath = $env:ComSpec; $s.Save()",
        ],
        { env: { ...environment, TEST_SHORTCUT: path }, encoding: "utf8" },
      );
      expect(create.status, create.stderr).toBe(0);
      const original = await readFile(path);
      for (const action of ["Enable", "Disable"]) {
        const result = spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            join(root, "scripts", "Manage-Autostart.ps1"),
            "-Action",
            action,
            "-StartupDirectory",
            startup,
          ],
          { env: environment, encoding: "utf8", timeout: 45_000 },
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain("another installation");
        expect(await readFile(path)).toEqual(original);
      }
    }, 60_000);

    it("records launch failures in the autostart log", async () => {
      const { root, data, environment } = await fixture();
      await writeFile(
        join(data, ".env"),
        (await readFile(join(data, ".env"), "utf8")).replace(
          "AGENT_OFFICE_HOOK_TOKEN=",
          "AGENT_OFFICE_HOOK_TOKEN=invalid",
        ),
      );
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          join(root, "scripts", "Start-AgentOfficeAutostart.ps1"),
        ],
        { env: environment, encoding: "utf8", timeout: 45_000 },
      );
      expect(result.status).toBe(1);
      const log = await readFile(join(root, ".agent-office", "autostart.log"), "utf8");
      expect(log).toContain("Invalid environment configuration");
      expect(log).toContain("Autostart failed");
    }, 60_000);
  },
);
