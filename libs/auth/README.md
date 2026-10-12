# @medaris/auth

One OIDC session for the web apps (tedris, nazar, nizam), built on
[openid-client](https://github.com/panva/openid-client) v6 and
[jose](https://github.com/panva/jose) v6. It replaces next-auth 4 one app at a
time; an app drops next-auth when it moves.

What it does, and where:

| Concern | Where | Notes |
| -- | -- | -- |
| Start a sign-in | `GET /api/auth/signin` | PKCE S256, `state`, `nonce`; `ui_locales` (+ `kc_locale`); `intent=register` → `prompt=create` |
| Finish it | `GET /api/auth/callback/keycloak` | the redirect URI the Keycloak clients already have |
| Sign out | `POST /api/auth/signout` | `id_token_hint` read on the server, never empty |
| Client-safe session | `GET /api/auth/session` | `{ user, expiresAt }` or `null`; no token |
| Refresh, SSO check, gate | the app's `proxy.ts` | the only place a session changes |
| Server reads | `auth()`, `getAccessToken()`, `requireSession()`, `requireAccessToken()`, `withAccessToken()` | read only, once per request |
| Client | `SessionProvider`, `useSession()`, `signIn()`, `enterSignIn()`, `signOut()`, `handleUnauthenticated()` | no token reaches client JS |

The login page stays the IdP's (no ROPC, no iframe). Every IdP endpoint comes
from OIDC discovery; the only Keycloak-specific parameter, `kc_locale`, is
behind the `kcLocale` option.

## Entry points

- `@medaris/auth/server`: `createAuth()` and the types. Starts with
  `import "server-only"`, so a client component that imports it fails the
  build.
- `@medaris/auth/client`: `"use client"` and `import "client-only"`. A server
  layout may render its `SessionProvider`; nothing else in it runs on the
  server.

Both export `isUnauthenticated` and the `Session` / `SessionUser` types.

## Wiring an app

Dependencies: `"@medaris/auth": "workspace:*"` in the app's `package.json`,
`"@medaris/auth"` in `transpilePackages` (`next.config.js`), a
`{ "path": "../../libs/auth" }` reference in its `tsconfig.json`. Remove
`next-auth`, `lib/auth_options.ts`, `lib/auth_cookies.ts`, `next-auth.d.ts`,
`middleware.ts` and `app/api/auth/[...nextauth]/route.ts` in the same change.

### `lib/auth.ts`

```ts
import { createAuth } from "@medaris/auth/server";
import { env } from "~/env";

export const {
  auth,
  getAccessToken,
  requireSession,
  requireAccessToken,
  withAccessToken,
  redirectToSignIn,
  signInUrl,
  handlers,
  proxy,
} = createAuth({
  issuer: env.KEYCLOAK_ISSUER,
  clientId: env.KEYCLOAK_CLIENT_ID,
  clientSecret: env.KEYCLOAK_CLIENT_SECRET,
  baseUrl: env.NEXTAUTH_URL,
  secret: env.NEXTAUTH_SECRET,
  cookiePrefix: "nazar",
  pages: { signIn: "/auth/signin" },
  kcLocale: true,
});
```

tedris and nizam keep the visitor's locale on the way to sign-in (MDRS-274) by
building the page from the return path, and say where a sign-in that names no
page ends:

```ts
const localeOf = (path: string | null) =>
  locales.find((l) => path?.split("/")[1] === l) ?? routing.defaultLocale;

pages: {
  signIn: (returnTo) => `/${localeOf(returnTo)}/auth/signin`,
  afterSignIn: (locale) => `/${locale ?? "tr"}/start`, // nizam: `/${locale ?? "tr"}`
},
locales,
```

`afterSignOut` (default `/`) is where a sign-out lands when it cannot reach the
IdP. `postLogoutRedirectUri` defaults to `baseUrl` exactly as given, which is
what the Keycloak clients have registered today.

### Route handlers

One catch-all file, `app/api/auth/[...auth]/route.ts`:

```ts
import { handlers } from "~/lib/auth";
export const { GET, POST } = handlers;
```

or one file per route (`signin/route.ts` → `export const GET = handlers.signIn`,
`callback/keycloak/route.ts` → `handlers.callback`, `signout/route.ts` →
`export const POST = handlers.signOut`, `session/route.ts` → `handlers.session`).

### `proxy.ts` (replaces `middleware.ts`)

nazar, no locale routing:

```ts
import type { NextRequest } from "next/server";
import { proxy as authProxy } from "~/lib/auth";

export default function proxy(request: NextRequest) {
  return authProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/|auth/|api/auth/(?:signin|signout|callback)(?:/|$)|.*\\.(?:ico|png|jpe?g|gif|svg|webp|txt|xml|webmanifest|woff2?|ttf|otf|map)$).*)",
  ],
};
```

tedris and nizam hand page requests on to next-intl and name their public pages:

```ts
const intl = createIntlMiddleware(routing);

export default function proxy(request: NextRequest) {
  return authProxy(request, { isPublicPath, next: intl });
}
```

Matcher guidance:

- Anchor every exclusion with a slash or `$` (nazar's form): an unanchored
  `api|_next` also skips `/apiary` and `/_nextthing` (B11).
- Exclude static files by extension, not "any path with a dot": a protected
  route with a dot in it would otherwise skip the gate and the refresh.
- Do **not** exclude `/api/auth/session`: a tab regaining focus reads it, and
  that read is where a sign-out in another app is noticed (MDRS-210). Keep the
  app's own `/api/…` routes in the matcher too; they are refreshed but never
  redirected. Excluding `/api/auth/(signin|signout|callback)` only saves work:
  the helper leaves them alone anyway.
- Excluded paths get no refresh. A Server Component on one of them that reads
  an expired token sees a visitor.

### Layout and client providers

```tsx
// app/layout.tsx (server)
import { auth } from "~/lib/auth";
// …
<ClientProviders session={await auth()}>{children}</ClientProviders>

// components/providers/client-providers.tsx
"use client";
import { type Session, SessionProvider } from "@medaris/auth/client";
export function ClientProviders({ session, children }: { session: Session | null; children: React.ReactNode }) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
```

`SessionProvider` replaces next-auth's `SessionProvider`, and with it
`RefreshErrorRedirect` (the server redirects now) and `KeycloakSessionWatch`
(it reloads the page itself when a focus read finds the session ended or
switched). `useSession()` gives `{ status, session, user, refresh }`; there is
no `"loading"`, and no `idToken`.

### The sign-in page

The page keeps its look; its client body calls `enterSignIn`:

```ts
const outcome = await enterSignIn(
  { intent, callbackUrl, locale },
  error,                    // the page's ?error=
  browserSignInDeps()
);
if (outcome === "show-error") setFailed(true);
// the button: signIn({ intent, callbackUrl, locale })
```

`authErrorMessageKey(error)` picks the `Auth.*` message, as before. The codes
are next-auth's (`OAuthSignin`, `OAuthCallback`, `AccessDenied`,
`Configuration`) plus `SignInLimit`. Header buttons call `signIn({ callbackUrl:
<this page>, locale })`, so signing in from a public page comes back to it (S2).

### Sign-out

A confirm page or a button calls `signOut({ locale })`. It posts a form to
`/api/auth/signout`; there is no ID token on the client to pass.

### Reads and the one "unauthenticated" path

- Protected page or layout: `await requireSession()` or
  `await requireAccessToken()`, outside any `try`. Without a session it
  redirects to the sign-in page with `callbackUrl` = the page being served
  (the proxy passes it in a request header), so callers need not say.
- Public page: `await auth()`; `null` is a visitor (MDRS-216).
- An API answer of 401 in a page read: `await redirectToSignIn()`.
- Server Action: `return withAccessToken(async (token) => …)`. No token, or a
  401 from the API, comes back as `{ kind: "unauthenticated" }`. On the client:

  ```ts
  const result = await saveNotes(input);
  if (handleUnauthenticated(result, { locale })) return;
  ```

  which sends the user to sign in and back to the same path, query and
  fragment.
- Route handler: `const token = await getAccessToken(); if (!token) return 401`.

### Tests in the app

`@medaris/auth/server` imports `server-only`, which throws outside React's
`react-server` condition. An app's `vitest.config.ts` that reaches it needs the
alias this package's own config uses:

```ts
resolve: { alias: [{ find: /^server-only$/, replacement: "<an empty module>" }] }
```

## Environment

The package reads no variable itself; the app passes values from its own
`~/env`, which `@medaris/env` fills from the root `.env`:

| `createAuth` field | App env | Root `.env` key |
| -- | -- | -- |
| `issuer` | `KEYCLOAK_ISSUER` | `WEB__KEYCLOAK_ISSUER` |
| `clientId` | `KEYCLOAK_CLIENT_ID` | `<APP>__KEYCLOAK_CLIENT_ID` |
| `clientSecret` | `KEYCLOAK_CLIENT_SECRET` | `<APP>__KEYCLOAK_CLIENT_SECRET` |
| `baseUrl` | `NEXTAUTH_URL` | `<APP>__NEXTAUTH_URL` |
| `secret` | `NEXTAUTH_SECRET` | `<APP>__NEXTAUTH_SECRET` |

No variable is renamed and no Keycloak client changes: the redirect URI stays
`<NEXTAUTH_URL>/api/auth/callback/keycloak` and the post-logout redirect URI
stays `NEXTAUTH_URL`. `baseUrl` must be an origin (no path); `createAuth`
throws otherwise, because a path would change the redirect URI. A plain-http
issuer is accepted only on loopback (a local Keycloak container).

## The cookies

| Cookie | Holds | Lifetime |
| -- | -- | -- |
| `<prefix>.session` (or `.session.0`, `.1`, … when larger than 3800 characters) | the session, sealed | until the refresh token's deadline; 30 days when it has none; the access token's life when there is no refresh token |
| `<prefix>.auth-flow.<16 chars of state>` | one sign-in round trip: `state`, nonce, PKCE verifier, return path, locale | 10 minutes, removed by the callback |
| `<prefix>.auth-starts` | `count.windowStart`: round trips started (the hard cap) | 5 minutes |

`<prefix>` is `cookiePrefix` (`nazar`, `tedris`, `nizam`), with `__Host-` in
front over https. Every one is HttpOnly, SameSite=Lax, Path=/, and Secure over
https. The names are new, so an app that moves signs its users in once more;
with a live Keycloak SSO session that round trip is silent.

Sealing: a compact JWE, `dir` + `A256GCM`. The key is HKDF-SHA-256 over
`NEXTAUTH_SECRET`, salted with the cookie prefix and labelled by purpose
(`session`, `flow`), so a round-trip cookie cannot be replayed as a session and
two apps given the same secret cannot open each other's.

The session holds the access token and its expiry (from `expires_in`, on this
server's clock), the refresh token and its deadline (Keycloak's
`refresh_expires_in`; `0` or absent is "none"), the ID token (for
`id_token_hint`), the user's `sub`, `name`, `email`, `preferred_username`,
`locale` and `picture`, and when the IdP last confirmed the session. Nothing
else: no second copy of the profile, no error flag (a failed session is
removed). A refresh that brings a new ID token renews the profile (B12).

## The refresh rule

Only `proxy.ts` changes a session. For each request it runs on:

1. Less than 60 s left on the access token: refresh. One refresh per refresh
   token in the process at a time; requests that arrive with the same old
   token while it runs, or up to 30 s after, get its result rather than
   spending the token again (safe under refresh-token rotation, single
   replica). The new cookie is written onto the request, so the page rendered
   for it reads the new session, and onto the response.
   - The IdP refuses (`invalid_grant`, `invalid_client`, any 4xx, or a
     refreshed ID token naming another subject): the session ends.
   - The IdP could not answer (timeout, network, 5xx,
     `temporarily_unavailable`): the session is kept while its access token
     is still usable and refreshed on the next request; once the token has
     run out, it ends.
   - No refresh token, or its deadline has passed: no call; the session ends
     when the access token does.
2. Otherwise, at most once a minute, `userinfo` (MDRS-210): a 401 or another
   `sub` ends the session; anything else keeps it, stamped, so an IdP outage
   costs one call a minute. Never in the last minute of a token's life, where
   the refresh answers the same question and clock skew could fake a 401
   (B10).
3. Gate: a page that is not public, without a usable session, redirects to the
   sign-in page with `callbackUrl`. API routes and Server Actions are never
   redirected. The sign-in page is never redirected to itself.

Every IdP call has a 10 s timeout (`httpTimeout`). Server Components, Server
Actions and route handlers never refresh: `auth()` and `getAccessToken()` read
the cookie once per request (React `cache()`) and treat a session without a
usable access token as no session, so they cannot disagree (A16).

## Loops and parallel tabs

- Each round trip has its own flow cookie, so tabs signing in together no
  longer overwrite each other's `state` (#180). At most 3 are kept.
- The start route goes straight to `callbackUrl` when the browser already has
  a session (not for `intent=register`). A replayed callback (the Back button
  after signing in, MDRS-249 B) of a signed-in browser goes on quietly.
- `enterSignIn` lets one tab at a time start a round trip; the others wait for
  its session. One automatic retry per tab per 2 minutes after a failure; at
  most 3 automatic starts per tab per 2 minutes whatever the reason (a session
  cookie the browser refuses would otherwise loop).
- The start route refuses a sixth round trip from one browser within 5
  minutes with `SignInLimit`. `AccessDenied`, `Configuration` (a client secret
  that no longer matches) and `SignInLimit` never retry by themselves.

## Phase 2: server-side sessions and back-channel logout

Not built. What would change:

- The cookie becomes an opaque `__Host-<app>.sid`; `StoredSession` moves to a
  store (Valkey/Redis, or Postgres) keyed by it. `SessionCookie` is the seam:
  a store with the same `read` / `writes` shape replaces it, and the routes,
  the proxy and the reads keep their signatures, so app code does not change.
- The refresh lock moves from the in-process single-flight to the store (for
  example `SET NX` with a short TTL), which makes rotation safe across
  replicas. Today two replicas can each refresh once.
- `POST /api/auth/backchannel-logout`: verify the `logout_token` (jose
  `jwtVerify` against the discovered `jwks_uri`, the back-channel `events`
  claim, `sid`/`sub`), delete the sessions behind it, and register
  `backchannel.logout.url` on the Keycloak clients. Sign-out in one app then
  ends the others at once instead of within a minute.
- The `userinfo` check stays only as a fallback where the IdP cannot reach the
  app (the shared dev realm and a laptop).
- Cookie size stops mattering (B6).

## Not verified

- Nothing here has run in a browser or against a real Keycloak; the specs mock
  openid-client and drive the route handlers and the proxy directly.
- That a cookie written onto the request in `proxy.ts` reaches `cookies()` in
  the page was read from Next 16.3.8's source (`x-middleware-set-cookie` and
  `x-middleware-override-headers` in `resolve-routes.js` and
  `request-store.js`), not observed.
- Keycloak's handling of `ui_locales` on its end-session endpoint.
