import type { AuthOptions } from "next-auth";

/**
 * Cookie names must stay out of `auth_options.ts` so middleware can import
 * them without pulling KeycloakProvider / openid-client into the Edge bundle.
 * App-specific names avoid Nizam/Tedris colliding on localhost (MDRS-24).
 */
const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith(
  "https://"
);
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

export const authCookies: AuthOptions["cookies"] = {
  sessionToken: {
    name: `${cookiePrefix}nizam.session-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  callbackUrl: {
    name: `${cookiePrefix}nizam.callback-url`,
    options: {
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  csrfToken: {
    name: `${useSecureCookies ? "__Host-" : ""}nizam.csrf-token`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
    },
  },
  pkceCodeVerifier: {
    name: `${cookiePrefix}nizam.pkce.code_verifier`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: 60 * 15,
    },
  },
  state: {
    name: `${cookiePrefix}nizam.state`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: 60 * 15,
    },
  },
  nonce: {
    name: `${cookiePrefix}nizam.nonce`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  },
};
