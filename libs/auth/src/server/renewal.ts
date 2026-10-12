import * as client from "openid-client";
import { httpStatusOf } from "../shared/unauthenticated";
import {
  REFRESH_WINDOW_MS,
  type ResolvedAuthConfig,
  SESSION_CHECK_INTERVAL_MS,
} from "./config";
import {
  failureSummary,
  isFinalGrantFailure,
  type Oidc,
  oauthErrorOf,
} from "./oidc";
import {
  hasUsableAccessToken,
  type StoredSession,
  sessionFromTokens,
} from "./session-cookie";
import { createSingleFlight } from "./single-flight";

/**
 * Keeps a session current. Called by `proxy.ts` and by nothing else: it is the
 * only place that can write the cookie for the request that is being served,
 * so it is the only place that refreshes (B1, C1). Server components, actions
 * and route handlers only read.
 *
 * Two jobs, at most one per request:
 *
 * - **Refresh** when the access token has less than a minute left. One
 *   refresh per refresh token in this process (single-flight), so parallel
 *   requests from one browser do not spend the token several times. A refresh
 *   the IdP refuses ends the session. One it could not answer (a timeout, a
 *   5xx) keeps the session while its access token is still usable, and is
 *   tried again on the next request; once the token has run out, it ends it.
 * - **Confirm** the SSO session with the IdP's `userinfo` endpoint at most
 *   once a minute (MDRS-210): a sign-out in another Medaris app ends this
 *   app's session too. Only a 401, or another account behind the token, ends
 *   it; an IdP that cannot be asked keeps it, stamped, so an outage costs one
 *   call a minute rather than one per request. Never run in the last minute
 *   of a token's life, where a refresh answers the same question and clock
 *   skew could turn a valid token into a 401 (B10).
 *
 *   Only with the session in the cookie (`sessionCheck`). With a session
 *   store (auth Phase 2) the IdP ends a session itself, through back-channel
 *   logout, and the refresh at the access token's expiry (about five
 *   minutes) is the backstop for a logout that did not arrive.
 *
 * The refresh runs inside a `RefreshGate` the session store hands in: with
 * Valkey, a lock that lets one replica spend the refresh token while the
 * others wait for what it stores. The in-process single-flight stays in front
 * of it, so parallel requests in one replica do not even ask for the lock.
 */
export type Renewal =
  | { kind: "unchanged" }
  | { kind: "updated"; session: StoredSession }
  | { kind: "ended"; reason: EndReason };

export type EndReason =
  /** The access token ran out and there is no refresh token, or its deadline passed. */
  | "expired"
  /** The IdP refused the refresh (`invalid_grant`, `invalid_client`, …). */
  | "refresh-refused"
  /** The refresh could not reach the IdP, and the access token has run out. */
  | "refresh-unavailable"
  /** `userinfo` said 401, or named another account. */
  | "ended-at-idp";

export type RefreshOutcome =
  | { kind: "refreshed"; session: StoredSession }
  | { kind: "failed"; final: boolean };

/** Runs a refresh, or hands back the result another replica stored. */
export type RefreshGate = (
  refresh: () => Promise<RefreshOutcome>
) => Promise<RefreshOutcome>;

const ungated: RefreshGate = (refresh) => refresh();

type CheckVerdict = "active" | "ended" | "unknown";

/** How long a finished refresh is handed to latecomers with the same old token. */
const REFRESH_GRACE_MS = 30_000;
const CHECK_GRACE_MS = 10_000;

export interface SessionRenewal {
  renew(session: StoredSession, gate?: RefreshGate): Promise<Renewal>;
}

export interface SessionRenewalOptions {
  /**
   * Ask `userinfo` once a minute whether the SSO session still exists
   * (MDRS-210). Default `true`; off with a session store, where back-channel
   * logout does that job.
   */
  sessionCheck?: boolean;
}

export function createSessionRenewal(
  config: ResolvedAuthConfig,
  oidc: Oidc,
  { sessionCheck = true }: SessionRenewalOptions = {}
): SessionRenewal {
  const refreshes = createSingleFlight<RefreshOutcome>(
    REFRESH_GRACE_MS,
    config.now,
    (outcome) => outcome.kind === "refreshed"
  );
  const checks = createSingleFlight<CheckVerdict>(
    CHECK_GRACE_MS,
    config.now,
    (verdict) => verdict !== "unknown"
  );

  const refresh = async (
    session: StoredSession,
    refreshToken: string
  ): Promise<RefreshOutcome> => {
    try {
      const configuration = await oidc.configuration();
      const tokens = await client.refreshTokenGrant(
        configuration,
        refreshToken
      );
      const renewed = sessionFromTokens(
        tokens as unknown as Parameters<typeof sessionFromTokens>[0],
        config.now(),
        session
      );
      // OIDC Core §12.2: a refreshed ID token names the same subject. Another
      // one means the token is not this session's any more.
      if (!renewed || renewed.user.sub !== session.user.sub) {
        console.error("@medaris/auth: refresh named another subject");
        return { kind: "failed", final: true };
      }
      return { kind: "refreshed", session: renewed };
    } catch (error) {
      const final = isFinalGrantFailure(error);
      // `invalid_grant` is the expected end of a session (signed out
      // elsewhere, idle too long) and not worth an error line each time.
      if (oauthErrorOf(error) !== "invalid_grant") {
        console.error(
          "@medaris/auth: token refresh failed",
          failureSummary(error)
        );
      }
      return { kind: "failed", final };
    }
  };

  const check = async (session: StoredSession): Promise<CheckVerdict> => {
    try {
      const configuration = await oidc.configuration();
      const info = await client.fetchUserInfo(
        configuration,
        session.accessToken,
        client.skipSubjectCheck
      );
      return typeof info.sub === "string" && info.sub !== session.user.sub
        ? "ended"
        : "active";
    } catch (error) {
      return httpStatusOf(error) === 401 ? "ended" : "unknown";
    }
  };

  return {
    async renew(session, gate = ungated) {
      const now = config.now();
      const left = session.accessTokenExpiresAt - now;

      if (left <= REFRESH_WINDOW_MS) {
        const usable = hasUsableAccessToken(session, now);
        const refreshToken = session.refreshToken;
        const deadlinePassed =
          session.refreshTokenExpiresAt !== undefined &&
          session.refreshTokenExpiresAt <= now;
        if (!refreshToken || deadlinePassed) {
          // Nothing to refresh with; no call to the IdP (A15). The token's
          // last seconds are still used.
          return usable
            ? { kind: "unchanged" }
            : { kind: "ended", reason: "expired" };
        }
        const outcome = await refreshes.run(refreshToken, () =>
          gate(() => refresh(session, refreshToken))
        );
        if (outcome.kind === "refreshed") {
          return { kind: "updated", session: outcome.session };
        }
        if (outcome.final) return { kind: "ended", reason: "refresh-refused" };
        return usable
          ? { kind: "unchanged" }
          : { kind: "ended", reason: "refresh-unavailable" };
      }

      if (!sessionCheck) return { kind: "unchanged" };
      const sinceCheck = now - session.checkedAt;
      if (sinceCheck >= 0 && sinceCheck < SESSION_CHECK_INTERVAL_MS) {
        return { kind: "unchanged" };
      }
      const verdict = await checks.run(session.accessToken, () =>
        check(session)
      );
      if (verdict === "ended") return { kind: "ended", reason: "ended-at-idp" };
      return { kind: "updated", session: { ...session, checkedAt: now } };
    },
  };
}
