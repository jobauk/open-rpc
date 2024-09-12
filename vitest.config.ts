import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    typecheck: {
      include: ["tests/*.test-d.ts"],
      enabled: true,
      tsconfig: "./tsconfig.test.json",
    },
  },
});
