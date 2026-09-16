import { createKeycloakSignOut } from "@medaris/services/auth-client";
import { env } from "~/env";

/**
 * Ends both sessions: NextAuth's cookie and Keycloak's SSO session.
 *
 * The implementation is shared with the other web app through
 * `@medaris/services/auth-client` — the two copies of this file were
 * byte-identical, down to the comment explaining the `callbackUrl` race, and
 * only these three values were ever app-local.
 */
export const keycloakSignOut = createKeycloakSignOut({
  clientId: env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "",
  issuer: env.NEXT_PUBLIC_KEYCLOAK_ISSUER ?? "",
  postLogoutRedirectUri: env.NEXT_PUBLIC_NEXTAUTH_URL ?? "",
});
