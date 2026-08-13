import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { type AuthOptions, getServerSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import KeycloakProvider from "next-auth/providers/keycloak";
import { env } from "~/env";

/**
 * Takes a token, and returns a new token with updated
 * `accessToken`  If an error occurs,
 * returns the old token and an error property
 */
/**
 * @param  {JWT} token
 */
const refreshAccessToken = async (token: JWT) => {
  try {
    if (Date.now() > token.refreshTokenExpireIn) throw Error;

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
      accessToken: refreshedTokens.access_token,
      accessTokenExpired: Date.now() + (refreshedTokens.expires_in - 15) * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      refreshTokenExpireIn:
        Date.now() + (refreshedTokens.refresh_expires_in - 15) * 1000,
    };
  } catch (error) {
    console.log("refreshToken error: ", error);

    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
};

const useSecureCookies = env.NEXTAUTH_URL.startsWith("https://");
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

/**
 * Nizam and Tedris share `localhost` as a cookie domain in local dev, so
 * NextAuth's default cookie names (`next-auth.*`) collide between the two
 * apps and logging into one drops the other's session. App-specific names
 * keep the cookies isolated. See MDRS-24.
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
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}tedris.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}tedris.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `${useSecureCookies ? "__Host-" : ""}tedris.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}tedris.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15,
      },
    },
    state: {
      name: `${cookiePrefix}tedris.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 60 * 15,
      },
    },
    nonce: {
      name: `${cookiePrefix}tedris.nonce`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.accessTokenExpired = (account.expires_at - 15) * 1000;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        // remove 15 seconds to avoid edge cases
        token.refreshTokenExpireIn =
          Date.now() + (account.refresh_expires_in - 15) * 1000;
        token.user = user;
        return token;
      }

      if (Date.now() < token.accessTokenExpired) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.idToken = token.idToken as string;
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
