import { handlers } from "~/lib/auth";

/**
 * The four auth routes: `GET /api/auth/signin` starts a sign-in,
 * `GET /api/auth/callback/keycloak` takes Keycloak's answer (the redirect URI
 * the client has registered since next-auth), `POST /api/auth/signout` ends
 * the session here and at Keycloak, `GET /api/auth/session` is the
 * client-safe session. Anything else under `/api/auth` is a 404.
 */
export const { GET, POST } = handlers;
