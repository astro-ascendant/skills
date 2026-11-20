import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,mjs}"],
    pool: "threads",
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
