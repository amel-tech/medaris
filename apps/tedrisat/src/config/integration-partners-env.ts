/** A partner application whose registrations become course enrollments. */
export interface IIntegrationPartner {
  /** Its Keycloak client id: what its tokens carry in `azp`. */
  clientId: string;
  /** What nazar and the audit log call it, e.g. "Örnek Uygulama". */
  name: string;
}

/**
 * Keycloak client ids are free-form, but these end up in a URL path segment
 * (`DELETE /courses/:id/partner-codes/:partner/:code`) and in `azp`; letters,
 * digits, `.`, `_` and `-` are what every client of the realm uses.
 */
export const PARTNER_CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_NAME_LENGTH = 100;

/**
 * The partner applications allowed to call `/integrations/*`
 * (`INTEGRATION_PARTNERS`): comma-separated `clientId=Display name` pairs, as
 * in `ornek-uygulama=Örnek Uygulama`. A display name therefore holds no comma.
 *
 * Optional on purpose: empty or unset, the list is empty and every
 * `/integrations/*` route answers 404, so nothing changes for a deployment
 * that has no partner. A value that is set but malformed is a typo, so it
 * stops the boot rather than quietly dropping a partner.
 *
 * A partner client is never one of the front-ends: its tokens carry this
 * API's audience but belong on the partner routes alone. Listing one in
 * `KEYCLOAK_ALLOWED_CLIENTS` as well stops the boot (the verifier would refuse
 * the pair too; this names the two keys).
 *
 * Set as `TEDRISAT__INTEGRATION_PARTNERS` in the repository-root `.env`; MDRS-25
 * strips the prefix on the way in.
 */
export function readIntegrationPartners(
  env: NodeJS.ProcessEnv
): IIntegrationPartner[] {
  const raw = env.INTEGRATION_PARTNERS?.trim();
  if (!raw) return [];

  const partners: IIntegrationPartner[] = [];
  for (const entry of raw.split(",")) {
    const pair = entry.trim();
    if (!pair) continue;
    const at = pair.indexOf("=");
    if (at < 0) fail(raw, `"${pair}" is not clientId=Display name`);
    const clientId = pair.slice(0, at).trim();
    const name = pair.slice(at + 1).trim();
    if (!PARTNER_CLIENT_ID_PATTERN.test(clientId)) {
      fail(raw, `"${clientId}" is not a client id`);
    }
    if (!name || name.length > MAX_NAME_LENGTH) {
      fail(
        raw,
        `the display name of "${clientId}" is empty or longer than ${MAX_NAME_LENGTH} characters`
      );
    }
    if (partners.some((partner) => partner.clientId === clientId)) {
      fail(raw, `"${clientId}" is listed twice`);
    }
    partners.push({ clientId, name });
  }

  const allowed = (env.KEYCLOAK_ALLOWED_CLIENTS ?? "")
    .split(",")
    .map((client) => client.trim());
  const front = partners.filter((partner) =>
    allowed.includes(partner.clientId)
  );
  if (front.length > 0) {
    fail(
      raw,
      `"${front.map((partner) => partner.clientId).join('", "')}" is also in KEYCLOAK_ALLOWED_CLIENTS; a partner application's token must be accepted on /integrations/* alone`
    );
  }
  return partners;
}

function fail(raw: string, reason: string): never {
  throw new Error(
    `INTEGRATION_PARTNERS is not usable: "${raw}": ${reason}. ` +
      "Set it to comma-separated clientId=Display name pairs, as in " +
      "TEDRISAT__INTEGRATION_PARTNERS=ornek-uygulama=Örnek Uygulama in the " +
      "repository-root .env, or leave it empty for no partner."
  );
}
