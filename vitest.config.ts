import { defineConfig } from "vitest/config";

// Config propia para no cargar los plugins de React Router y Cloudflare en los tests.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["app/**/*.test.ts", "scripts/**/*.test.ts"] },
});
