"use client";

import { Button } from "@medaris/ui/mds/button";
import { Logo } from "@medaris/ui/mds/logo";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { keycloakSignOut } from "~/lib/keycloak-logout";

/**
 * "Çıkış yapılsın mı?" (design medaris/16, nizam's side): the one confirmation
 * before a sign-out, and the page `pages.signOut` points NextAuth at
 * (MDRS-101). A card on its own page, outside the shell, as the canvas draws
 * it. It stands in for NextAuth's English "Are you sure you want to sign out?"
 * page and keeps the confirmation step — signing out on a plain GET would let
 * any page log the visitor out — and ends the Keycloak session too. "Vazgeç"
 * goes back to where the person came from, the home page when there is
 * nowhere to go back to.
 */
export function SignOutConfirm() {
  const t = useTranslations("nizam.SignOutPage");
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const headingId = useId();

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await keycloakSignOut(session?.idToken);
    } catch {
      // the sign-out config or NextAuth call failed: let the person try again
      setFailed(true);
      setBusy(false);
    }
  };
  const cancel = () => {
    if (window.history.length > 1) router.back();
    else router.push(`/${locale}`);
  };

  return (
    <main
      aria-labelledby={headingId}
      className="grid min-block-screen place-items-center px-gutter py-10"
    >
      <div className="flex inline-full max-inline-[27.5rem] flex-col gap-4 rounded-surface border border-neutral-subtle bg-neutral-surface p-8">
        <Logo wordmark />
        <h1 id={headingId} className="mds-h2">
          {t("title")}
        </h1>
        <p className="mds-body">{t("body")}</p>
        {failed ? (
          <p role="alert" className="mds-body text-danger-strong">
            {t("failed")}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 pbs-2">
          <Button
            fullWidth
            size="large"
            loading={busy}
            loadingLabel={t("busy")}
            onClick={confirm}
          >
            {t("confirm")}
          </Button>
          <Button
            fullWidth
            size="large"
            variant="ghost"
            disabled={busy}
            onClick={cancel}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    </main>
  );
}
