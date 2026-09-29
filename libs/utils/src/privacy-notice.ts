/**
 * Where the privacy notice (Aydınlatma Metni, KVKK Art. 10) is published
 * (MDRS-102).
 *
 * landing-web serves it at this path, always in Turkish and outside the
 * locale prefix, so the address never changes. tedris-web and nizam-web link
 * to it from their footer, on another origin, hence the absolute URL. The
 * Keycloak registration form links to the same URL from
 * `config/keycloak/user-profile.json`; `test/privacy-notice.spec.ts` keeps the
 * three in step.
 */
export const PRIVACY_NOTICE_PATH = "/aydinlatma-metni";

export const PRIVACY_NOTICE_URL = `https://medaris.app${PRIVACY_NOTICE_PATH}`;
