"use client";

import { signIn } from "@medaris/auth/client";
import { Button } from "@medaris/ui/components/button";
import { useLocale, useTranslations } from "next-intl";
import { homePath } from "~/lib/auth_pages";

/**
 * "Giriş yap" and "Kayıt ol" side by side (MDRS-101). Both end on Ana sayfa
 * (`/<locale>`), with no first-login step in between. "Kayıt ol" opens
 * Keycloak's registration form directly. A click takes the sign-in over any
 * tab waiting for its turn (#180).
 */
const KeycloakLogin = () => {
  const t = useTranslations("tedris");
  const locale = useLocale();
  const callbackUrl = homePath(locale);

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={() => signIn({ intent: "signin", callbackUrl, locale })}
      >
        {t("Auth.signIn")}
      </Button>
      <Button
        onClick={() => signIn({ intent: "register", callbackUrl, locale })}
      >
        {t("Auth.register")}
      </Button>
    </div>
  );
};

export default KeycloakLogin;
