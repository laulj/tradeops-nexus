import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        environment: "node",
        // sqlite3 is a native module — run each test file in its own forked
        // process instead of worker threads.
        pool: "forks",
        include: ["src/**/*.test.ts"],
        testTimeout: 20000,
        hookTimeout: 30000,
        // The suite fires hundreds of requests from one address; the limiter is
        // exercised deliberately in rateLimit.test.ts instead.
        env: { RATE_LIMIT_DISABLED: "1" },
    },
})
