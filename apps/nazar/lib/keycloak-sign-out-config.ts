"use server";

import type { KeycloakSignOutConfig } from "@medaris/services/auth-client";
import { env } from "~/env";

/**
 * The three public OIDC values the browser needs to end the Keycloak session,
 * read on the server at request time (MDRS-86).
 *
 * They used to be `NEXT_PUBLIC_*` keys, which Next inlines into the client
 * bundle at `next build` — so the image carried one environment's client id
 * and origin, and a second environment meant a second build. Served from a
 * server action instead, the same image runs everywhere and the values come
 * from the container's environment like every other key. None of the three
 * is a secret: they are what the browser sends to Keycloak's end-session
 * endpoint anyway.
 */
export async function getKeycloakSignOutConfig(): Promise<KeycloakSignOutConfig> {
  return {
    clientId: env.KEYCLOAK_CLIENT_ID,
    issuer: env.KEYCLOAK_ISSUER,
    postLogoutRedirectUri: env.NEXTAUTH_URL,
  };
}
