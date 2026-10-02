import type { Page } from "@playwright/test";
import { encode, type JWT } from "next-auth/jwt";

/** A Keycloak account the specs sign in as, from E2E_<ROLE>_* variables. */
export interface E2eAccount {
  email?: string;
  password?: string;
}

const KEYCLOAK_ISSUER = process.env.E2E_KEYCLOAK_ISSUER;
const CLIENT_ID = process.env.E2E_KEYCLOAK_CLIENT_ID ?? "tedris-dev";
const CLIENT_SECRET = process.env.E2E_KEYCLOAK_CLIENT_SECRET;
const NEXTAUTH_SECRET = process.env.E2E_NEXTAUTH_SECRET;

/** Whether tokens can be had without the browser sign-in form (see `signIn`). */
export const canUseDirectGrant = Boolean(
  KEYCLOAK_ISSUER && CLIENT_SECRET && NEXTAUTH_SECRET
);

/**
 * A real Keycloak access, id and refresh token for `who` through the direct
 * grant. This is also how a spec calls tedrisat as a second person, and how it
 * signs in on a port the Keycloak client does not list as a redirect address.
 */
export async function directGrant(who: E2eAccount) {
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
 * Signs `page` in as `who`. The Keycloak form is the real path and is used
 * whenever the app runs where the client allows a callback (localhost:4000).
 * With E2E_NEXTAUTH_SECRET and the client secret set it instead obtains the
 * tokens through the direct grant and writes the session cookie NextAuth would
 * have written, for a second instance on another port; the API and the session
 * reading are the real ones either way.
 */
export async function signIn(page: Page, who: E2eAccount): Promise<void> {
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:4000");
  if (canUseDirectGrant && base.port !== "4000") {
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
            ? "tedris.session-token"
            : `tedris.session-token.${index}`,
        value,
        domain: base.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
      }))
    );
    return;
  }
  await page.goto("/tr/auth/signin");
  await page.locator("#username").fill(who.email as string);
  await page.locator("#password").fill(who.password as string);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((url) => url.origin === base.origin);
}

/**
 * Signs in as `e2e-talebe` (E2E_TALEBE_EMAIL and E2E_TALEBE_PASSWORD), the
 * entry point the deck specs use. `E2E_SESSION_COOKIES` names a JSON file of
 * cookies (Playwright `storageState` shape) that replaces the sign-in when set.
 */
export const signInAsTalebe = async (page: Page): Promise<void> => {
  const cookieFile = process.env.E2E_SESSION_COOKIES;
  if (cookieFile) {
    const { readFileSync } = await import("node:fs");
    const { cookies } = JSON.parse(readFileSync(cookieFile, "utf8"));
    await page.context().addCookies(cookies);
    return;
  }
  await signIn(page, {
    email: process.env.E2E_TALEBE_EMAIL,
    password: process.env.E2E_TALEBE_PASSWORD,
  });
};
