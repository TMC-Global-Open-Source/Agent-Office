import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), "../.."), "");
  const host = process.env.HOST ?? env.HOST ?? "127.0.0.1";
  const port = Number(process.env.E2E_API_PORT ?? process.env.PORT ?? env.PORT ?? 4000);
  const webPort = Number(process.env.E2E_WEB_PORT ?? process.env.WEB_PORT ?? env.WEB_PORT ?? 5173);
  return {
    plugins: [react()],
    envDir: resolve(process.cwd(), "../.."),
    server: {
      host: env.HOST ?? "127.0.0.1",
      port: webPort,
      proxy: {
        "/api": `http://${host}:${port}`,
        "/socket.io": { target: `http://${host}:${port}`, ws: true },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/testSetup.ts",
      globals: true,
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("/three/") || id.includes("\\three\\")) return "three";
            if (id.includes("@react-three")) return "react-three";
            if (id.includes("react-dom") || id.includes("/react/")) return "react";
            return "vendor";
          },
        },
      },
    },
  };
});
