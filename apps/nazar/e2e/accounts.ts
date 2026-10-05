import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Browser,
  type BrowserContext,
  test as base,
  type Page,
} from "@playwright/test";
import { encode, type JWT } from "next-auth/jwt";

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

const KEYCLOAK_ISSUER = process.env.E2E_KEYCLOAK_ISSUER;
const CLIENT_ID = process.env.E2E_KEYCLOAK_CLIENT_ID ?? "tedris-dev";
const CLIENT_SECRET = process.env.E2E_KEYCLOAK_CLIENT_SECRET;
const NEXTAUTH_SECRET = process.env.E2E_NEXTAUTH_SECRET;

/**
 * Whether tokens can be had without the browser form, through the direct
 * grant of the client tedris's specs use (E2E_KEYCLOAK_ISSUER,
 * E2E_KEYCLOAK_CLIENT_ID and E2E_KEYCLOAK_CLIENT_SECRET), and a session cookie
 * minted with the app's NextAuth secret (E2E_NEXTAUTH_SECRET).
 */
const canUseDirectGrant = Boolean(
  KEYCLOAK_ISSUER && CLIENT_SECRET && NEXTAUTH_SECRET
);

/** The app runs where nazar's Keycloak client takes no callback: the session is minted. */
const mintsSession = () =>
  canUseDirectGrant &&
  new URL(process.env.E2E_BASE_URL ?? "http://localhost:4002").port !== "4002";

/**
 * A real Keycloak access, id and refresh token for `who` through the direct
 * grant. This is also how a spec calls tedrisat as that person.
 */
export async function directGrant(who: Account) {
  if (!canUseDirectGrant) {
    throw new Error(
      "E2E_KEYCLOAK_ISSUER, E2E_KEYCLOAK_CLIENT_SECRET and E2E_NEXTAUTH_SECRET are needed for the direct grant."
    );
  }
  const res = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET as string,
      username: who.email as string,
      password: who.password as string,
      scope: "openid email profile",
    }),
  });
  if (!res.ok) throw new Error(`Keycloak direct grant answered ${res.status}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    id_token: string;
    expires_in: number;
    refresh_expires_in: number;
  };
}

/**
 * Writes the session cookie NextAuth would have written after a sign-in, from
 * tokens of the direct grant, as tedris's `sign-in.ts` does for an instance on
 * a port its client does not list. The reading of the session and every API
 * call are the real ones. The app cannot refresh these tokens with its own
 * client, so such a session lasts as long as the access token (five minutes on
 * the dev realm) and is never kept across tests.
 */
async function mintSession(page: Page, who: Account): Promise<void> {
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:4002");
  const t = await directGrant(who);
  const claims = JSON.parse(
    Buffer.from(t.access_token.split(".")[1], "base64url").toString()
  ) as { sub: string; name?: string; email?: string };
  const now = Date.now();
  const jwt = await encode({
    secret: NEXTAUTH_SECRET as string,
    token: {
      sub: claims.sub,
      name: claims.name,
      email: claims.email,
      accessToken: t.access_token,
      accessTokenExpired: now + (t.expires_in - 15) * 1000,
      refreshToken: t.refresh_token,
      idToken: t.id_token,
      refreshTokenExpireIn: now + t.refresh_expires_in * 1000,
      ssoCheckedAt: now,
      user: { id: claims.sub, name: claims.name, email: claims.email },
    } as unknown as JWT,
  });
  // NextAuth splits a session cookie that would pass the browser's 4 KB limit
  // into `<name>.0`, `<name>.1`, … and reads them back in order.
  const CHUNK = 3800;
  const pieces =
    jwt.length > CHUNK
      ? (jwt.match(new RegExp(`.{1,${CHUNK}}`, "g")) ?? [])
      : [jwt];
  await page.context().addCookies(
    pieces.map((value, index) => ({
      name:
        pieces.length === 1
          ? "nazar.session-token"
          : `nazar.session-token.${index}`,
      value,
      domain: base.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    }))
  );
}

/**
 * Opens our sign-in page, which sends the browser to Keycloak, and fills its
 * form; on a port nazar's client takes no callback on, mints the session
 * instead (`mintSession`).
 */
export async function signIn(page: Page, who: Account): Promise<void> {
  if (mintsSession()) return mintSession(page, who);
  await page.goto("/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  const here = new URL(process.env.E2E_BASE_URL ?? "http://localhost:4002")
    .origin;
  // `/` answers with a client-side redirect, so it is not where the sign-in ends
  await page.waitForURL(
    (url) =>
      url.origin === here &&
      url.pathname !== "/" &&
      !url.pathname.startsWith("/auth/") &&
      !url.pathname.startsWith("/api/auth/"),
    // "load" waits for every font and chunk of a `next dev` page, which on a
    // loaded machine is longer than the sign-in is worth
    { timeout: 60_000, waitUntil: "domcontentloaded" }
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
    directory = mkdtempSync(join(tmpdir(), "nazar-e2e-"));
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
  // a minted session cannot be refreshed by the app: it is made afresh each time
  const kept = mintsSession() ? undefined : states.get(role);
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
