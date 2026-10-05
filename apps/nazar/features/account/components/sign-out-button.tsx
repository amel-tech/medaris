"use client";

import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { keycloakSignOut } from "~/lib/keycloak-logout";

/**
 * "Çıkış yap" (nazir 20): ends the NextAuth session and Keycloak's, through
 * the helper the other apps share. The sentence above the button says what it
 * does; the canvas has no separate confirmation window for Nazar, and the
 * sign-out page at `/auth/signout` is NextAuth's own `GET` target, not this.
 */
export function SignOutButton({
  label,
  busy,
}: {
  label: string;
  busy: string;
}) {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await keycloakSignOut(session?.idToken);
    } catch {
      // The navigation to Keycloak never started; let the person try again.
      setSigningOut(false);
    }
  };

  return (
    <Button
      variant="secondary"
      iconLeft={<Icon name="signOut" size="sm" />}
      onClick={signOut}
      loading={signingOut}
      loadingLabel={busy}
    >
      {label}
    </Button>
  );
}
