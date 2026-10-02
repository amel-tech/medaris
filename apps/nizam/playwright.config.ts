import { defineConfig, devices } from "@playwright/test";

/**
 * nizam-web's browser e2e (MDRS-169), set up like tedris-web's: real browser,
 * real tedrisat, real Postgres, real Keycloak sign-ins; nothing is mocked and
 * nothing is started. Bring up `tedrisat` and `nizam-web` first
 * (`pnpm nx run tedrisat:dev`, `pnpm nx run nizam-web:dev`) and run
 *
 *   E2E_DATABASE_URL=postgres://… pnpm nx run nizam-web:test:e2e
 *
 * `E2E_BASE_URL` (default http://localhost:4001) points at the web app. The
 * accounts come from E2E_<ROLE>_EMAIL, E2E_<ROLE>_PASSWORD, E2E_<ROLE>_SUB.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4001",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
