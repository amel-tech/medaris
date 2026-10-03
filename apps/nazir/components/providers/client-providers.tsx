"use client";

import { RefreshErrorRedirect } from "@medaris/services/auth-client";
import { AppProviders } from "@medaris/ui/mds/app-providers";
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
 * `AppProviders` is the unified kit's root (canvas rule 3): the `isolate`
 * wrapper, the direction, the tooltip delay and the one `Toaster`.
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  const locale = useLocale();

  return (
    <SessionProvider>
      <RefreshErrorRedirect locale={locale} />
      <AppProviders>{children}</AppProviders>
    </SessionProvider>
  );
}
