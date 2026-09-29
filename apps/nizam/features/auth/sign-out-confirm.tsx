"use client";

import { Button } from "@medaris/ui/components/button";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { keycloakSignOut } from "~/lib/keycloak-logout";

/**
 * Stands in for NextAuth's English "Are you sure you want to sign out?" page,
 * which `GET /api/auth/signout` renders (MDRS-101). It keeps the
 * confirmation step — signing out on a plain GET would let any page log the
 * visitor out — and signs out of Keycloak too, like the header menu does.
 */
export function SignOutConfirm() {
  const t = useTranslations("nizam");
  const locale = useLocale();
  const { data: session } = useSession();

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-brand-primary">
        {t("Auth.signOutTitle")}
      </h1>
      <p className="text-neutral-secondary">{t("Auth.signOutDescription")}</p>
      <div className="flex justify-center gap-2">
        <Button onClick={() => keycloakSignOut(session?.idToken)}>
          {t("Auth.signOutConfirm")}
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${locale}`}>{t("Auth.backHome")}</Link>
        </Button>
      </div>
    </section>
  );
}
