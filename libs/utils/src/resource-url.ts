/**
 * A course resource's link (MDRS-279). Resources are links only for now: a
 * name, a short line ("PDF · 88 sayfa") and the address it opens. tedrisat
 * stores `url` only as `@IsUrl({ require_protocol: true, protocols: ["http",
 * "https"] })` with `@MaxLength(500)`, because tedris renders it as an href
 * and a `javascript:` or relative value there would run or resolve on the
 * page. The editors (nizam, nazar) check the same before "Kaydet", and tedris
 * links only what `resourceHref` passes, in case a row predates the rule.
 */

export const RESOURCE_URL_MAX_LENGTH = 500;

export type ResourceUrlProblem = "empty" | "not-http" | "too-long" | "invalid";

const HTTP_SCHEME = /^https?:\/\//i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const TLD = /\.([a-z]{2,63}|xn--[a-z0-9-]+)$/i;

/**
 * Why tedrisat would refuse this address, or `null` when it would take it.
 * Unlike a meeting link, nothing is added to the address as typed: one with no
 * scheme is refused rather than guessed at. The host rules approximate
 * validator.js's `isURL` as `meetingUrlProblem` does (a top-level domain or an
 * IPv4 address, no underscore, no `<`/`>`, no port 0); the API stays the
 * authority.
 */
export const resourceUrlProblem = (
  url: string | null | undefined
): ResourceUrlProblem | null => {
  const value = (url ?? "").trim();
  if (!value) return "empty";
  if (!HTTP_SCHEME.test(value)) return "not-http";
  if (value.length > RESOURCE_URL_MAX_LENGTH) return "too-long";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "invalid";
  }
  const host = parsed.hostname;
  if (
    /[\s<>]/.test(value) ||
    host.includes("_") ||
    parsed.port === "0" ||
    !(TLD.test(host) || IPV4.test(host))
  )
    return "invalid";
  return null;
};

/**
 * The address to put in an href, or `null` when there is none to link: only
 * an absolute http:// or https:// URL is linked, whatever the API sent.
 */
export const resourceHref = (url: string | null | undefined): string | null => {
  const value = (url ?? "").trim();
  if (!HTTP_SCHEME.test(value)) return null;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};
