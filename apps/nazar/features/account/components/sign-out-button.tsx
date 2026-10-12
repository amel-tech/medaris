"use client";

import { signOut } from "@medaris/auth/client";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useState } from "react";
import { LOCALE } from "~/lib/i18n/locale";

/**
 * "Çıkış yap" (nazir 20): ends nazar's session and Keycloak's. `signOut`
 * posts to `/api/auth/signout`, which reads the ID token on the server for the
 * `id_token_hint` and comes back to `/`, behind the session, so the person
 * ends on Keycloak's form. The sentence above the button says what it does;
 * the canvas has no separate confirmation window for Nazar (the page at
 * `/auth/signout` is the confirming one).
 */
export function SignOutButton({
  label,
  busy,
}: {
  label: string;
  busy: string;
}) {
  const [signingOut, setSigningOut] = useState(false);

  const leave = () => {
    setSigningOut(true);
    signOut({ locale: LOCALE });
  };

  return (
    <Button
      variant="secondary"
      iconLeft={<Icon name="signOut" size="sm" />}
      onClick={leave}
      loading={signingOut}
      loadingLabel={busy}
    >
      {label}
    </Button>
  );
}
