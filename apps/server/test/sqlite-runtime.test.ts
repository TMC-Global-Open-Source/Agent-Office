import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

it("survives allocation-driven collection of native SQLite handles", () => {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("better-sqlite3");
  const script = `
    const Database = require(${JSON.stringify(entry)});
    let rows = 0;
    let allocations = [];
    for (let cycle = 0; cycle < 2000; cycle++) {
      const database = new Database(':memory:');
      try {
        for (let statement = 0; statement < 20; statement++) {
          rows += database.prepare('SELECT 1 AS value').get().value;
          allocations.push({ padding: 'x'.repeat(1024), cycle, statement });
        }
      } finally {
        database.close();
      }
      if (allocations.length > 500) allocations = [];
    }
    if (rows !== 40000) throw new Error('SQLite queries did not complete.');
    console.log('SQLite handle cleanup completed: ' + rows);
  `;
  const result = spawnSync(process.execPath, ["--max-semi-space-size=1", "-e", script], {
    encoding: "utf8",
    timeout: 45_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal, result.stderr).toBeNull();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("SQLite handle cleanup completed: 40000");
}, 60_000);
