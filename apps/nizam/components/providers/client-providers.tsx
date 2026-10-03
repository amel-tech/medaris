"use client";

import {
  KeycloakSessionWatch,
  RefreshErrorRedirect,
} from "@medaris/services/auth-client";
import {
  DismissStaleSonnerToasts,
  Toaster,
} from "@medaris/ui/components/sonner";
import { AppProviders } from "@medaris/ui/mds/app-providers";
import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { TimeZoneSync } from "./time-zone-sync";

/**
 * `RefreshErrorRedirect` is shared with the other web app through
 * `@medaris/services/auth-client` — it is the client half of the same refresh
 * contract `createAccessTokenReader` implements on the server, and the
 * `RefreshAccessTokenError` sentinel it compares against is produced by this
 * app's own `refreshAccessToken`. The locale is the only app-local input.
 *
 * `KeycloakSessionWatch` is its counterpart for a session Keycloak has ended
 * — a sign-out or a switch of account in another Medaris app (MDRS-210): it
 * reloads the page so the server renders it without the ended session.
 *
 * `DismissStaleSonnerToasts` takes the toasts from before the user's last
 * action off the screen when the pathname changes (MDRS-214). `AppProviders`
 * (the unified kit's root and its `Toaster`) sits here rather than in the
 * server layout so it can take the pathname as its `routeKey` too.
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const pathname = usePathname() ?? "";

  return (
    <SessionProvider>
      <RefreshErrorRedirect locale={locale} />
      <KeycloakSessionWatch />
      <TimeZoneSync />
      <DismissStaleSonnerToasts routeKey={pathname} />
      <AppProviders toaster routeKey={pathname}>
        {children}
      </AppProviders>
      <Toaster closeLabel={t("toast.close")} />
    </SessionProvider>
  );
}
