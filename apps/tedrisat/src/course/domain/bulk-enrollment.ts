import { isEmail } from "class-validator";

/**
 * "Toplu talebe ekle" (owner, 2026-10-12): the course team enrols a list of
 * people by e-mail address, everyone who bought the course elsewhere and
 * already has an account in the realm. The rules that need no database live
 * here.
 */

/** At most this many entries in one request, as sent. */
export const BULK_ENROLL_MAX = 500;

/** The audit row one bulk add writes, whatever came of it. */
export const BULK_ENROLLMENT_ACTION = "enrollment.bulk_add";

/** How many realm lookups run at once, so Keycloak is not hammered. */
export const BULK_LOOKUP_CONCURRENCY = 5;

/** The longest address looked up, as `GET /users/lookup` allows. */
const EMAIL_MAX = 320;

/** An open ban bars them from the course (MDRS-177). */
export const SKIP_BARRED = "barred";
/** The team took them out: putting them back is a decision about one person, made on the roster. */
export const SKIP_REVOKED = "revoked";
/** Their request moved (withdrawn, rejected) while this one ran. */
export const SKIP_CHANGED = "changed";

export interface IBulkEnrollmentResult {
  enrolled: string[];
  approved: string[];
  already: string[];
  notFound: string[];
  invalid: string[];
  /**
   * `reason` is `barred`, `revoked`, `changed`, or the status of the
   * enrollment they already hold (`COMPLETED`).
   */
  skipped: { email: string; reason: string }[];
}

/**
 * The list as it is looked up: each entry trimmed and lower-cased, empty ones
 * and repeats dropped, first occurrence first. What does not look like an
 * e-mail address goes to `invalid` (once) and is never looked up.
 */
export function normalizeEmails(raw: readonly string[]): {
  emails: string[];
  invalid: string[];
} {
  const seen = new Set<string>();
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const entry of raw) {
    const email = entry.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (email.length <= EMAIL_MAX && isEmail(email)) emails.push(email);
    else invalid.push(email);
  }
  return { emails, invalid };
}

/**
 * `fn` over `items` with at most `limit` calls in flight, results in the order
 * of `items`. The first failure rejects the whole and no new call starts after
 * it.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker)
  );
  return results;
}
