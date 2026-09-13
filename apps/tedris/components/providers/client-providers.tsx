"use client";

import { Toaster } from "@medaris/ui/components/sonner";
import { SessionProvider, signIn, useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { useEffect } from "react";

/**
 * A session whose refresh failed still exists as a cookie, so nothing signs the
 * user out — the next server call simply fails, and the page reports it as an
 * unexpected server response. Send them back to Keycloak instead: it is the
 * only place the session can actually be renewed, and a silent redirect is what
 * an expired session is supposed to look like.
 */
const RefreshErrorRedirect = () => {
  const { data: session } = useSession();
  const locale = useLocale();

  useEffect(() => {
    if (session?.error !== "RefreshAccessTokenError") return;
    signIn("keycloak", { redirect: true }, { ui_locales: locale });
  }, [session?.error, locale]);

  return null;
};

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <RefreshErrorRedirect />
      {children}
      <Toaster />
    </SessionProvider>
  );
}
