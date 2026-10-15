/**
 * The partner registry (partner enrollments): which partner applications the
 * platform works with, whether each is enabled, and the köşks each works
 * with. The başnazım keeps it in nizam ("Ortak uygulamalar",
 * `platform.partner_manage`); until this, `INTEGRATION_PARTNERS` was the
 * whole registry, and the boot now only seeds the table from it.
 */

/** A registered partner application, as the guards and the verifier read it. */
export interface IRegisteredPartner {
  /** Its Keycloak client id: what its tokens carry in `azp`. */
  clientId: string;
  /** What nazar, nizam and the audit log call it. */
  name: string;
  /** A disabled partner is refused on `/integrations/*` with 403. */
  enabled: boolean;
}

/** Longest display name, as `integration_partners_name_length` holds it. */
export const PARTNER_NAME_MAX = 100;

/** The audit rows of the registry's writes. */
export const PARTNER_CREATE_ACTION = "integration_partner.create";
export const PARTNER_RENAME_ACTION = "integration_partner.rename";
export const PARTNER_ENABLE_ACTION = "integration_partner.enable";
export const PARTNER_DISABLE_ACTION = "integration_partner.disable";
export const PARTNER_KOSK_BIND_ACTION = "integration_partner.kosk_bind";
export const PARTNER_KOSK_UNBIND_ACTION = "integration_partner.kosk_unbind";

/**
 * The actor of the audit rows the boot writes when it seeds the registry from
 * `INTEGRATION_PARTNERS`: nobody acted, and `audit_log.actor_id` is a uuid
 * that may not be null. No row of `users` has it, so the audit page names no
 * one; the row's details say `seededFrom`.
 */
export const BOOT_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

/** How long the registry is read from memory before it is read again. */
export const PARTNER_REGISTRY_TTL_MS = 60_000;
