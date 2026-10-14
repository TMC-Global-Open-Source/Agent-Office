import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  external: ["@prisma/client"],
  noExternal: ["@agent-office/shared"],
});
