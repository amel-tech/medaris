"use client";

import {
  KeycloakSessionWatch,
  RefreshErrorRedirect,
} from "@medaris/services/auth-client";
import { AppProviders } from "@medaris/ui/mds/app-providers";
import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

/**
 * `RefreshErrorRedirect` is shared with the other web apps through
 * `@medaris/services/auth-client` — it is the client half of the same refresh
 * contract `createAccessTokenReader` implements on the server, and the
 * `RefreshAccessTokenError` sentinel it compares against is produced by this
 * app's own `refreshAccessToken`. The locale is the only app-local input.
 *
 * `KeycloakSessionWatch` is its counterpart for a session Keycloak has ended
 * — a sign-out or a switch of account in another Medaris app (MDRS-210): it
 * reloads the page so the server renders it without the ended session.
 *
 * `AppProviders` is the unified kit's root (canvas rule 3): the `isolate`
 * wrapper, the direction, the tooltip delay and the one `Toaster`. Its
 * `routeKey` closes the toasts from before the user's last action when the
 * pathname changes (MDRS-214).
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const pathname = usePathname() ?? "";

  return (
    <SessionProvider>
      <RefreshErrorRedirect locale={locale} />
      <KeycloakSessionWatch />
      <AppProviders routeKey={pathname}>{children}</AppProviders>
    </SessionProvider>
  );
}
