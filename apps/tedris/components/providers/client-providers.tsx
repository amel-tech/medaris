"use client";

import { type Session, SessionProvider } from "@medaris/auth/client";
import {
  DismissStaleSonnerToasts,
  Toaster,
} from "@medaris/ui/components/sonner";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { TimeZoneSync } from "./time-zone-sync";

/**
 * `SessionProvider` is fed by the locale layout's `auth()`, so the first
 * render already knows who is signed in, and no token reaches the browser.
 * When the tab is shown again it reads `/api/auth/session` through the proxy,
 * which is where a sign-out (or a switch of account) in another Medaris app is
 * noticed (MDRS-210); a session that ended under the page reloads it, so a
 * protected page goes to sign-in and a public one renders for the visitor
 * (MDRS-216). That replaces NextAuth's provider and the two components that
 * watched it, `RefreshErrorRedirect` and `KeycloakSessionWatch`: a failed
 * refresh now ends the session in the proxy, which redirects on the server.
 *
 * `DismissStaleSonnerToasts` takes the toasts from before the user's last
 * action off the screen when the pathname changes (MDRS-214).
 */
export function ClientProviders({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  const t = useTranslations("common");
  const pathname = usePathname() ?? "";

  return (
    <SessionProvider session={session}>
      <TimeZoneSync />
      <DismissStaleSonnerToasts routeKey={pathname} />
      {children}
      <Toaster closeLabel={t("toast.close")} />
    </SessionProvider>
  );
}
