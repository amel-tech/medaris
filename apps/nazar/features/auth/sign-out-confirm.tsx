"use client";

import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { keycloakSignOut } from "~/lib/keycloak-logout";

/**
 * Stands in for NextAuth's English "Are you sure you want to sign out?" page,
 * which `GET /api/auth/signout` renders (MDRS-101). It keeps the
 * confirmation step — signing out on a plain GET would let any page log the
 * visitor out — and signs out of Keycloak too, like the account page does.
 */
export function SignOutConfirm() {
  const t = useTranslations("nazir.Auth");
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await keycloakSignOut(session?.idToken);
    } catch {
      // The navigation to Keycloak never started; let the visitor try again.
      setBusy(false);
    }
  };

  return (
    <SystemState
      title={t("signOutTitle")}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={signOut}
            loading={busy}
            loadingLabel={t("signOutBusy")}
          >
            {t("signOutConfirm")}
          </Button>
          <Button href="/" variant="ghost">
            {t("signOutCancel")}
          </Button>
        </div>
      }
    >
      {t("signOutDescription")}
    </SystemState>
  );
}
