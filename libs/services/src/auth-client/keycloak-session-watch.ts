"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

export interface KeycloakSessionWatchProps {
  /**
   * What to do once the session has ended under an open page. Defaults to a
   * full reload; a parameter only so a spec can observe it.
   */
  reload?: () => void;
}

const reloadPage = () => window.location.reload();

/**
 * Reloads a page whose session ended while it was open (MDRS-210).
 *
 * When Keycloak reports the SSO session gone — the visitor signed out, or
 * signed in as someone else, in another Medaris app — the app's `session`
 * callback stops handing out a session, and `useSession` turns from
 * `authenticated` to `unauthenticated` on its next read (a tab regaining
 * focus, or another tab of this app broadcasting). Client components follow
 * by themselves, but the page's server-rendered parts still show the old
 * account. A reload puts every part through the server again: the middleware
 * sends a protected page to sign-in, and a public tedris page renders the
 * visitor's view. Nothing here goes to Keycloak.
 *
 * A hidden tab waits until it is shown. Another tab of this app that is
 * signing out broadcasts the change first and only then leaves for Keycloak's
 * end-session endpoint; reloading a protected page at once would start a new
 * sign-in that can reach Keycloak before the sign-out does. If the session
 * comes back before the tab is shown, nothing happens.
 *
 * Only the transition counts: a page that loads without a session was
 * rendered for a visitor already, so this can never reload in a loop.
 *
 * Kept apart from `RefreshErrorRedirect`, which handles the opposite case — a
 * session that a new round trip to Keycloak can still renew.
 */
export const KeycloakSessionWatch = ({
  reload = reloadPage,
}: KeycloakSessionWatchProps) => {
  const { status } = useSession();
  const previous = useRef(status);
  const pending = useRef(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (previous.current === "authenticated" && status === "unauthenticated") {
      pending.current = true;
    }
    if (status === "authenticated") pending.current = false;
    previous.current = status;
    if (!pending.current) return;

    const run = () => {
      if (!pending.current || document.visibilityState === "hidden") return;
      pending.current = false;
      reloadRef.current();
    };
    run();
    if (!pending.current) return;
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, [status]);

  return null;
};
