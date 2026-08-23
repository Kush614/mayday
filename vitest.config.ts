import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "demo/target-app/test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@mayday/recorder/schema": resolve("packages/recorder/src/schema.ts"),
      "@mayday/recorder": resolve("packages/recorder/src/index.ts"),
      "@mayday/enricher": resolve("packages/enricher/src/index.ts"),
      "@mayday/incident": resolve("packages/incident/src/index.ts"),
    },
  },
});
