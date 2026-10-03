import { defineConfig, devices } from "@playwright/test";

/**
 * keycloak-theme's browser e2e (MDRS-155): the sign-in pages in a real
 * Chromium, rendered by Storybook from the same `KcPage` Keycloak serves.
 * That is a real browser and the real components and CSS, but not a real
 * Keycloak: the POST to `url.loginAction` and the realm's own checks need the
 * theme JAR deployed into a Keycloak, which this suite does not do (see
 * `docs/migration/mdrs-155-giris-keycloak.md`). The form posts are asserted at
 * the request the browser would send.
 *
 *   pnpm nx run keycloak-theme:test:e2e
 *
 * Starts Storybook on E2E_STORYBOOK_PORT (default 6016), or reuses one that is
 * already there.
 */
const port = Number(process.env.E2E_STORYBOOK_PORT ?? 6016);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec storybook dev -p ${port} --ci --no-open`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
