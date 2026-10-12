import { type AuthErrorCode, isRetryableAuthError } from "../shared/auth-error";
import { AUTH_ROUTES, REAUTH_PARAM } from "../shared/routes";
import type { Session } from "../shared/session";

/**
 * Starting a sign-in from the browser, one round trip at a time (#180).
 *
 * The server keeps every round trip in its own cookie, so two tabs no longer
 * break each other's sign-in. What is left for the browser is not to start
 * more of them than needed, and never to start them for ever:
 *
 * - one tab at a time takes the round trip (a claim in `localStorage`); the
 *   others wait for the session it brings back and then go on to their own
 *   page. A hidden tab never starts one by itself. Tabs start together more
 *   often than it sounds: a browser restoring its tabs, or every tab of an
 *   app meeting the end of the same session;
 * - already signed in (another tab finished first): straight on, at most a
 *   couple of times per tab in two minutes. A page that sends a signed-in
 *   browser here (its API refused a token the IdP still accepts: a wrong
 *   audience, clock skew) would otherwise bounce between itself and this page
 *   without end, since going on spends nothing else;
 * - `reauth` (the API refused this session's token): the session the page
 *   came with does not count as signed in; only a newer one does, so the tab
 *   goes through the IdP for new tokens instead of straight back;
 * - after a failed round trip, one automatic retry per tab per two minutes,
 *   then the error box with a button; `AccessDenied`, `Configuration` and
 *   `SignInLimit` never retry by themselves;
 * - the loop cap: at most a few automatic starts per tab in two minutes,
 *   whatever the reason. A session cookie the browser keeps refusing would
 *   otherwise send the tab from the page to the IdP and back without end. The
 *   start route has its own cap per browser (`SignInLimit`) under this one.
 *
 * A spent budget shows the box as `SignInLimit`: "too many attempts, wait a
 * few minutes", which is what it is.
 */

/** Which form the IdP should open: `register` asks for it with `prompt=create`. */
export type SignInIntent = "signin" | "register";

export interface SignInRequest {
  intent?: SignInIntent;
  /** Where to land afterwards: a same-origin path; the server validates it again. */
  callbackUrl?: string;
  /** The active UI locale, passed to the IdP as `ui_locales` (MDRS-274). */
  locale?: string;
  /**
   * The API refused this session's token (`?reauth=1` on the sign-in page,
   * `reauth` on an `Unauthenticated` result): get new tokens from the IdP
   * rather than going straight back with the refused ones.
   */
  reauth?: boolean;
}

/** The start route's address for `request`. `auto` marks a start nobody clicked. */
export function signInHref(request: SignInRequest = {}, auto = false): string {
  const params = new URLSearchParams();
  if (request.callbackUrl) params.set("callbackUrl", request.callbackUrl);
  if (request.locale) params.set("locale", request.locale);
  if (request.intent === "register") params.set("intent", "register");
  if (request.reauth) params.set(REAUTH_PARAM, "1");
  if (auto) params.set("auto", "1");
  const query = params.toString();
  return query ? `${AUTH_ROUTES.signIn}?${query}` : AUTH_ROUTES.signIn;
}

/** `localStorage`: which tab is in a round trip, and since when. */
export const SIGN_IN_CLAIM_KEY = "medaris.auth.sign-in";
/** `sessionStorage`: this tab's automatic retries after a failed round trip. */
export const AUTO_RETRY_KEY = "medaris.auth.auto-retry";
/** `sessionStorage`: this tab's automatic starts, failed or not (the loop cap). */
export const AUTO_START_KEY = "medaris.auth.auto-start";
/** `sessionStorage`: this tab's "already signed in, go on" steps. */
export const GO_ON_KEY = "medaris.auth.go-on";
/** `sessionStorage`: this tab's id; it survives the trip to the IdP and back. */
export const TAB_ID_KEY = "medaris.auth.tab";

/** A claim older than this is abandoned (its tab was closed on the IdP's form). */
export const SIGN_IN_CLAIM_TTL_MS = 30_000;
/** The window the automatic budgets are counted in. */
export const AUTO_WINDOW_MS = 120_000;
export const MAX_AUTO_RETRIES = 1;
export const MAX_AUTO_STARTS = 3;
/**
 * Going on to the page because a session is already there. Twice covers the
 * honest cases (another tab finished first; the Back button onto this page);
 * a third time in two minutes is a page sending a signed-in browser back
 * here, which going on again cannot fix.
 */
export const MAX_GO_ONS = 2;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const read = <T>(storage: StorageLike | undefined, key: string): T | null => {
  const raw = storage?.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
};

let memoryTabId: string | undefined;

/** This tab's id, kept in `sessionStorage` so the page after the trip still owns its claim. */
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
 * `force` takes it regardless: a click is the visitor's own decision. Without
 * storage there is nothing to coordinate with, so the claim succeeds.
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

/** Whether `tab` still holds the claim: two tabs can both write in the same instant. */
export const holdsSignIn = (shared: StorageLike | undefined, tab: string) => {
  try {
    const held = read<Claim>(shared, SIGN_IN_CLAIM_KEY);
    return !held || held.tab === tab;
  } catch {
    return true;
  }
};

interface Budget {
  count: number;
  at: number;
}

/**
 * Spends one unit of a per-tab budget counted in `sessionStorage`; `false`
 * once `max` are spent within the window. `withoutStorage` is the answer
 * when the counter cannot be kept.
 */
const spend = (
  storage: StorageLike | undefined,
  key: string,
  max: number,
  now: number,
  withoutStorage: boolean
): boolean => {
  try {
    if (!storage) return withoutStorage;
    const last = read<Budget>(storage, key);
    const count = last && now - last.at < AUTO_WINDOW_MS ? last.count : 0;
    if (count >= max) return false;
    storage.setItem(
      key,
      JSON.stringify({ count: count + 1, at: count === 0 ? now : last?.at })
    );
    return true;
  } catch {
    return withoutStorage;
  }
};

/**
 * This tab's one automatic retry after a failed round trip. Refused without
 * `sessionStorage`: with no counter there is no guard against a loop, so the
 * box is the safe answer.
 */
export const takeAutoRetry = (storage: StorageLike | undefined, now: number) =>
  spend(storage, AUTO_RETRY_KEY, MAX_AUTO_RETRIES, now, false);

/**
 * One of this tab's automatic starts (the loop cap). Allowed without
 * `sessionStorage`, since a first visit needs one; the start route's own cap
 * still holds then.
 */
export const takeAutoStart = (storage: StorageLike | undefined, now: number) =>
  spend(storage, AUTO_START_KEY, MAX_AUTO_STARTS, now, true);

/**
 * One of this tab's "already signed in, go on" steps. Refused without
 * `sessionStorage`: going on never reaches the start route, so the server's
 * cap cannot stand in for the missing counter here. (A browser that refuses
 * storage outright usually refuses the session cookie too, and then is not
 * signed in to go on with.)
 */
export const takeGoOn = (storage: StorageLike | undefined, now: number) =>
  spend(storage, GO_ON_KEY, MAX_GO_ONS, now, false);

export interface SignInDeps {
  /** The current session, or `null`; a failure to ask counts as `null`. */
  getSession: () => Promise<Session | null>;
  navigate: (url: string) => void;
  isVisible: () => boolean;
  /** `localStorage`: shared by every tab of the origin. */
  shared: StorageLike | undefined;
  /** `sessionStorage`: this tab only. */
  local: StorageLike | undefined;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Stops a wait that is no longer wanted. */
  cancelled?: () => boolean;
  pollMs?: number;
}

/**
 * What `enterSignIn` did. `show-error` carries the code whose message the
 * box shows (`authErrorMessageKey(outcome.error)`): the page's own `?error=`
 * as it came (any string; unknown ones get the generic message), or
 * `SignInLimit` when this tab's budget ran out.
 */
export type SignInOutcome =
  | { kind: "redirected" }
  | { kind: "signing-in" }
  | { kind: "cancelled" }
  | { kind: "show-error"; error: string };

const SIGN_IN_LIMIT: AuthErrorCode = "SignInLimit";

/** A round trip this page has already started: a second one from the same page is pointless. */
let startedHere = false;

const begin = (deps: SignInDeps, href: string): SignInOutcome => {
  startedHere = true;
  deps.navigate(href);
  return { kind: "signing-in" };
};

const showError = (error: string): SignInOutcome => ({
  kind: "show-error",
  error,
});

/** Settles the claim race: two tabs that wrote in the same instant re-read after this. */
const CLAIM_SETTLE_MS = 50;

/** Whether `current` is another session than `refused`: another account, or new tokens. */
const isNewer = (current: Session, refused: Session | null) =>
  !refused ||
  current.user.sub !== refused.user.sub ||
  current.expiresAt !== refused.expiresAt;

/**
 * What a sign-in page does instead of starting a round trip outright:
 *
 * 1. a final error (`AccessDenied`, `Configuration`, `SignInLimit`) → the box;
 * 2. a session already there → straight on to `callbackUrl`, while this tab's
 *    go-on budget lasts, else the box (`SignInLimit`). With `reauth`, the
 *    session the page was sent with is not "there": only a newer one is;
 * 3. a retryable error → this tab's one automatic retry, else the box;
 * 4. the loop cap → the box (`SignInLimit`) once this tab has started too
 *    many on its own;
 * 5. otherwise wait for this tab's turn (visible, and no other tab in a round
 *    trip) and start one, unless the session arrives first.
 */
export async function enterSignIn(
  request: SignInRequest,
  error: string | null | undefined,
  deps: SignInDeps
): Promise<SignInOutcome> {
  if (error && !isRetryableAuthError(error)) return showError(error);

  const read = async () => {
    try {
      const session = await deps.getSession();
      return session?.user ? session : null;
    } catch {
      return null;
    }
  };
  const first = await read();
  // The session the API refused: going on with it is the loop `reauth` exists to stop.
  const refused = request.reauth ? first : null;
  const signedIn = (session: Session | null) =>
    session !== null && isNewer(session, refused);
  const goOn = (): SignInOutcome => {
    if (!takeGoOn(deps.local, deps.now())) return showError(SIGN_IN_LIMIT);
    deps.navigate(request.callbackUrl ?? "/");
    return { kind: "redirected" };
  };

  if (signedIn(first)) return goOn();
  if (error && !takeAutoRetry(deps.local, deps.now())) return showError(error);
  if (!takeAutoStart(deps.local, deps.now())) return showError(SIGN_IN_LIMIT);

  const tab = tabIdOf(deps.local);
  const href = signInHref(request, true);
  const pollMs = deps.pollMs ?? 1000;
  for (;;) {
    if (deps.cancelled?.()) return { kind: "cancelled" };
    if (startedHere) return { kind: "signing-in" };
    if (
      deps.isVisible() &&
      claimSignIn({ shared: deps.shared, tab, now: deps.now() })
    ) {
      await deps.sleep(CLAIM_SETTLE_MS);
      if (deps.cancelled?.()) return { kind: "cancelled" };
      if (startedHere) return { kind: "signing-in" };
      if (holdsSignIn(deps.shared, tab)) return begin(deps, href);
    }
    await deps.sleep(pollMs);
    if (signedIn(await read())) return goOn();
  }
}

/**
 * Starts a round trip on the visitor's click ("Giriş yap", "Tekrar dene"):
 * takes the claim whatever another tab holds, so the waiting ones defer to it.
 */
export function signIn(
  request: SignInRequest = {},
  deps: Pick<
    SignInDeps,
    "navigate" | "shared" | "local" | "now"
  > = browserSignInDeps()
): void {
  claimSignIn({
    shared: deps.shared,
    tab: tabIdOf(deps.local),
    now: deps.now(),
    force: true,
  });
  startedHere = true;
  deps.navigate(signInHref(request));
}

const storageOf = (name: "localStorage" | "sessionStorage") => {
  try {
    return window[name];
  } catch {
    return undefined;
  }
};

/** Reads `GET /api/auth/session`; `undefined` when it could not be asked. */
export async function fetchSession(): Promise<Session | null | undefined> {
  try {
    const response = await fetch(AUTH_ROUTES.session, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return undefined;
    return (await response.json()) as Session | null;
  } catch {
    return undefined;
  }
}

/** The browser's own `SignInDeps`. */
export const browserSignInDeps = (
  overrides: Partial<SignInDeps> = {}
): SignInDeps => ({
  getSession: async () => (await fetchSession()) ?? null,
  navigate: (url) => window.location.assign(url),
  isVisible: () => document.visibilityState !== "hidden",
  shared: storageOf("localStorage"),
  local: storageOf("sessionStorage"),
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ...overrides,
});

/** For the specs: forget that this page started a round trip. */
export const resetSignInState = () => {
  startedHere = false;
  memoryTabId = undefined;
};
