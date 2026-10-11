import { resourceHref } from "@medaris/utils";

/** A resource host with a name of its own: the platform chip's id. */
export type ResourceProvider = "google-drive";

const onDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

/**
 * Where a resource's link lives, read off its host (MDRS-286), or null for a
 * host with no name of its own. Staff upload a file to Google Drive and paste
 * its link, so a Drive link reads as such, beside its name, as a platform
 * chip does. The hosts are the ones tedrisat's `detectRecordingLink` reads as
 * Drive: drive.google.com and docs.google.com (a Docs, Sheets or Slides file
 * kept in Drive), each with its subdomains. Only an address `resourceHref`
 * would link is read, so a row without one (a caller who may not read the
 * content) or a `javascript:` value never gets a label.
 */
export const resourceProviderOf = (
  url: string | null | undefined
): ResourceProvider | null => {
  const href = resourceHref(url);
  if (!href) return null;
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
  return onDomain(host, "drive.google.com") || onDomain(host, "docs.google.com")
    ? "google-drive"
    : null;
};
