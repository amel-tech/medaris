/**
 * The session as server code and the browser see it: who is signed in, and
 * until when. Never a token: the access, refresh and ID tokens stay inside the
 * encrypted cookie and only server code reads them (MDRS-28, RFC 10017 §6.1).
 *
 * Plain data on purpose, so a server layout can hand it to the client
 * `SessionProvider` as a prop and `/api/auth/session` can serve it as JSON.
 */

/** The signed-in account: identity claims from the ID token, nothing else. */
export interface SessionUser {
  /** The IdP's subject for the account. */
  sub: string;
  name?: string;
  email?: string;
  /** The `preferred_username` claim. */
  username?: string;
  /** The account's `locale` claim, when the IdP sends one. */
  locale?: string;
  /** The `picture` claim, when the IdP sends one (tedris draws it as the avatar). */
  image?: string;
}

/** What `auth()` returns and `GET /api/auth/session` serves; `null` is a visitor. */
export interface Session {
  user: SessionUser;
  /**
   * Epoch milliseconds until which the server holds a usable access token.
   * `proxy.ts` renews it before then, so this is a hint, not a deadline the
   * page has to act on.
   */
  expiresAt: number;
}
