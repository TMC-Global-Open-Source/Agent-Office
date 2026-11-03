import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { config } from "dotenv";

export function resolveOfficePaths(root, environment = process.env) {
  const manifestPath = join(root, ".agent-office", "installation.json");
  let installation;
  if (existsSync(manifestPath)) {
    installation = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
    if (typeof installation.dataDirectory !== "string" || !isAbsolute(installation.dataDirectory)) {
      throw new Error("Invalid installation data directory. Run Repair-Agent-Office.cmd.");
    }
  }
  const configuredDirectory = environment.AGENT_OFFICE_DATA_DIR ?? installation?.dataDirectory;
  if (configuredDirectory && !isAbsolute(configuredDirectory)) {
    throw new Error("AGENT_OFFICE_DATA_DIR must be an absolute path.");
  }
  const legacy = !configuredDirectory && existsSync(join(root, ".env"));
  const dataDirectory = configuredDirectory ?? (legacy ? root : defaultDataDirectory(environment));
  return {
    dataDirectory,
    envPath: join(dataDirectory, ".env"),
    databaseDirectory: legacy ? join(root, "apps", "server", "prisma") : dataDirectory,
    manifestPath,
    legacy,
    installation,
  };
}

export function defaultDataDirectory(environment = process.env) {
  return join(
    environment.LOCALAPPDATA ??
      (process.platform === "win32"
        ? join(homedir(), "AppData", "Local")
        : (environment.XDG_DATA_HOME ?? join(homedir(), ".local", "share"))),
    "AgentOffice",
  );
}

export function resolveDatabaseUrl(url, databaseDirectory) {
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a SQLite file: path.");
  }
  const queryIndex = url.indexOf("?");
  const path = url.slice(5, queryIndex === -1 ? undefined : queryIndex);
  const query = queryIndex === -1 ? "" : url.slice(queryIndex);
  if (!path) throw new Error("DATABASE_URL must specify a database file.");
  return `file:${resolve(databaseDirectory, path).replaceAll("\\", "/")}${query}`;
}

export function loadOfficeEnvironment(root) {
  const paths = resolveOfficePaths(root);
  config({ path: paths.envPath });
  // Explicit test/development database overrides retain Prisma's schema-relative semantics.
  const databaseDirectory =
    process.env.NODE_ENV === "test"
      ? join(root, "apps", "server", "prisma")
      : paths.databaseDirectory;
  process.env.DATABASE_URL = resolveDatabaseUrl(
    process.env.DATABASE_URL ?? "file:./dev.db",
    databaseDirectory,
  );
  return paths;
}
