"use client";

import { type Session, SessionProvider } from "@medaris/auth/client";
import {
  DismissStaleSonnerToasts,
  Toaster,
} from "@medaris/ui/components/sonner";
import { AppProviders } from "@medaris/ui/mds/app-providers";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { htmlLangDir } from "~/lib/i18n/direction";
import type { MadrasahLocale } from "~/lib/i18n/routing";
import { TimeZoneSync } from "./time-zone-sync";

/**
 * `SessionProvider` (`@medaris/auth/client`) holds the session the server
 * layout read, without a token. It replaces NextAuth's provider and the two
 * watchers that sat beside it: `RefreshErrorRedirect`, since the server now
 * sends an ended session to sign-in itself (and it could loop between the
 * sign-in page and Keycloak, B2), and `KeycloakSessionWatch`, since the
 * provider reloads the page when a tab shown again finds the session ended or
 * switched by another Medaris app (MDRS-210).
 *
 * `DismissStaleSonnerToasts` takes the toasts from before the user's last
 * action off the screen when the pathname changes (MDRS-214). `AppProviders`
 * (the unified kit's root and its `Toaster`) sits here rather than in the
 * server layout so it can take the pathname as its `routeKey` too, and the
 * route's direction (MDRS-242): Base UI positions menus and runs arrow keys by
 * it, and `<html dir>` alone does not reach it.
 */
export function ClientProviders({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const pathname = usePathname() ?? "";

  return (
    <SessionProvider session={session}>
      <TimeZoneSync />
      <DismissStaleSonnerToasts routeKey={pathname} />
      <AppProviders
        toaster
        routeKey={pathname}
        direction={htmlLangDir(locale as MadrasahLocale).dir}
      >
        {children}
      </AppProviders>
      <Toaster closeLabel={t("toast.close")} />
    </SessionProvider>
  );
}
