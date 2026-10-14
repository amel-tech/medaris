/**
 * "Bağlı uygulamalar" on Hesap (owner, 2026-10-14): Keycloak's account console
 * page that lists the applications a person signed in to with their Medaris
 * account and lets them revoke the consent they gave. `issuer` is
 * KEYCLOAK_ISSUER (e.g. `https://auth.medaris.app/realms/medaris`), read on
 * the server at request time and handed down as a prop (MDRS-86).
 */
export const connectedAppsHref = (issuer: string): string =>
  `${issuer.replace(/\/+$/, "")}/account/applications`;
