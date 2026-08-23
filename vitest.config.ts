import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "demo/target-app/test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@afr/recorder/schema": resolve("packages/recorder/src/schema.ts"),
      "@afr/recorder": resolve("packages/recorder/src/index.ts"),
      "@afr/enricher": resolve("packages/enricher/src/index.ts"),
      "@afr/incident": resolve("packages/incident/src/index.ts"),
    },
  },
});
