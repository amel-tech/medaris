import { createHash, randomBytes } from "node:crypto";

/**
 * The personal calendar-feed secret (MDRS-120).
 *
 * 32 random bytes, written base64url (43 characters, no padding), so it can
 * sit in a URL path as is. Only its SHA-256 is stored: the token has 256 bits
 * of entropy, so an unsalted, fast hash is enough — there is no dictionary to
 * run it against — and it keeps the lookup a plain equality on an indexed
 * column.
 */
const TOKEN_BYTES = 32;
const FEED_FILE = /^([A-Za-z0-9_-]{43})\.ics$/;

export const newCalendarFeedToken = (): string =>
  randomBytes(TOKEN_BYTES).toString("base64url");

export const hashCalendarFeedToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

/** The token out of `<token>.ics`, or null when the name has another shape. */
export const tokenFromFeedFile = (file: string): string | null =>
  FEED_FILE.exec(file)?.[1] ?? null;

/**
 * The two forms of one feed URL. Both point at tedris-web, which is public
 * and passes the request on to tedrisat: `url` for Google Calendar's
 * "From URL", `webcalUrl` for Apple Calendar, which opens a `webcal://` link
 * as a subscription.
 */
export const calendarFeedUrls = (
  webUrl: string,
  token: string
): { url: string; webcalUrl: string } => {
  const url = `${webUrl}/calendar/${token}.ics`;
  return { url, webcalUrl: url.replace(/^https?:/, "webcal:") };
};
