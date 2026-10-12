"use client";

import { signOut } from "@medaris/auth/client";
import { Button } from "@medaris/ui/mds/button";
import { Logo } from "@medaris/ui/mds/logo";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";

/**
 * The app's one sign-out confirmation (design medaris/16, d-1001-33). The user
 * menu and the account page go through it instead of signing out on a click.
 * Confirming ends both sessions, this app's and Keycloak's: `signOut` posts to
 * `/api/auth/signout`, which reads the ID token for `id_token_hint` on the
 * server (it never reaches the browser), clears the cookie and goes on to
 * Keycloak's end-session page in the visitor's language (MDRS-222), and from
 * there back to this app. "Vazgeç" goes back to where the visitor came from.
 */
export function SignOutConfirm() {
  const t = useTranslations("tedris");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const titleId = useId();

  const confirm = () => {
    setBusy(true);
    try {
      signOut({ locale });
    } catch (error) {
      // The form never left: let the button be pressed again.
      console.error("Sign-out failed:", error);
      setBusy(false);
    }
  };

  // "Previous page": history when there is one, the home page when the
  // confirmation was opened directly in a fresh tab.
  const cancel = () => {
    if (window.history.length > 1) router.back();
    else router.push(`/${locale}/home`);
  };

  return (
    <section
      aria-labelledby={titleId}
      className="font-ui grid place-items-center px-gutter py-8"
    >
      <div className="flex inline-full max-inline-[440px] flex-col gap-6 rounded-surface border border-neutral-subtle bg-neutral-surface p-8 max-md:border-0 max-md:bg-transparent max-md:p-5">
        <div className="flex flex-col items-start gap-4">
          <Logo size="lg" wordmark arabic={false} />
          <div className="flex flex-col gap-2">
            <h1 className="mds-h2" id={titleId}>
              {t("Auth.signOutTitle")}
            </h1>
            <p className="mds-body">{t("Auth.signOutDescription")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            size="large"
            fullWidth
            loading={busy}
            loadingLabel={t("Auth.signingOut")}
            onClick={confirm}
          >
            {t("Auth.signOutConfirm")}
          </Button>
          <Button
            size="large"
            variant="ghost"
            fullWidth
            disabled={busy}
            onClick={cancel}
          >
            {t("Auth.signOutCancel")}
          </Button>
        </div>
      </div>
    </section>
  );
}
