import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // PGlite's first boot per file takes a few seconds when many files run in
  // parallel; the default 5s timeout made the first DB test per file flaky.
  test: { globals: true, environment: "node", testTimeout: 30_000 },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
