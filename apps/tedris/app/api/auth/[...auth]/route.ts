import { handlers } from "~/lib/auth";

/**
 * `@medaris/auth`'s four routes behind one catch-all: `GET /api/auth/signin`
 * starts a sign-in, `GET /api/auth/callback/keycloak` takes Keycloak's answer
 * (the redirect URI the client has registered since NextAuth), `POST
 * /api/auth/signout` ends the session here and at Keycloak, and
 * `GET /api/auth/session` serves the client-safe session. Anything else under
 * `/api/auth` is a 404.
 */
export const GET = handlers.GET;
export const POST = handlers.POST;
