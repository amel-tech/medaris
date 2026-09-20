"use client";

import { RefreshErrorRedirect } from "@medaris/services/auth-client";
import { Toaster } from "@medaris/ui/components/sonner";
import { SessionProvider } from "next-auth/react";
import { useLocale } from "next-intl";

/**
 * `RefreshErrorRedirect` is shared with the other web app through
 * `@medaris/services/auth-client` — it is the client half of the same refresh
 * contract `createAccessTokenReader` implements on the server, and the
 * `RefreshAccessTokenError` sentinel it compares against is produced by this
 * app's own `refreshAccessToken`. The locale is the only app-local input.
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();

  return (
    <SessionProvider>
      <RefreshErrorRedirect locale={locale} />
      {children}
      <Toaster />
    </SessionProvider>
  );
}
