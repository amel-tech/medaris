import { createKeycloakSignOut } from "@medaris/services/auth-client";
import { getKeycloakSignOutConfig } from "~/lib/keycloak-sign-out-config";

/**
 * Ends both sessions: NextAuth's cookie and Keycloak's SSO session.
 *
 * The implementation is shared with the other web app through
 * `@medaris/services/auth-client`; the three app-local values arrive from the
 * `getKeycloakSignOutConfig` server action rather than from `NEXT_PUBLIC_*`
 * keys (MDRS-86), so nothing environment-specific is inlined into the bundle.
 * The config fetch happens before `signOut()`, so the single-step navigation
 * that keycloak-sign-out.ts relies on is unchanged.
 */
export const keycloakSignOut = async (idToken?: string): Promise<void> =>
  createKeycloakSignOut(await getKeycloakSignOutConfig())(idToken);
