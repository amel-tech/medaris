"use client";

import { type Session, SessionProvider } from "@medaris/auth/client";
import { AppProviders } from "@medaris/ui/mds/app-providers";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * `SessionProvider` holds who is signed in, as the root layout read it on the
 * server (`auth()`); no token reaches the browser (MDRS-28). When the tab is
 * shown again it reads `/api/auth/session`, which runs through the proxy, and
 * reloads the page if the session ended or changed account under it: a
 * sign-out in another Medaris app (MDRS-210). That is all that is left of
 * next-auth's `RefreshErrorRedirect` and `KeycloakSessionWatch`: a session
 * that is over is sent to sign-in by the server now (the proxy and
 * `requireSession`), and the sign-in page holds the loop cap, so nothing here
 * can bounce between a page and Keycloak (B2).
 *
 * `AppProviders` is the unified kit's root (canvas rule 3): the `isolate`
 * wrapper, the direction, the tooltip delay and the one `Toaster`. Its
 * `routeKey` closes the toasts from before the user's last action when the
 * pathname changes (MDRS-214).
 */
export function ClientProviders({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <SessionProvider session={session}>
      <AppProviders routeKey={pathname}>{children}</AppProviders>
    </SessionProvider>
  );
}
