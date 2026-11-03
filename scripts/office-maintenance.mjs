import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import Database from "better-sqlite3";
import { resolveDatabaseUrl, resolveOfficePaths } from "./office-paths.mjs";
import { assertPortAvailable } from "./manage-installation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function readHookRegistration(path) {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "Hook registration is invalid JSON. Inspect it locally; do not share its token values.",
    );
  }
}

async function activeSettings(root, environment) {
  const paths = resolveOfficePaths(root, environment);
  const text = await readFile(paths.envPath, "utf8");
  const settings = parse(text);
  const database = resolveDatabaseUrl(
    settings.DATABASE_URL ?? "file:./dev.db",
    paths.databaseDirectory,
  )
    .slice(5)
    .split("?")[0];
  if (environment.DATABASE_URL && environment.DATABASE_URL !== settings.DATABASE_URL) {
    throw new Error(
      "Unset DATABASE_URL before maintenance so the saved configuration and active database agree.",
    );
  }
  return { paths, text, settings, database };
}

export async function backupOffice(root, environment = process.env) {
  const active = await activeSettings(root, environment);
  await assertPortAvailable(active.settings, environment);
  if (!existsSync(active.database)) {
    if (active.paths.installation?.initialized)
      throw new Error("Installed database is missing; restore it before upgrading.");
    return null;
  }
  const backupDirectory = join(active.paths.dataDirectory, "backups");
  await mkdir(backupDirectory, { recursive: true });
  const destination = join(
    backupDirectory,
    `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`,
  );
  await mkdir(destination);
  const database = new Database(active.database, { readonly: true, fileMustExist: true });
  try {
    await database.backup(join(destination, "database.db"));
    await writeFile(join(destination, "settings.env"), active.text, { mode: 0o600 });
    const bytes = await readFile(join(destination, "database.db"));
    await writeFile(
      join(destination, "backup.json"),
      JSON.stringify(
        {
          format: 1,
          database: active.database,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          settingsSha256: createHash("sha256").update(active.text).digest("hex"),
        },
        null,
        2,
      ),
    );
  } finally {
    database.close();
  }
  console.log(`Backup created: ${destination} (contains private settings; keep secure).`);
  return destination;
}

export async function restoreOffice(root, snapshot, environment = process.env) {
  const active = await activeSettings(root, environment);
  await assertPortAvailable(active.settings, environment);
  const manifest = JSON.parse(await readFile(join(snapshot, "backup.json"), "utf8"));
  const bytes = await readFile(join(snapshot, "database.db"));
  if (
    manifest.format !== 1 ||
    createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
  ) {
    throw new Error("Backup integrity verification failed. Nothing was restored.");
  }
  if (resolve(manifest.database) !== resolve(active.database)) {
    throw new Error(
      "Backup belongs to a different database path. Restore using its original installation configuration.",
    );
  }
  const settingsText = await readFile(join(snapshot, "settings.env"), "utf8");
  if (createHash("sha256").update(settingsText).digest("hex") !== manifest.settingsSha256) {
    throw new Error("Backup settings integrity verification failed. Nothing was restored.");
  }
  const snapshotSettings = parse(settingsText);
  const snapshotDatabase = resolveDatabaseUrl(
    snapshotSettings.DATABASE_URL ?? "file:./dev.db",
    active.paths.databaseDirectory,
  )
    .slice(5)
    .split("?")[0];
  if (resolve(snapshotDatabase) !== resolve(active.database))
    throw new Error("Backup settings do not match the database destination.");
  const verify = new Database(join(snapshot, "database.db"), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    if (verify.pragma("integrity_check", { simple: true }) !== "ok")
      throw new Error("SQLite backup integrity check failed.");
  } finally {
    verify.close();
  }
  const safetyBackup = await backupOffice(root, environment);
  const temporary = `${active.database}.${process.pid}.restoring`;
  try {
    await copyFile(join(snapshot, "database.db"), temporary);
    for (const suffix of ["-wal", "-shm", "-journal"])
      await rm(`${active.database}${suffix}`, { force: true });
    await rename(temporary, active.database);
    await writeFile(active.paths.envPath, settingsText, { mode: 0o600 });
  } catch (error) {
    throw new Error(
      `Restore failed: ${error.message}. Recovery snapshot: ${safetyBackup ?? snapshot}`,
    );
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(
    "Restored database and settings. Use the matching application version; do not immediately rerun newer migrations.",
  );
}

export async function diagnoseOffice(root, environment = process.env) {
  const active = await activeSettings(root, environment);
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const fingerprint = (value) =>
    value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : null;
  const result = {
    version: pkg.version,
    node: process.version,
    applicationDirectory: root,
    settingsPath: active.paths.envPath,
    databasePath: active.database,
    databaseExists: existsSync(active.database),
    port: Number(environment.PORT ?? active.settings.PORT ?? 4000),
    hookRegistration: "missing",
    hookTokenMatches: false,
    lastHookReceivedAt: null,
    cli: "Supported; verify event delivery",
    desktop: "Hook loading unverified",
    health: "unreachable",
    backups: 0,
  };
  const hookPath = join(
    environment.USERPROFILE ?? environment.HOME ?? "",
    ".copilot",
    "hooks",
    "agent-office.json",
  );
  if (existsSync(hookPath)) {
    const hooks = (await readHookRegistration(hookPath)).hooks;
    const hook = hooks?.sessionStart?.[0];
    const helper = join(root, "apps", "server", "scripts", "local-agent-hook.mjs");
    result.hookRegistration = hook?.command?.includes(`"${helper}"`)
      ? "this installation"
      : "another installation or unknown format";
    result.hookTokenMatches =
      Boolean(active.settings.AGENT_OFFICE_HOOK_TOKEN) &&
      fingerprint(hook?.env?.AGENT_OFFICE_HOOK_TOKEN) ===
        fingerprint(active.settings.AGENT_OFFICE_HOOK_TOKEN);
  }
  const host = active.settings.HOST === "::1" ? "[::1]" : "127.0.0.1";
  try {
    const response = await fetch(`http://${host}:${result.port}/api/v1/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) result.health = `HTTP ${response.status}`;
    else {
      const { data } = await response.json();
      result.health =
        data.application === "copilot-agent-office"
          ? data.healthy
            ? "healthy"
            : "unhealthy"
          : "different application";
      result.lastHookReceivedAt =
        data.provider?.provider === "local" ? data.provider.lastSuccessAt : null;
    }
  } catch (error) {
    result.health = `unreachable (${error.cause?.code ?? error.name})`;
  }
  const backupDirectory = join(active.paths.dataDirectory, "backups");
  if (existsSync(backupDirectory))
    result.backups = (await readdir(backupDirectory, { withFileTypes: true })).filter((item) =>
      item.isDirectory(),
    ).length;
  return result;
}

export async function unregisterHooks(root, environment = process.env) {
  const home = environment.USERPROFILE ?? environment.HOME;
  if (!home) throw new Error("User home directory is unavailable.");
  const hookPath = join(home, ".copilot", "hooks", "agent-office.json");
  if (!existsSync(hookPath)) return false;
  const registration = await readHookRegistration(hookPath);
  const helper = join(root, "apps", "server", "scripts", "local-agent-hook.mjs");
  const entries = Object.values(registration.hooks ?? {}).flat();
  if (
    !entries.length ||
    !entries.every(
      (hook) => typeof hook.command === "string" && hook.command.includes(`"${helper}"`),
    )
  ) {
    console.log(
      "Hook registration belongs to another installation or has been modified; preserved.",
    );
    return false;
  }
  await rm(hookPath);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    switch (process.argv[2]) {
      case "backup":
        await backupOffice(root);
        break;
      case "restore":
        if (!process.argv[3] || process.argv[4] !== "--confirmed")
          throw new Error("Use Restore-Agent-Office.cmd for confirmed restoration.");
        await restoreOffice(root, resolve(process.argv[3]));
        break;
      case "diagnose":
        console.log(JSON.stringify(await diagnoseOffice(root), null, 2));
        break;
      case "unregister":
        await unregisterHooks(root);
        break;
      default:
        throw new Error("Expected backup, restore, diagnose or unregister.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
