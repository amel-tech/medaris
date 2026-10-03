import type { AuthOptions } from "next-auth";

/**
 * Cookie names must stay out of `auth_options.ts` so middleware can import
 * them without pulling KeycloakProvider / openid-client into the Edge bundle.
 * App-specific names keep Nazır from colliding with Nizam and Tedris on
 * localhost (MDRS-24).
 */
const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith(
  "https://"
);
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const authCookies: AuthOptions["cookies"] = {
  sessionToken: {
    name: `${cookiePrefix}nazir.session-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  callbackUrl: {
    name: `${cookiePrefix}nazir.callback-url`,
    options: {
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  csrfToken: {
    name: `${useSecureCookies ? "__Host-" : ""}nazir.csrf-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  pkceCodeVerifier: {
    name: `${cookiePrefix}nazir.pkce.code_verifier`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: 60 * 15,
    },
  },
  state: {
    name: `${cookiePrefix}nazir.state`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: 60 * 15,
    },
  },
  nonce: {
    name: `${cookiePrefix}nazir.nonce`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
};
