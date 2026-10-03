import { getSession } from "next-auth/react";
import { authErrorMessageKey } from "./auth-error";
import { type KeycloakSignInRequest, keycloakSignIn } from "./keycloak-sign-in";

/**
 * One Keycloak round trip per browser at a time.
 *
 * NextAuth keeps the OAuth `state` (and the PKCE verifier) in ONE cookie per
 * origin. When two tabs start a sign-in together, the second overwrites the
 * first one's cookie, and the first tab's callback fails with
 * `state mismatch` — or `State cookie was missing` once the other tab's
 * callback has consumed it. NextAuth reports both as `OAuthCallback`, and the
 * visitor lands on the "Giriş yapılamadı" box although nothing is wrong.
 *
 * Tabs start together more often than it sounds: a single `/api/auth/session`
 * answer is broadcast to every open tab, so when a refresh fails every tab's
 * `RefreshErrorRedirect` fires in the same moment; a browser restoring its
 * tabs, or a dev server reloading all of them, does the same through the
 * middleware. Measured on tedris: one session read, then three
 * `POST /api/auth/signin/keycloak` within the same second, then
 * `OAUTH_CALLBACK_ERROR state mismatch`.
 *
 * So a tab claims the round trip in `localStorage` before starting it; the
 * other tabs wait for the session the claiming tab brings back, and go on to
 * their own page once it is there. A hidden tab never starts one by itself.
 */

/** `localStorage`: which tab is in a Keycloak round trip, and since when. */
export const SIGN_IN_CLAIM_KEY = "medaris.auth.sign-in";
/** `sessionStorage`: this tab's automatic retries after a transient failure. */
export const AUTO_RETRY_KEY = "medaris.auth.auto-retry";
/** `sessionStorage`: this tab's id; it survives the trip to Keycloak and back. */
export const TAB_ID_KEY = "medaris.auth.tab";

/** A claim older than this is abandoned (its tab was closed on Keycloak's form). */
export const SIGN_IN_CLAIM_TTL_MS = 30_000;
/** One automatic retry per this window; past it, the box is shown. */
export const AUTO_RETRY_WINDOW_MS = 120_000;
export const MAX_AUTO_RETRIES = 1;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * A failed round trip that a second one can fix: the `OAuthCallback` family.
 * `AccessDenied` and `Configuration` fail the same way every time.
 */
export const isRetryableAuthError = (error: string | null | undefined) =>
  Boolean(error) && authErrorMessageKey(error) === "errorDescription";

const read = <T>(storage: StorageLike | undefined, key: string): T | null => {
  const raw = storage?.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
};

let memoryTabId: string | undefined;

/** This tab's id, kept in `sessionStorage` so the error page after the trip still owns its claim. */
export const tabIdOf = (storage: StorageLike | undefined): string => {
  try {
    const known = storage?.getItem(TAB_ID_KEY);
    if (known) return known;
    const id = crypto.randomUUID();
    storage?.setItem(TAB_ID_KEY, id);
    return id;
  } catch {
    memoryTabId ??= crypto.randomUUID();
    return memoryTabId;
  }
};

interface Claim {
  tab: string;
  at: number;
}

/**
 * Takes the round trip for `tab` unless another tab holds a live claim.
 * `force` takes it regardless — a click is the visitor's own decision.
 * Without storage there is nothing to coordinate with, so the claim succeeds.
 */
export const claimSignIn = ({
  shared,
  tab,
  now,
  force = false,
}: {
  shared: StorageLike | undefined;
  tab: string;
  now: number;
  force?: boolean;
}): boolean => {
  try {
    const held = read<Claim>(shared, SIGN_IN_CLAIM_KEY);
    if (
      !force &&
      held &&
      held.tab !== tab &&
      now - held.at < SIGN_IN_CLAIM_TTL_MS
    ) {
      return false;
    }
    shared?.setItem(SIGN_IN_CLAIM_KEY, JSON.stringify({ tab, at: now }));
    return true;
  } catch {
    return true;
  }
};

/** Whether `tab` still holds the claim — two tabs can both write in the same instant. */
export const holdsSignIn = (shared: StorageLike | undefined, tab: string) => {
  try {
    const held = read<Claim>(shared, SIGN_IN_CLAIM_KEY);
    return !held || held.tab === tab;
  } catch {
    return true;
  }
};

interface RetryCount {
  count: number;
  at: number;
}

/**
 * Spends this tab's one automatic retry. `false` once it is spent within the
 * window, and also when `sessionStorage` cannot be read: without a counter
 * there is no guard against a loop, so the box is the safe answer.
 */
export const takeAutoRetry = ({
  storage,
  now,
}: {
  storage: StorageLike | undefined;
  now: number;
}): boolean => {
  try {
    if (!storage) return false;
    const last = read<RetryCount>(storage, AUTO_RETRY_KEY);
    const count = last && now - last.at < AUTO_RETRY_WINDOW_MS ? last.count : 0;
    if (count >= MAX_AUTO_RETRIES) return false;
    storage.setItem(
      AUTO_RETRY_KEY,
      JSON.stringify({ count: count + 1, at: now })
    );
    return true;
  } catch {
    return false;
  }
};

/** The structural minimum of a NextAuth session this module reads. */
export type SessionLike = { user?: unknown; error?: unknown } | null;

export interface KeycloakEntryDeps {
  getSession: () => Promise<SessionLike>;
  signIn: (request: KeycloakSignInRequest) => unknown;
  navigate: (url: string) => void;
  isVisible: () => boolean;
  /** `localStorage`: shared by every tab of the origin. */
  shared: StorageLike | undefined;
  /** `sessionStorage`: this tab only. */
  local: StorageLike | undefined;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Stops a wait that is no longer wanted (the session recovered meanwhile). */
  cancelled?: () => boolean;
  pollMs?: number;
}

export type KeycloakEntryOutcome =
  | "redirected"
  | "signing-in"
  | "show-error"
  | "cancelled";

/**
 * A round trip this page has already started. The sign-in page runs both
 * `AuthEntry` and `RefreshErrorRedirect`; two `signIn()` calls from one page
 * race for the same state cookie just as two tabs do.
 */
let startedHere = false;

const begin = (
  signIn: KeycloakEntryDeps["signIn"],
  request: KeycloakSignInRequest
) => {
  startedHere = true;
  Promise.resolve(signIn(request)).catch(() => {
    // The navigation never started: let the next attempt through.
    startedHere = false;
  });
};

/** Settles the claim race: two tabs that wrote in the same instant re-read after this. */
const CLAIM_SETTLE_MS = 50;

/**
 * What a sign-in page (or a tab whose refresh failed) does instead of starting
 * a round trip outright:
 *
 * 1. a permanent error (`AccessDenied`, `Configuration`) → the box;
 * 2. a session already there (another tab's round trip finished) → straight
 *    on to `callbackUrl`;
 * 3. a transient error → one automatic retry per tab, then the box;
 * 4. otherwise wait for this tab's turn — visible, and no other tab in a round
 *    trip — and start one, unless the session arrives first.
 */
export const enterKeycloak = async (
  request: KeycloakSignInRequest,
  error: string | null | undefined,
  deps: KeycloakEntryDeps
): Promise<KeycloakEntryOutcome> => {
  if (error && !isRetryableAuthError(error)) return "show-error";

  const signedIn = async () => {
    try {
      const session = await deps.getSession();
      return Boolean(session?.user) && !session?.error;
    } catch {
      return false;
    }
  };

  if (await signedIn()) {
    deps.navigate(request.callbackUrl);
    return "redirected";
  }

  if (error && !takeAutoRetry({ storage: deps.local, now: deps.now() })) {
    return "show-error";
  }

  const tab = tabIdOf(deps.local);
  const pollMs = deps.pollMs ?? 1000;
  for (;;) {
    if (deps.cancelled?.()) return "cancelled";
    if (startedHere) return "signing-in";
    if (
      deps.isVisible() &&
      claimSignIn({ shared: deps.shared, tab, now: deps.now() })
    ) {
      await deps.sleep(CLAIM_SETTLE_MS);
      if (deps.cancelled?.()) return "cancelled";
      if (startedHere) return "signing-in";
      if (holdsSignIn(deps.shared, tab)) {
        begin(deps.signIn, request);
        return "signing-in";
      }
    }
    await deps.sleep(pollMs);
    if (await signedIn()) {
      deps.navigate(request.callbackUrl);
      return "redirected";
    }
  }
};

const storageOf = (name: "localStorage" | "sessionStorage") => {
  try {
    return window[name];
  } catch {
    return undefined;
  }
};

/** The browser's own `KeycloakEntryDeps`. Client-only. */
export const browserKeycloakEntryDeps = (
  overrides: Partial<KeycloakEntryDeps> = {}
): KeycloakEntryDeps => ({
  // Not broadcast: a waiting tab polls, and a broadcast read would make every
  // other tab refetch the session on each poll.
  getSession: () => getSession({ broadcast: false }) as Promise<SessionLike>,
  signIn: keycloakSignIn,
  navigate: (url) => window.location.assign(url),
  isVisible: () => document.visibilityState !== "hidden",
  shared: storageOf("localStorage"),
  local: storageOf("sessionStorage"),
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ...overrides,
});

/**
 * Starts a round trip on the visitor's click ("Tekrar dene", "Devam et"):
 * takes the claim whatever another tab holds, so the waiting ones defer to it.
 */
export const startKeycloakSignIn = (
  request: KeycloakSignInRequest,
  deps: Pick<
    KeycloakEntryDeps,
    "signIn" | "shared" | "local" | "now"
  > = browserKeycloakEntryDeps()
) => {
  claimSignIn({
    shared: deps.shared,
    tab: tabIdOf(deps.local),
    now: deps.now(),
    force: true,
  });
  begin(deps.signIn, request);
};
