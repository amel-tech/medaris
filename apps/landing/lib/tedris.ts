import { env } from "~/env";
import { landingEntryHref } from "~/lib/tedris-entry";

// Where the landing page sends a visitor into tedris (MDRS-151, MDRS-101). The
// pages are static, so they link to landing's own routes and only those read
// TEDRIS_APP_URL, at request time: one image serves every environment.
//
// "Giriş yap" and "Kayıt ol" use MDRS-101's /api/tedris/<intent> route, which
// opens Keycloak's sign-in or registration form in one click.

/** The default locale of tedris-web, which every landing page sends visitors to. */
const TEDRIS_LOCALE = "tr";

export const signInHref = landingEntryHref("signin", TEDRIS_LOCALE);
export const registerHref = landingEntryHref("register", TEDRIS_LOCALE);

/** Keşfet, which tedris opens to a signed-out visitor. Redirected per request by app/tedris. */
export const exploreHref = "/tedris/discover";

export function redirectToTedris(path: string): Response {
  if (!env.TEDRIS_APP_URL) {
    // A missing origin is a deployment error. Say so instead of sending the
    // visitor somewhere that only looks right (503, as /api/tedris/<intent>).
    return new Response("TEDRIS_APP_URL is not configured", { status: 503 });
  }
  const base = new URL(env.TEDRIS_APP_URL);
  const prefix = base.pathname.replace(/\/+$/, "");
  const target = new URL(
    `${prefix}/${TEDRIS_LOCALE}/${path.replace(/^\/+/, "")}`,
    base
  );
  return Response.redirect(target, 307);
}
