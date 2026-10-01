export type MeetingPlatformId = "google-meet" | "zoom" | "jitsi" | "unknown";

export interface MeetingPlatform {
  id: MeetingPlatformId;
  label: string;
  /** Brand color for buttons/badges. */
  color: string;
  /** Soft tint of the brand color for backgrounds. */
  soft: string;
}

const PLATFORMS: Record<
  Exclude<MeetingPlatformId, "unknown">,
  MeetingPlatform
> = {
  "google-meet": {
    id: "google-meet",
    label: "Google Meet",
    color: "#00897b",
    soft: "#e6f4f1",
  },
  zoom: { id: "zoom", label: "Zoom", color: "#2d8cff", soft: "#e9f2ff" },
  jitsi: {
    id: "jitsi",
    label: "Jitsi Meet",
    color: "#1d6fb8",
    soft: "#e7f0f9",
  },
};

const UNKNOWN_PLATFORM: MeetingPlatform = {
  id: "unknown",
  label: "",
  color: "#64748b",
  soft: "#f1f5f9",
};

const matchesHost = (hostname: string, domain: string): boolean =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/**
 * Resolve the meeting platform from a meeting URL — there is no manual
 * platform picker anywhere in the product; the URL is the single source
 * of truth. Unrecognized or malformed URLs resolve to `unknown` (the
 * caller decides the fallback label).
 */
export const resolveMeetingPlatform = (
  url: string | null | undefined
): MeetingPlatform => {
  if (!url) return UNKNOWN_PLATFORM;
  let hostname: string;
  try {
    hostname = new URL(
      url.includes("://") ? url : `https://${url}`
    ).hostname.toLowerCase();
  } catch {
    return UNKNOWN_PLATFORM;
  }
  if (matchesHost(hostname, "meet.google.com")) return PLATFORMS["google-meet"];
  if (matchesHost(hostname, "zoom.us")) return PLATFORMS.zoom;
  if (matchesHost(hostname, "jit.si") || matchesHost(hostname, "meet.jit.si"))
    return PLATFORMS.jitsi;
  return UNKNOWN_PLATFORM;
};

/** `scheme://` at the start of a link — `https://`, `ftp://`… */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `http:` or `https:` followed by any number of slashes, even none. */
const WEB_SCHEME = /^https?:\/*/i;

/** tedrisat's `@MaxLength(500)` on the same field. */
export const MEETING_URL_MAX_LENGTH = 500;

/**
 * The meeting link as it should be stored (MDRS-111): trimmed, and on
 * `https://`. A link without a scheme gets one — a link copied from some
 * address bars or calendar invites starts at the host
 * (`meet.google.com/abc-defg-hij`). A web scheme is repaired and upgraded:
 * `http://`, `https:/` and `https:` all become `https://`, since tedrisat
 * accepts https only and every supported platform serves it; this also lets
 * a course that still stores a pre-MDRS-111 `http://` link be saved again.
 * Any other scheme (`ftp://`…) is left as typed so `meetingUrlProblem` can
 * say what is wrong with it.
 */
export const normalizeMeetingUrl = (url: string | null | undefined): string => {
  const value = (url ?? "").trim();
  if (!value) return "";
  if (WEB_SCHEME.test(value)) return value.replace(WEB_SCHEME, "https://");
  if (SCHEME.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
};

export type MeetingUrlProblem = "not-https" | "too-long" | "invalid";

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const TLD = /\.([a-z]{2,63}|xn--[a-z0-9-]+)$/i;

/**
 * Why tedrisat would refuse this link, or `null` when it would take it —
 * checked on the link as `normalizeMeetingUrl` would store it. The API takes
 * `@IsUrl({ require_protocol: true, protocols: ["https"] })` and
 * `@MaxLength(500)`; this approximates validator.js's `isURL` (a host with a
 * top-level domain or an IPv4 address, no underscore, no `<`/`>`, no port 0)
 * so the editor can say so inline instead of the publish failing later. The
 * API stays the authority. An empty link is not a problem here — whether one
 * is required is the caller's decision.
 */
export const meetingUrlProblem = (
  url: string | null | undefined
): MeetingUrlProblem | null => {
  const value = normalizeMeetingUrl(url);
  if (!value) return null;
  if (value.length > MEETING_URL_MAX_LENGTH) return "too-long";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "https:") return "not-https";
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
