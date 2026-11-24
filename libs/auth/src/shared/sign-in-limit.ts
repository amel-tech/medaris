/**
 * How many sign-ins one browser may start in a window before the sign-in page
 * says "too many attempts, wait a few minutes" (`SignInLimit`).
 *
 * Production keeps the defaults. A test environment where people sign in and
 * out on purpose all day can raise it through `AUTH_SIGN_IN_LIMIT`
 * (`WEB__AUTH_SIGN_IN_LIMIT` in the root `.env`), written `<count>/<seconds>`:
 * `30/60` is thirty sign-ins a minute. The same value sets the start route's
 * cap per browser and the sign-in page's automatic budget per tab, so the
 * one cannot stop what the other allows.
 */
export interface SignInLimit {
  /** Sign-ins allowed within `windowMs`. */
  max: number;
  windowMs: number;
}

/** The start route's cap per browser when nothing is configured. */
export const DEFAULT_SIGN_IN_LIMIT: SignInLimit = {
  max: 5,
  windowMs: 5 * 60_000,
};

const LIMIT_PATTERN = /^([1-9]\d{0,3})\/([1-9]\d{0,5})$/;

/**
 * `AUTH_SIGN_IN_LIMIT` as a `SignInLimit`; `undefined` when unset or empty,
 * which means the defaults. Anything else that is not `<count>/<seconds>`
 * throws, so a typo fails at boot instead of silently keeping the default.
 */
export function parseSignInLimit(
  value: string | undefined
): SignInLimit | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const match = LIMIT_PATTERN.exec(text);
  if (!match) {
    throw new Error(
      `@medaris/auth: AUTH_SIGN_IN_LIMIT must be <count>/<seconds>, such as 30/60, got ${JSON.stringify(text)}`
    );
  }
  return { max: Number(match[1]), windowMs: Number(match[2]) * 1000 };
}
