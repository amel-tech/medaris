"use client";

import { signOut } from "@medaris/auth/client";
import { Button } from "@medaris/ui/mds/button";
import { SystemState } from "@medaris/ui/mds/system-state";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { localeOf } from "~/lib/i18n/locale";

/**
 * The sign-out page (`/auth/signout`, MDRS-101). It keeps the confirmation
 * step (signing out on a plain GET would let any page log the visitor out)
 * and signs out of Keycloak too, like the account page does: `signOut` posts
 * to `/api/auth/signout`, which reads the ID token on the server, so the
 * `id_token_hint` is never empty and Keycloak asks nothing of its own (B7,
 * MDRS-222).
 */
export function SignOutConfirm() {
  const t = useTranslations("nazar.Auth");
  const [busy, setBusy] = useState(false);

  const confirm = () => {
    setBusy(true);
    signOut({ locale: localeOf(document.documentElement.lang) });
  };

  return (
    <SystemState
      title={t("signOutTitle")}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={confirm}
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
