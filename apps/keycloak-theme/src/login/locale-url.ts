/**
 * `url` with Keycloak's `kc_locale` set to the page's language (MDRS-274).
 *
 * The app starts sign-in with `ui_locales` (and `kc_locale`), but the links
 * between the login and register forms are Keycloak's own `url.loginUrl` and
 * `url.registrationUrl`, which carry neither. When the auth session's hint is
 * gone, Keycloak picks the language again from its cookie or the realm default
 * (`tr`), so an English or Arabic visitor could land on a Turkish form.
 * `kc_locale` is the explicit choice Keycloak honours before all of those.
 */
export const withKcLocale = (
  url: string,
  languageTag: string | undefined
): string => {
  if (!languageTag) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  parsed.searchParams.set("kc_locale", languageTag);
  return parsed.toString();
};
