"use client";
import { Button } from "@medaris/ui/components/button";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { env } from "~/env";

const KeycloakLogoutButton = () => {
  const t = useTranslations("tedris");
  const session = useSession();
  const signOutWithRedirect = async () => {
    const idtoken = session.data?.idToken;
    const params = new URLSearchParams({
      client_id: env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "",
      post_logout_redirect_uri: env.NEXT_PUBLIC_NEXTAUTH_URL ?? "",
      id_token_hint: idtoken ?? "",
    });
    const keycloakLogoutUrl = `${env.NEXT_PUBLIC_KEYCLOAK_ISSUER}/protocol/openid-connect/logout?${params.toString()}`;
    await signOut({ redirect: false, callbackUrl: keycloakLogoutUrl });
    window.location.href = keycloakLogoutUrl;
  };
  return (
    <Button onClick={() => signOutWithRedirect()}>
      {t("KeycloakLogout.button")}
    </Button>
  );
};
const KeycloakLogout = () => {
  return (
    <SessionProvider>
      <KeycloakLogoutButton />
    </SessionProvider>
  );
};
export default KeycloakLogout;
