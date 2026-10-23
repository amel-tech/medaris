"use client";

import { signOut } from "@medaris/auth/client";
import { Button } from "@medaris/ui/mds/button";
import { Logo } from "@medaris/ui/mds/logo";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

/**
 * "Çıkış yapılsın mı?" (design medaris/16, nizam's side): the one confirmation
 * before a sign-out (MDRS-101). A card on its own page, outside the shell, as
 * the canvas draws it. It keeps the confirmation step — signing out on a plain
 * GET would let any page log the visitor out — and ends the Keycloak session
 * too: `signOut()` posts to `/api/auth/signout`, which reads the ID token from
 * the cookie for `id_token_hint` (it no longer passes through the browser,
 * B7) and asks Keycloak for its page in this locale. "Vazgeç" goes back to
 * where the person came from, the home page when there is nowhere to go back
 * to.
 */
export function SignOutConfirm() {
  const t = useTranslations("nizam.SignOutPage");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const headingId = useId();

  const confirm = () => {
    setBusy(true);
    signOut({ locale });
  };
  const cancel = () => {
    if (window.history.length > 1) router.back();
    else router.push(`/`);
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
