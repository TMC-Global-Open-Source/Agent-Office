import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function isReleaseFile(path) {
  const parts = path.split("/");
  if (!path || parts.some((part) => part === ".." || part === "") || path.startsWith("/"))
    return false;
  if (
    parts.some((part) =>
      ["node_modules", "dist", ".git", ".agent-office", "coverage", "releases"].includes(part),
    )
  )
    return false;
  if (parts.some((part) => part.startsWith(".env") && part !== ".env.example")) return false;
  if (/\.(db(?:-wal|-shm|-journal)?|env|log|pem|key|pfx|zip)$/i.test(path)) return false;
  return (
    ["apps", "packages", "scripts", "docs"].includes(parts[0]) ||
    (parts.length === 1 &&
      ([
        ".env.example",
        ".gitignore",
        ".dockerignore",
        ".prettierrc.json",
        "Dockerfile",
        "LICENSE",
        "README.md",
        "CONTRIBUTING.md",
        "CHANGELOG.md",
        "THIRD-PARTY-NOTICES.md",
        "docker-compose.yml",
        "eslint.config.js",
        "package.json",
        "package-lock.json",
        "tsconfig.base.json",
      ].includes(path) ||
        /^[A-Za-z-]+-Agent-Office\.cmd$/.test(path)))
  );
}

export async function prepareRelease(root, destination) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(pkg.version))
    throw new Error("A valid release version is required.");
  // Only version-controlled files can enter a release; local credentials/state are never discovered.
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(isReleaseFile);
  for (const required of [
    "LICENSE",
    "README.md",
    "package-lock.json",
    "Install-Agent-Office.cmd",
  ]) {
    if (!files.includes(required)) throw new Error(`Missing tracked release file: ${required}`);
  }
  await mkdir(destination, { recursive: false });
  for (const path of files) {
    const target = join(destination, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, ...path.split("/")), target);
  }
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  const dependencies = Object.entries(lock.packages)
    .filter(([path, entry]) => path.includes("node_modules/") && !entry.link)
    .map(([path, entry]) => ({
      path,
      version: entry.version,
      license: entry.license ?? "Not declared in lockfile; inspect upstream package",
      integrity: entry.integrity,
      resolved: entry.resolved,
    }));
  await writeFile(
    join(destination, "DEPENDENCIES.json"),
    JSON.stringify({ version: pkg.version, dependencies }, null, 2) + "\n",
  );
  await writeFile(
    join(destination, "release.json"),
    JSON.stringify(
      {
        version: pkg.version,
        commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        distribution: "source-only technical preview",
      },
      null,
      2,
    ) + "\n",
  );
  return pkg.version;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
    if (!process.argv[2]) throw new Error("Provide an empty staging directory path.");
    console.log(await prepareRelease(root, resolve(process.argv[2])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
