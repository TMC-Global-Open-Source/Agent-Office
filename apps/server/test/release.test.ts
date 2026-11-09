import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { isReleaseFile, prepareRelease } from "../../../scripts/prepare-release.mjs";

it("excludes secrets, generated assets, database sidecars and runtime state", () => {
  for (const path of [
    ".env",
    ".env.production",
    "docs/settings.env",
    "../private",
    ".git/config",
    ".agent-office/server.json",
    "apps/server/prisma/dev.db",
    "apps/server/prisma/dev.db-wal",
    "apps/web/dist/index.html",
    "node_modules/test/index.js",
    "docs/token.key",
    "releases/old.zip",
  ]) {
    expect(isReleaseFile(path), path).toBe(false);
  }
  for (const path of [
    ".env.example",
    "LICENSE",
    "Install-Agent-Office.cmd",
    "Uninstall-Agent-Office.cmd",
    "scripts/office-paths.mjs",
    "apps/server/prisma/schema.prisma",
  ]) {
    expect(isReleaseFile(path), path).toBe(true);
  }
});

it.skipIf(!existsSync(fileURLToPath(new URL("../../../.git", import.meta.url))))(
  "stages an installable source release with legal files and a pinned dependency inventory",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "office-release-"));
    try {
      const root = fileURLToPath(new URL("../../..", import.meta.url));
      const destination = join(directory, "staged");
      const version = await prepareRelease(root, destination);
      const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      expect(version).toBe(pkg.version);
      const files = await readdir(destination);
      expect(files).toEqual(
        expect.arrayContaining([
          ".env.example",
          "LICENSE",
          "THIRD-PARTY-NOTICES.md",
          "DEPENDENCIES.json",
          "Install-Agent-Office.cmd",
          "Uninstall-Agent-Office.cmd",
        ]),
      );
      expect(files).not.toContain("node_modules");
      expect(files).not.toContain(".env");
      const inventory = JSON.parse(await readFile(join(destination, "DEPENDENCIES.json"), "utf8"));
      expect(
        inventory.dependencies.some(
          (item: { path: string; version: string }) =>
            item.path.endsWith("node_modules/better-sqlite3") && item.version === "13.0.3",
        ),
      ).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
