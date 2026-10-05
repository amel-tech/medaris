/** The SMTP server tedrisat sends lesson invitations through (MDRS-121). */
export interface ISmtpConfig {
  host: string;
  port: number;
  /** `ssl`: TLS from the first byte; `starttls`: upgrade required; `none`: plain. */
  security: SmtpSecurity;
  /** Null when the server takes mail without AUTH (an IP-allow-listed relay). */
  auth: { user: string; password: string } | null;
  /** The sender address, and the ORGANIZER of every invitation. */
  from: string;
  fromName: string;
}

export const SMTP_SECURITY = ["starttls", "ssl", "none"] as const;
export type SmtpSecurity = (typeof SMTP_SECURITY)[number];

const DEFAULT_FROM_NAME = "Medaris";

/**
 * One address without a display name, angle brackets, whitespace or a list
 * separator. Also what a recipient must look like before anything is sent to
 * it: nodemailer reads "a@x.org, b@y.org" as two recipients, and `:` or `;`
 * would break the invitation's ATTENDEE line.
 */
export const isBareAddress = (value: string): boolean =>
  /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/.test(value);

/**
 * Reads `SMTP_HOST`, `SMTP_SECURITY`, `SMTP_PORT`, `SMTP_FROM`,
 * `SMTP_FROM_DISPLAY_NAME`, `SMTP_USER` and `SMTP_PASSWORD`
 * (`TEDRISAT__SMTP_*` in the root `.env`) — the same names, less the `KC_`,
 * as the realm's own sender in `tools/keycloak/setup-realm.sh` (MDRS-98).
 *
 * Optional on purpose: with `SMTP_HOST` unset the API boots, nothing is
 * e-mailed and the invitation sweep never starts. Once it is set the rest
 * must make sense, or the boot stops — a sender that is half configured is a
 * typo, and finding out from a log line nobody reads would be worse:
 *
 * - `SMTP_FROM` is required and must be a bare address; it is also the
 *   ORGANIZER of every invitation, which Gmail and Apple Mail need to show
 *   one as an invitation.
 * - `SMTP_SECURITY` is `starttls` (default), `ssl` or `none`; the port
 *   defaults to 465 with `ssl` and 587 otherwise.
 * - `SMTP_USER` and `SMTP_PASSWORD` go together or not at all, and never over
 *   `none`, where the password would cross the network in clear text.
 */
export function readSmtpConfig(env: NodeJS.ProcessEnv): ISmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;

  const rawSecurity = (env.SMTP_SECURITY?.trim() || "starttls").toLowerCase();
  if (!(SMTP_SECURITY as readonly string[]).includes(rawSecurity)) {
    return fail(
      `SMTP_SECURITY must be one of ${SMTP_SECURITY.join(", ")}, got "${rawSecurity}".`
    );
  }
  const security = rawSecurity as SmtpSecurity;

  const rawPort = env.SMTP_PORT?.trim();
  const port = rawPort
    ? /^\d+$/.test(rawPort)
      ? Number(rawPort)
      : Number.NaN
    : security === "ssl"
      ? 465
      : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return fail(`SMTP_PORT must be a port number, got "${rawPort}".`);
  }

  const from = env.SMTP_FROM?.trim();
  if (!from) {
    return fail("SMTP_FROM is required once SMTP_HOST is set.");
  }
  if (!isBareAddress(from)) {
    return fail(
      `SMTP_FROM must be a bare address such as no-reply@example.org, got "${from}". ` +
        "The display name goes in SMTP_FROM_DISPLAY_NAME."
    );
  }

  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD;
  if (Boolean(user) !== Boolean(password)) {
    return fail("SMTP_USER and SMTP_PASSWORD must be set together.");
  }
  if (user && security === "none") {
    return fail(
      "SMTP_USER and SMTP_PASSWORD cannot be used with SMTP_SECURITY=none: " +
        "the password would cross the network in clear text."
    );
  }

  return {
    host,
    port,
    security,
    auth: user && password ? { user, password } : null,
    from,
    fromName: env.SMTP_FROM_DISPLAY_NAME?.trim() || DEFAULT_FROM_NAME,
  };
}

function fail(reason: string): never {
  throw new Error(
    `${reason} (TEDRISAT__SMTP_* in the root .env; unset TEDRISAT__SMTP_HOST to send no e-mail.)`
  );
}
