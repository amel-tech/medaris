import { env } from "~/env";

// Where the landing page sends a visitor into tedris (MDRS-151). The pages are
// static, so they link to the landing's own redirect routes (/giris, /kayit,
// /tedris/…) and only those routes read TEDRIS_URL, at request time: one
// image serves every environment.

/** The tedris page a visitor signs in to; a signed-out visitor is sent to Keycloak. */
export const signInPath = "learning";

/**
 * Registration. Until tedris has an entry that asks Keycloak for its
 * registration form (`prompt=create`, MDRS-101), "Kayıt ol" takes the sign-in
 * path; Keycloak's sign-in page links to registration.
 */
export const registerPath = signInPath;

/** Where the sample köşk and ders cards lead until tedris has public lists (MDRS-122). */
export const exploreHref = "/tedris/learning";

export function redirectToTedris(path: string): Response {
  if (!env.TEDRIS_URL) {
    // A missing origin is a deployment error. Say so instead of sending the
    // visitor somewhere that only looks right.
    console.error("TEDRIS_URL is not set; landing cannot redirect into tedris");
    return new Response("TEDRIS_URL is not configured.", { status: 500 });
  }
  const target = new URL(`/tr/${path.replace(/^\/+/, "")}`, env.TEDRIS_URL);
  return Response.redirect(target, 307);
}
