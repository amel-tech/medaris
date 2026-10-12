"use client";

import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, SessionUser } from "../shared/session";
import { fetchSession } from "./sign-in";

/**
 * The session in client components, in place of next-auth's `SessionProvider`
 * and `useSession`.
 *
 * Fed by the server: the app's layout reads `auth()` and passes the result in,
 * so the first render already knows who is signed in (no "loading" state, no
 * request on mount). It holds the user's identity claims only; the tokens
 * never reach client JS (MDRS-28, C7).
 *
 * When the tab is shown again it asks `GET /api/auth/session`, which runs
 * through `proxy.ts` and so is where a sign-out in another Medaris app is
 * noticed (MDRS-210). If the session ended, or now belongs to another account,
 * under an open page, the page reloads, so its server-rendered parts are
 * drawn again: a protected page goes to sign-in, a public one renders for the
 * visitor. A hidden tab waits until it is shown. Only that transition reloads;
 * a page rendered for a visitor never does, so this cannot loop.
 */
export type SessionStatus = "authenticated" | "unauthenticated";

export interface SessionContextValue {
  status: SessionStatus;
  session: Session | null;
  user: SessionUser | null;
  /** Reads the session again now; `undefined` when it could not be asked. */
  refresh(): Promise<Session | null | undefined>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** What changed between two reads of the session. */
export type SessionChange = "same" | "started" | "ended" | "switched";

export function sessionChange(
  before: Session | null,
  after: Session | null
): SessionChange {
  if (!before) return after ? "started" : "same";
  if (!after) return "ended";
  return after.user.sub === before.user.sub ? "same" : "switched";
}

/** A tab shown again within this long of the last read does not read again. */
const REFETCH_MIN_INTERVAL_MS = 5_000;

export interface SessionProviderProps {
  /** `await auth()` from the server layout. */
  session: Session | null;
  children?: ReactNode;
  /** Read the session again when the tab is shown. Default `true`. */
  refetchOnFocus?: boolean;
  /** What happens when the session ended under the page. Default: a reload. */
  onEnded?: () => void;
}

const reloadPage = () => window.location.reload();

export function SessionProvider({
  session: initial,
  children,
  refetchOnFocus = true,
  onEnded = reloadPage,
}: SessionProviderProps) {
  const [session, setSession] = useState(initial);
  // A server render (a navigation) brings a new reading; a re-render of the
  // same one does not replace what a refresh learnt since.
  const reading = initial ? `${initial.user.sub}@${initial.expiresAt}` : "";
  const [seen, setSeen] = useState(reading);
  if (reading !== seen) {
    setSeen(reading);
    setSession(initial);
  }

  const latest = useRef(session);
  useEffect(() => {
    latest.current = session;
  }, [session]);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const value = useMemo<SessionContextValue>(() => {
    const refresh = async () => {
      const next = await fetchSession();
      if (next === undefined) return undefined;
      const change = sessionChange(latest.current, next);
      latest.current = next;
      setSession(next);
      if (change === "ended" || change === "switched") onEndedRef.current();
      return next;
    };
    return {
      status: session ? "authenticated" : "unauthenticated",
      session,
      user: session?.user ?? null,
      refresh,
    };
  }, [session]);

  const refresh = value.refresh;
  useEffect(() => {
    if (!refetchOnFocus) return;
    let lastRead = Date.now();
    let reading = false;
    const onShown = () => {
      if (document.visibilityState === "hidden" || reading) return;
      if (Date.now() - lastRead < REFETCH_MIN_INTERVAL_MS) return;
      reading = true;
      lastRead = Date.now();
      void refresh().finally(() => {
        reading = false;
      });
    };
    document.addEventListener("visibilitychange", onShown);
    window.addEventListener("focus", onShown);
    return () => {
      document.removeEventListener("visibilitychange", onShown);
      window.removeEventListener("focus", onShown);
    };
  }, [refetchOnFocus, refresh]);

  return createElement(SessionContext.Provider, { value }, children);
}

/** The session in a client component. Throws outside a `SessionProvider`. */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession() needs a <SessionProvider> above it");
  }
  return value;
}
