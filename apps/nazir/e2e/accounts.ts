import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Browser,
  type BrowserContext,
  test as base,
  type Page,
} from "@playwright/test";

/**
 * The Keycloak accounts the specs sign in with, from the environment only:
 * E2E_<ROLE>_EMAIL, E2E_<ROLE>_PASSWORD and E2E_<ROLE>_SUB, where ROLE is one
 * of TALEBE, MUDERRIS, MEDRESE_BASMUDERRIS, MEDRESE_NAZIR, DERS_NAZIR,
 * SISTEM_ADMIN. A spec whose account is missing is skipped. Nothing here, and
 * nothing in a spec, holds a credential.
 */
export interface Account {
  email?: string;
  password?: string;
  sub?: string;
}

export const account = (role: string): Account => ({
  email: process.env[`E2E_${role}_EMAIL`],
  password: process.env[`E2E_${role}_PASSWORD`],
  sub: process.env[`E2E_${role}_SUB`],
});

/** Whether a spec can sign this role in. */
export const canSignIn = (who: Account): boolean =>
  Boolean(who.email && who.password);

/** Opens our sign-in page, which sends the browser to Keycloak, and fills its form. */
export async function signIn(page: Page, who: Account): Promise<void> {
  await page.goto("/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  const here = new URL(process.env.E2E_BASE_URL ?? "http://localhost:4002")
    .origin;
  await page.waitForURL(
    (url) => url.origin === here && !url.pathname.startsWith("/auth/"),
    { timeout: 30_000 }
  );
}

/**
 * A signed-in page per role, the sign-in done once. The shared realm locks an
 * account out after repeated failures and every sign-in is a round trip, so a
 * role signs in the first time a spec asks and the cookies are kept for the
 * rest of the run, in a directory of their own that is removed afterwards.
 */
let directory: string | undefined;
const states = new Map<string, string>();

/** Made when the first role signs in, removed when the run ends, whichever spec file was last. */
function stateDirectory(): string {
  if (!directory) {
    directory = mkdtempSync(join(tmpdir(), "nazir-e2e-"));
    process.once("exit", () => {
      if (directory) rmSync(directory, { recursive: true, force: true });
    });
  }
  return directory;
}

async function stateOf(
  browser: Browser,
  role: string,
  baseURL: string | undefined
): Promise<string> {
  const kept = states.get(role);
  if (kept) return kept;
  const context = await browser.newContext({ baseURL });
  try {
    await signIn(await context.newPage(), account(role));
    const file = join(stateDirectory(), `${role}.json`);
    await context.storageState({ path: file });
    states.set(role, file);
    return file;
  } finally {
    await context.close();
  }
}

export const test = base.extend<{ as: (role: string) => Promise<Page> }>({
  as: async ({ browser, baseURL }, use) => {
    const opened: BrowserContext[] = [];
    await use(async (role) => {
      const context = await browser.newContext({
        baseURL,
        storageState: await stateOf(browser, role, baseURL),
      });
      opened.push(context);
      return context.newPage();
    });
    await Promise.all(opened.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";
