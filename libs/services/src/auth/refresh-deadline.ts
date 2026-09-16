/**
 * Turns Keycloak's `refresh_expires_in` into an absolute deadline, or
 * `undefined` when there is none.
 *
 * Keycloak reports `refresh_expires_in: 0` for a refresh token that does not
 * expire on its own, and omits the field entirely under some client configs.
 * Both must read as "no deadline" — arithmetic on them produces a timestamp in
 * the past or `NaN`, and treating that as an expiry killed every session the
 * moment its access token aged out. `undefined` is the only encoding of "no
 * deadline" the apps' `refreshAccessToken` guard can read.
 *
 * Shared rather than copied: the two web apps sign into the same realm, so the
 * rule is the same in both, and the 15-second skew and the `expiresIn > 0`
 * guard together encode one contract. Two copies of a contract drift silently.
 */
export const refreshDeadline = (
  expiresIn: number | undefined
): number | undefined =>
  typeof expiresIn === "number" && expiresIn > 0
    ? Date.now() + (expiresIn - 15) * 1000
    : undefined;
