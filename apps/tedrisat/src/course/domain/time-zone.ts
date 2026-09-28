/**
 * The canonical IANA name of a zone `Intl` accepts (MDRS-110):
 * "europe/istanbul", "Turkey" and "Asia/Istanbul" all become
 * "Europe/Istanbul". A value `Intl` rejects is returned unchanged, for the
 * validator to refuse.
 */
export const canonicalTimeZone = (value: string): string => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return value;
  }
};

/** Canonicalises `timeZone` on a course write, leaving everything else. */
export const withCanonicalTimeZone = <T extends { timeZone?: string }>(
  data: T
): T =>
  data.timeZone === undefined
    ? data
    : { ...data, timeZone: canonicalTimeZone(data.timeZone) };
