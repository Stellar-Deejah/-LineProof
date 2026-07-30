import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 55,
        statements: 65,
      },
    },
  },
});
