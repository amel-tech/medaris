/**
 * Nazar's one locale: Turkish only at launch (canvas rule 3), so there is no
 * `[locale]` segment and nothing to negotiate. next-intl's request config
 * reads it, and so does every trip to Keycloak, whose sign-in and sign-out
 * pages open in it (`ui_locales` and `kc_locale`, MDRS-274, MDRS-222).
 */
export const LOCALE = "tr";
