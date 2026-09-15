import { createAccessTokenReader } from "@medaris/services/auth";
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { type AuthOptions, getServerSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import KeycloakProvider from "next-auth/providers/keycloak";
import { env } from "~/env";
import { authCookies } from "~/lib/auth_cookies";

/**
 * Takes a token, and returns a new token with updated
 * `accessToken`  If an error occurs,
 * returns the old token and an error property
 */
/**
 * @param  {JWT} token
 */
/**
 * Keycloak reports `refresh_expires_in: 0` for a refresh token that does not
 * expire on its own, and omits the field entirely under some client configs.
 * Both must read as "no deadline" — arithmetic on them produces a timestamp in
 * the past or `NaN`, and treating that as an expiry killed every session the
 * moment its access token aged out. `undefined` is the only encoding of "no
 * deadline" the guard below can read.
 */
const refreshDeadline = (expiresIn: number | undefined) =>
  typeof expiresIn === "number" && expiresIn > 0
    ? Date.now() + (expiresIn - 15) * 1000
    : undefined;

const refreshAccessToken = async (token: JWT) => {
  try {
    if (
      typeof token.refreshTokenExpireIn === "number" &&
      Date.now() > token.refreshTokenExpireIn
    ) {
      throw new Error("refresh token expired");
    }

    const url = `${env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      method: "POST",
      body: new URLSearchParams({
        client_id: env.KEYCLOAK_CLIENT_ID ?? "",
        client_secret: env.KEYCLOAK_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) throw refreshedTokens;

    return {
      ...token,
      // A previous failed refresh left `error` on the token, and the spread
      // would carry it forward for the rest of the session even though this
      // refresh succeeded — `getAccessToken()` fails closed on `error`, so a
      // stale flag would lock the user out of every server call until sign-out.
      // `error` describes the most recent attempt only.
      error: undefined,
      accessToken: refreshedTokens.access_token,
      accessTokenExpired: Date.now() + (refreshedTokens.expires_in - 15) * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      refreshTokenExpireIn: refreshDeadline(refreshedTokens.refresh_expires_in),
    };
  } catch (error) {
    console.log("refreshToken error: ", error);

    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
};

/**
 * Cookie names live in `auth_cookies.ts` so Edge middleware can reuse them
 * without importing this file (KeycloakProvider breaks the Edge bundle).
 * See MDRS-24.
 */
const authOptions: AuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: env.KEYCLOAK_CLIENT_ID ?? "",
      clientSecret: env.KEYCLOAK_CLIENT_SECRET ?? "",
      issuer: env.KEYCLOAK_ISSUER ?? "",
      idToken: true,
    }),
  ],
  cookies: authCookies,
  callbacks: {
    /**
     * Lets the sign-out navigation reach Keycloak's end-session endpoint.
     *
     * NextAuth's default `redirect` returns `baseUrl` for any off-origin URL,
     * so `signOut({ callbackUrl: <end-session URL> })` was silently dropped and
     * signing out never left this origin: Keycloak kept its SSO cookie, and the
     * next "Sign in" click let the same account back in with no password. The
     * issuer's origin is the one exception this app needs; everything else off
     * origin still collapses to `baseUrl`. See lib/keycloak-logout.ts.
     */
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;

      let target: URL;
      try {
        target = new URL(url);
      } catch {
        return baseUrl;
      }

      if (target.origin === new URL(baseUrl).origin) return url;

      const issuer = env.KEYCLOAK_ISSUER;
      if (issuer && target.origin === new URL(issuer).origin) return url;

      return baseUrl;
    },
    async jwt({ token, user, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.accessTokenExpired = (account.expires_at - 15) * 1000;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        // remove 15 seconds to avoid edge cases
        token.refreshTokenExpireIn = refreshDeadline(
          account.refresh_expires_in
        );
        token.user = user;
        return token;
      }

      if (Date.now() < token.accessTokenExpired) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      // accessToken is intentionally kept off the client-visible session —
      // any script on the page could read it via GET /api/auth/session
      // otherwise. Server code reads it through getAccessToken() below.
      // See MDRS-28.
      session.idToken = token.idToken as string;
      // The failure flag, not the token. The client cannot recover a dead
      // session on its own, and without this it learns nothing: the next server
      // call throws and surfaces as an unexplained runtime error instead of a
      // trip back to Keycloak. See ClientProviders.
      session.error = token.error;
      return session;
    },
  },
};
export default authOptions;

export function auth(
  ...args:
    | [GetServerSidePropsContext["req"], GetServerSidePropsContext["res"]]
    | [NextApiRequest, NextApiResponse]
    | []
) {
  return getServerSession(...args, authOptions);
}

/**
 * Reads the Keycloak access token straight out of the encrypted session
 * JWT. Server-only — the token never enters the client-visible `Session`
 * object `auth()` returns. See MDRS-28.
 *
 * The implementation is shared with the other web app through
 * `@medaris/services/auth`; only the three app-local values are supplied here.
 * It refreshes an expired token through this file's `refreshAccessToken`, the
 * same function the `jwt` callback uses, returns `undefined` once a refresh has
 * failed, and is memoized per request.
 */
export const getAccessToken = createAccessTokenReader<JWT>({
  secret: env.NEXTAUTH_SECRET,
  cookieName: authCookies?.sessionToken?.name,
  refresh: refreshAccessToken,
});
