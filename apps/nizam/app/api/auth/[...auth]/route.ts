import { handlers } from "~/lib/auth";

/**
 * `@medaris/auth`'s four routes behind one catch-all: `GET /api/auth/signin`
 * starts a sign-in, `GET /api/auth/callback/keycloak` takes Keycloak's answer
 * (the redirect URI the client has had since NextAuth), `POST
 * /api/auth/signout` ends the session here and at Keycloak, and `GET
 * /api/auth/session` serves the session without a token.
 */
export const { GET, POST } = handlers;
