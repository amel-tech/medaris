import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/**
 * Signs the page's browser context in as `e2e-talebe` (E2E_TALEBE_EMAIL and
 * E2E_TALEBE_PASSWORD) through Keycloak's own form, as the other specs do.
 *
 * `E2E_SESSION_COOKIES` names a JSON file of cookies (the shape Playwright's
 * `storageState` writes) and, when set, replaces the form: the app is then
 * running on a port the shared Keycloak client has no redirect URI for, so a
 * session is minted from a direct grant instead. The cookies are what the form
 * would have left behind; nothing else changes.
 */
export const signInAsTalebe = async (page: Page): Promise<void> => {
  const cookieFile = process.env.E2E_SESSION_COOKIES;
  if (cookieFile) {
    const { cookies } = JSON.parse(readFileSync(cookieFile, "utf8"));
    await page.context().addCookies(cookies);
    return;
  }
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:4000");
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(process.env.E2E_TALEBE_EMAIL as string);
  await page
    .locator("#password")
    .fill(process.env.E2E_TALEBE_PASSWORD as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(new RegExp(base.host.replace(".", "\\.")));
};
