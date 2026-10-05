import nodemailer from "nodemailer";
import { CONTACT_ADDRESS, contactTopics } from "./contact";

/** The SMTP server the landing sends the form through. */
export interface SmtpConfig {
  host: string;
  port: number;
  security: SmtpSecurity;
  /** Null when the server takes mail without AUTH (an IP-allow-listed relay). */
  auth: { user: string; pass: string } | null;
  from: string;
  fromName: string;
}

export const SMTP_SECURITY = ["starttls", "ssl", "none"] as const;
export type SmtpSecurity = (typeof SMTP_SECURITY)[number];

export class SmtpConfigError extends Error {}

/** One address with no display name, brackets, whitespace or list separator. */
export const isBareAddress = (value: string): boolean =>
  /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/.test(value);

/**
 * Reads `SMTP_HOST`, `SMTP_SECURITY`, `SMTP_PORT`, `SMTP_FROM`,
 * `SMTP_FROM_DISPLAY_NAME`, `SMTP_USER` and `SMTP_PASSWORD`
 * (`LANDING__SMTP_*` in the root `.env`): the names tedrisat's sender uses
 * (MDRS-121), which are the realm sender's less the `KC_` (MDRS-98).
 *
 * Unset `SMTP_HOST` means no sender: the form answers 503 and says where to
 * write instead. Once it is set the rest must make sense, or this throws
 * SmtpConfigError: `SMTP_FROM` is required and bare; `SMTP_SECURITY` is
 * `starttls` (default), `ssl` or `none`, the port defaulting to 465 with
 * `ssl` and 587 otherwise; user and password go together, never over `none`.
 */
export function readSmtpConfig(
  env: Record<string, string | undefined>
): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;

  const security = (env.SMTP_SECURITY?.trim() || "starttls").toLowerCase();
  if (!(SMTP_SECURITY as readonly string[]).includes(security)) {
    throw new SmtpConfigError(
      `SMTP_SECURITY must be one of ${SMTP_SECURITY.join(", ")}, got "${security}".`
    );
  }

  const rawPort = env.SMTP_PORT?.trim();
  const port = rawPort
    ? /^\d+$/.test(rawPort)
      ? Number(rawPort)
      : Number.NaN
    : security === "ssl"
      ? 465
      : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new SmtpConfigError(
      `SMTP_PORT must be a port number, got "${rawPort}".`
    );
  }

  const from = env.SMTP_FROM?.trim();
  if (!from || !isBareAddress(from)) {
    throw new SmtpConfigError(
      "SMTP_FROM must be a bare address such as no-reply@example.org once SMTP_HOST is set."
    );
  }

  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD ?? "";
  if (Boolean(user) !== Boolean(pass)) {
    throw new SmtpConfigError(
      "SMTP_USER and SMTP_PASSWORD go together or not at all."
    );
  }
  if (user && security === "none") {
    throw new SmtpConfigError(
      "SMTP_SECURITY=none would send SMTP_PASSWORD in clear text."
    );
  }

  return {
    host,
    port,
    security: security as SmtpSecurity,
    auth: user ? { user, pass } : null,
    from,
    fromName: env.SMTP_FROM_DISPLAY_NAME?.trim() || "Medaris",
  };
}

export interface ContactMessage {
  ad: string;
  eposta: string;
  konu: string;
  mesaj: string;
}

/** A header value on one line: no CR, LF or other control characters. */
const oneLine = (value: string) =>
  Array.from(value, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f ? " " : ch;
  })
    .join("")
    .replace(/ {2,}/g, " ")
    .trim();

/** Sends one form message to CONTACT_ADDRESS, with the visitor as Reply-To. */
export async function sendContactMessage(
  config: SmtpConfig,
  message: ContactMessage
): Promise<void> {
  const topic =
    contactTopics.find((t) => t.value === message.konu)?.label ?? message.konu;
  const transport = nodemailer.createTransport({
    host: config.host,
    // The name sent in EHLO. Unset, nodemailer sends the machine's hostname —
    // a random container id in production — and Google's smtp-relay closes the
    // connection with "421 4.7.0 Try again later (EHLO)". The sender's domain
    // is a name the relay accepts.
    name: config.from.slice(config.from.lastIndexOf("@") + 1),
    port: config.port,
    secure: config.security === "ssl",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "none",
    auth: config.auth ?? undefined,
  });
  await transport.sendMail({
    from: { name: config.fromName, address: config.from },
    to: CONTACT_ADDRESS,
    replyTo: { name: oneLine(message.ad), address: message.eposta },
    subject: oneLine(`İletişim formu · ${topic} · ${message.ad}`),
    text: [
      `Ad soyad: ${message.ad}`,
      `E-posta: ${message.eposta}`,
      `Konu: ${topic}`,
      "",
      message.mesaj,
    ].join("\n"),
  });
}
