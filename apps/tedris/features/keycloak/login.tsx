"use client";

import { keycloakSignIn } from "@medaris/services/auth-client";
import { Button } from "@medaris/ui/components/button";
import { useLocale, useTranslations } from "next-intl";
import { postSignInPage } from "~/lib/auth_pages";

/**
 * "Giriş yap" and "Kayıt ol" side by side (MDRS-101). Both name no page to
 * come back to, so both end on `/start`, which picks the first-login screen
 * or `/learning`. "Kayıt ol" opens Keycloak's registration form directly.
 */
const KeycloakLogin = () => {
  const t = useTranslations("tedris");
  const locale = useLocale();
  const callbackUrl = `/${locale}${postSignInPage}`;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={() =>
          keycloakSignIn({ intent: "signin", callbackUrl, locale })
        }
      >
        {t("Auth.signIn")}
      </Button>
      <Button
        onClick={() =>
          keycloakSignIn({ intent: "register", callbackUrl, locale })
        }
      >
        {t("Auth.register")}
      </Button>
    </div>
  );
};

export default KeycloakLogin;
