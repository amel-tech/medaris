/**
 * Landing's way into tedris registration and sign-in (MDRS-101).
 *
 * The page links to its own `/api/tedris/<intent>` route, which redirects to
 * tedris-web's `/<locale>/auth/<register|signin>` page; that page starts the
 * Keycloak round trip at once, so a visitor reaches Keycloak's registration
 * form in one click. The hop exists because tedris's origin is server-side
 * configuration (`TEDRIS_APP_URL`, read per request) while the landing page
 * itself is rendered at build time.
 */
export const TEDRIS_INTENTS = ["register", "signin"] as const;
export type TedrisIntent = (typeof TEDRIS_INTENTS)[number];

export const isTedrisIntent = (value: string): value is TedrisIntent =>
  (TEDRIS_INTENTS as readonly string[]).includes(value);

/** The link landing renders. Same-origin, so it needs no configuration. */
export const landingEntryHref = (intent: TedrisIntent, locale: string) =>
  `/api/tedris/${intent}?${new URLSearchParams({ locale }).toString()}`;

/** Where that link ends: the tedris page that opens the Keycloak form. */
export const tedrisEntryUrl = (
  tedrisAppUrl: string,
  intent: TedrisIntent,
  locale: string
): string => {
  const base = new URL(tedrisAppUrl);
  const prefix = base.pathname.replace(/\/+$/, "");
  return new URL(
    `${prefix}/${encodeURIComponent(locale)}/auth/${intent}`,
    base
  ).toString();
};
