import { defineConfig, devices } from "@playwright/test";

/**
 * nazar-web's browser e2e (MDRS-183), set up like nizam-web's: real browser,
 * real tedrisat, real Postgres, real Keycloak sign-ins; nothing is mocked and
 * nothing is started. Bring up `tedrisat` and `nazar-web` first
 * (`pnpm nx run tedrisat:dev`, `pnpm nx run nazar-web:dev`) and run
 *
 *   E2E_DATABASE_URL=postgres://… pnpm nx run nazar-web:test:e2e
 *
 * `E2E_BASE_URL` (default http://localhost:4002) points at the web app. The
 * accounts come from E2E_<ROLE>_EMAIL, E2E_<ROLE>_PASSWORD, E2E_<ROLE>_SUB.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  // A spec signs in first, through the real Keycloak form, and the machine that
  // runs it is often busy with something else: 30 s (the default) is too short for
  // a sign-in and what follows it, and a timeout is no verdict on the change.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4002",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
