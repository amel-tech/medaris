"use client";

import {
  KeycloakSessionWatch,
  RefreshErrorRedirect,
} from "@medaris/services/auth-client";
import { Toaster } from "@medaris/ui/components/sonner";
import { SessionProvider } from "next-auth/react";
import { useLocale } from "next-intl";
import { isPublicPath } from "~/lib/public-paths";
import { TimeZoneSync } from "./time-zone-sync";

/**
 * `RefreshErrorRedirect` is shared with the other web app through
 * `@medaris/services/auth-client` — it is the client half of the same refresh
 * contract `createAccessTokenReader` implements on the server, and the
 * `RefreshAccessTokenError` sentinel it compares against is produced by this
 * app's own `refreshAccessToken`. The locale and the middleware's list of
 * public pages are the app-local inputs: on a public page a failed refresh
 * leaves the visitor where they are, signed out (MDRS-216).
 *
 * `KeycloakSessionWatch` is its counterpart for a session Keycloak has ended
 * — a sign-out or a switch of account in another Medaris app (MDRS-210): it
 * reloads the page so the server renders it without the ended session.
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();

  return (
    <SessionProvider>
      <RefreshErrorRedirect locale={locale} isPublicPath={isPublicPath} />
      <KeycloakSessionWatch />
      <TimeZoneSync />
      {children}
      <Toaster />
    </SessionProvider>
  );
}
