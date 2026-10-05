import type { AuthOptions } from "next-auth";

/**
 * Cookie names must stay out of `auth_options.ts` so middleware can import
 * them without pulling KeycloakProvider / openid-client into the Edge bundle.
 * App-specific names keep Nazar from colliding with Nizam and Tedris on
 * localhost (MDRS-24).
 */
const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith(
  "https://"
);
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const authCookies: AuthOptions["cookies"] = {
  sessionToken: {
    name: `${cookiePrefix}nazar.session-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  callbackUrl: {
    name: `${cookiePrefix}nazar.callback-url`,
    options: {
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  csrfToken: {
    name: `${useSecureCookies ? "__Host-" : ""}nazar.csrf-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  pkceCodeVerifier: {
    name: `${cookiePrefix}nazar.pkce.code_verifier`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: 60 * 15,
    },
  },
  state: {
    name: `${cookiePrefix}nazar.state`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: 60 * 15,
    },
  },
  nonce: {
    name: `${cookiePrefix}nazar.nonce`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
};
