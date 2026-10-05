import { defineConfig, devices } from "@playwright/test";

/**
 * tedris-web's browser e2e (MDRS-157), the first in the repo. Real browser, real
 * tedrisat, real Postgres: nothing is mocked. It does not start anything — bring
 * up `tedrisat` and `tedris-web` first (`pnpm nx run tedrisat:dev`,
 * `pnpm nx run tedris-web:dev`) and run it with
 *
 *   E2E_DATABASE_URL=postgres://… pnpm nx run tedris-web:test:e2e
 *
 * `E2E_BASE_URL` (default http://localhost:4000) points at the web app. The
 * specs seed through `E2E_DATABASE_URL`, the database tedrisat itself uses,
 * under their own random ids, and remove what they added.
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
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
