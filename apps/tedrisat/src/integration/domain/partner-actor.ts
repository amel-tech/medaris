/**
 * How an audit row names a partner application as the one who acted.
 *
 * `audit_log.actor_id` is a uuid with no foreign key, as every user column
 * is. A partner's calls carry the subject of its service account, a Keycloak
 * user id (a uuid) that no row of `users` describes: tedrisat never records a
 * service account as a person. So the row says who it is in its details,
 * `details.partner = { clientId, name }`, and the audit page and "Erişimi
 * kaldırılanlar" fall back to that name where `users` has none.
 */
export interface IPartnerActor {
  /** The partner's Keycloak client id (`azp`). */
  clientId: string;
  /** Its display name in the registry (`integration_partners.name`). */
  name: string;
}

/** The details that name the partner on an audit row it caused. */
export const partnerActorDetails = (
  partner: IPartnerActor
): { partner: IPartnerActor } => ({
  partner: { clientId: partner.clientId, name: partner.name },
});

/** The partner's name an audit row's details carry, or null; details are free-form. */
export function partnerActorName(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const partner = (details as { partner?: unknown }).partner;
  if (typeof partner !== "object" || partner === null) return null;
  const name = (partner as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
