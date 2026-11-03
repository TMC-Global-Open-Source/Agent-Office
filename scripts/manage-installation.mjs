import { constants, realpathSync } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defaultDataDirectory, resolveDatabaseUrl, resolveOfficePaths } from "./office-paths.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function assertPortAvailable(settings, environment = process.env) {
  const port = Number(environment.PORT ?? settings.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be between 1 and 65535.");
  }
  const bindHost = environment.HOST ?? settings.HOST ?? "127.0.0.1";
  const host = ["0.0.0.0", "::", "[::]"].includes(bindHost) ? "127.0.0.1" : bindHost;
  await new Promise((resolve, reject) => {
    const socket = createConnection({ port, host });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Could not verify the configured port. Check HOST and PORT before setup."));
    }, 2000);
    socket.once("connect", () => {
      socket.destroy();
      clearTimeout(timer);
      reject(
        new Error(
          "The configured port is in use. Stop that server before setup changes the database.",
        ),
      );
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      if (error.code === "ECONNREFUSED") resolve();
      else
        reject(
          new Error(`Could not verify the configured port (${error.code}). Check HOST and PORT.`),
        );
    });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return false;
  }
}

export async function prepareInstallation(installationRoot, environment = process.env) {
  const paths = resolveOfficePaths(installationRoot, environment);
  const dataDirectory = resolve(
    environment.AGENT_OFFICE_DATA_DIR ??
      paths.installation?.dataDirectory ??
      defaultDataDirectory(environment),
  );
  const envPath = join(dataDirectory, ".env");
  const legacyEnvPath = join(installationRoot, ".env");
  const legacyExists = await exists(legacyEnvPath);
  const targetExists = await exists(envPath);
  if (
    !legacyExists &&
    !paths.installation &&
    !targetExists &&
    (await exists(join(installationRoot, "apps", "server", "prisma", "dev.db")))
  ) {
    throw new Error(
      "An existing database was found without its .env. Restore the original settings before migrating; no empty replacement was created.",
    );
  }
  const relativeDirectory = relative(installationRoot, dataDirectory);
  if (
    !isAbsolute(relativeDirectory) &&
    relativeDirectory !== ".." &&
    !relativeDirectory.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error("Choose a data directory outside the application folder.");
  }
  if (
    legacyExists &&
    targetExists &&
    !paths.installation &&
    environment.AGENT_OFFICE_USE_EXISTING_DATA !== "true"
  ) {
    throw new Error(
      "Both legacy and per-user settings exist. Nothing was overwritten. Use -UseExistingData to reuse per-user data, or -DataDirectory with a new absolute path to migrate this installation separately.",
    );
  }
  await mkdir(dataDirectory, { recursive: true });
  if (!targetExists) {
    const sourceEnvPath = paths.installation
      ? join(paths.installation.dataDirectory, ".env")
      : legacyEnvPath;
    const importing = Boolean(paths.installation) || legacyExists;
    let text = await readFile(
      importing ? sourceEnvPath : join(installationRoot, ".env.example"),
      "utf8",
    );
    let databaseQuery = "";
    if (importing) {
      const settings = parse(text);
      const sourceUrl = resolveDatabaseUrl(
        settings.DATABASE_URL ?? "file:./dev.db",
        paths.installation?.dataDirectory ?? join(installationRoot, "apps", "server", "prisma"),
      );
      const queryIndex = sourceUrl.indexOf("?");
      databaseQuery = queryIndex === -1 ? "" : sourceUrl.slice(queryIndex);
      const source = sourceUrl.slice(5, queryIndex === -1 ? undefined : queryIndex);
      const destination = join(dataDirectory, "dev.db");
      if (await exists(destination)) {
        throw new Error(
          "The destination already contains dev.db without settings. Choose another -DataDirectory; no database was overwritten.",
        );
      }
      if (await exists(source)) {
        // SQLite backup includes committed WAL data without copying an inconsistent live file.
        const { default: Database } = await import("better-sqlite3");
        const database = new Database(source, { readonly: true, fileMustExist: true });
        const temporary = join(dataDirectory, `dev.db.${process.pid}.migrating`);
        try {
          await database.backup(temporary);
          await copyFile(temporary, destination, constants.COPYFILE_EXCL);
        } finally {
          database.close();
          await rm(temporary, { force: true });
        }
        console.log("Copied the existing SQLite database; the original is unchanged.");
      } else {
        throw new Error(
          "The existing legacy database is missing. Restore the database referenced by the source .env before migrating, or use a clean source folder for a new installation.",
        );
      }
    }
    text = text.replace(/^\s*DATABASE_URL\s*=.*$/m, `DATABASE_URL=file:./dev.db${databaseQuery}`);
    if (!/^DATABASE_URL=/m.test(text)) text += `\nDATABASE_URL=file:./dev.db${databaseQuery}\n`;
    await writeFile(envPath, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
    console.log(
      importing
        ? "Copied existing settings; the original .env is unchanged."
        : "Created per-user settings.",
    );
  }
  const settings = parse(await readFile(envPath, "utf8"));
  const database = resolveDatabaseUrl(settings.DATABASE_URL ?? "file:./dev.db", dataDirectory)
    .slice(5)
    .split("?")[0];
  if (targetExists && paths.installation?.initialized && !(await exists(database))) {
    throw new Error(
      "The installed database is missing. Restore it from backup before repair; no empty replacement was created.",
    );
  }
  if (resolve(dirname(database)) !== resolve(dataDirectory)) {
    console.warn(
      "Warning: DATABASE_URL points outside the data folder. Back up that database separately before moving computers.",
    );
  }
  await mkdir(dirname(paths.manifestPath), { recursive: true });
  const manifest = {
    dataDirectory,
    installationRoot,
    nodePath: realpathSync(process.execPath),
    initialized: paths.installation?.initialized ?? false,
  };
  const temporary = `${paths.manifestPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, paths.manifestPath);
  console.log(`Settings and data: ${dataDirectory}`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "prepare") {
      await prepareInstallation(root);
    } else if (process.argv[2] === "check-port") {
      const { envPath } = resolveOfficePaths(root);
      await assertPortAvailable(parse(await readFile(envPath, "utf8")));
    } else if (process.argv[2] === "complete") {
      const { installation, manifestPath } = resolveOfficePaths(root);
      if (!installation) throw new Error("Installation metadata is missing. Run repair again.");
      const temporary = `${manifestPath}.${process.pid}.tmp`;
      await writeFile(
        temporary,
        `${JSON.stringify({ ...installation, initialized: true }, null, 2)}\n`,
        "utf8",
      );
      await rename(temporary, manifestPath);
    } else if (process.argv[2] === "paths") {
      const paths = resolveOfficePaths(root);
      const parsed = (await exists(paths.envPath))
        ? parse(await readFile(paths.envPath, "utf8"))
        : {};
      const settings = {};
      for (const name of ["HOST", "PORT", "WEB_PORT", "AGENT_PROVIDER"]) {
        const value = process.env[name] ?? parsed[name];
        if (value !== undefined) settings[name] = value;
      }
      console.log(JSON.stringify({ ...paths, settings }));
    } else {
      throw new Error("Expected prepare, check-port, complete or paths.");
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
