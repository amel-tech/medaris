# @medaris/auth

One OIDC session for the web apps (tedris, nazar, nizam), built on
[openid-client](https://github.com/panva/openid-client) v6 and
[jose](https://github.com/panva/jose) v6. It replaced next-auth 4 in all three
apps; no app depends on next-auth any more.

What it does, and where:

| Concern | Where | Notes |
| -- | -- | -- |
| Start a sign-in | `GET /api/auth/signin` | PKCE S256, `state`, `nonce`; `ui_locales` (+ `kc_locale`); `intent=register` → `prompt=create`; `reauth=1` → new tokens even when signed in; `action=UPDATE_PROFILE` → `kc_action` (an account action) |
| Finish it | `GET /api/auth/callback/keycloak` | the redirect URI the Keycloak clients already have |
| Sign out | `POST /api/auth/signout` | `id_token_hint` read on the server, never empty |
| Client-safe session | `GET /api/auth/session` | `{ user, expiresAt }` or `null`; no token |
| Back-channel logout | `POST /api/auth/backchannel-logout` | from the IdP (OIDC Back-Channel Logout 1.0); ends the sessions of an ended SSO session at once |
| Refresh, SSO check, gate | the app's `proxy.ts` | the only place a session changes |
| Where sessions live | the session store | Valkey when `WEB__AUTH_STORE_URL` is set; otherwise sealed in the cookie |
| Server reads | `auth()`, `getAccessToken()`, `requireSession()`, `requireAccessToken()`, `withAccessToken()`, `redirectToSignIn()` | read only, once per request |
| Specs and Playwright | `@medaris/auth/testing` | the session cookie through the package's own code |
| Client | `SessionProvider`, `useSession()`, `signIn()`, `enterSignIn()`, `signOut()`, `handleUnauthenticated()` | no token reaches client JS |
| Account actions | `accountActionHref()` (both entries) | a link to the IdP's form for an account action, and back with new tokens |

The login page stays the IdP's (no ROPC, no iframe). Every IdP endpoint comes
from OIDC discovery; the Keycloak-specific parameters are `kc_locale`, behind
the `kcLocale` option, and `kc_action`, sent only for an account action an app
starts (below).

## Entry points

- `@medaris/auth/server`: `createAuth()` and the types, and
  `SessionStoreUnavailableError` / `isSessionStoreUnavailable` (see "When the
  store cannot be reached"). Starts with `import "server-only"`, so a client
  component that imports it fails the build.
- `@medaris/auth/client`: `"use client"` and `import "client-only"`. A server
  layout may render its `SessionProvider`; nothing else in it runs on the
  server.
- `@medaris/auth/testing`: the session cookie as the package writes and reads
  it, for an app's specs and Playwright helpers (see "Tests in the app"). Not
  `server-only`, and not reachable from the other two entries; import it from
  `test/` and `e2e/` only.

Both app entries export `isUnauthenticated`, the `Session` / `SessionUser`
types, the error codes and message keys (`AUTH_ERROR_CODES`,
`AUTH_ERROR_MESSAGE_KEYS`, `authErrorMessageKey`, `isRetryableAuthError`),
`REAUTH_PARAM` and the account actions (`accountActionHref`,
`ACCOUNT_ACTIONS`, `ACCOUNT_ACTION_PARAM`, `AccountAction`).

## Wiring an app

Dependencies: `"@medaris/auth": "workspace:*"` in the app's `package.json`,
`"@medaris/auth"` in `transpilePackages` (`next.config.js`), a
`{ "path": "../../libs/auth" }` reference in its `tsconfig.json`.

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
  sessionStore: {
    url: env.AUTH_STORE_URL,
    keyPrefix: env.AUTH_STORE_KEY_PREFIX,
  },
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
  afterSignIn: (locale) => `/${locale ?? "tr"}`, // Ana sayfa in both
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
`export const POST = handlers.signOut`, `session/route.ts` → `handlers.session`,
`backchannel-logout/route.ts` → `export const POST = handlers.backchannelLogout`).

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
    "/((?!_next/|auth/|api/auth/(?:signin|signout|callback|backchannel-logout)(?:/|$)|.*\\.(?:ico|png|jpe?g|gif|svg|webp|txt|xml|webmanifest|woff2?|ttf|otf|map)$).*)",
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
  redirected. Excluding `/api/auth/(signin|signout|callback|backchannel-logout)`
  only saves work: the helper leaves them alone anyway. The back-channel
  route is the IdP's server-to-server POST and carries no cookie.
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
// from the page's searchParams: ?callbackUrl=&error=&reauth=1
const request = { intent, callbackUrl, locale, reauth: reauth === "1" };
const outcome = await enterSignIn(request, error, browserSignInDeps());
if (outcome.kind === "show-error") setShown(outcome.error);
// the box: t(`Auth.${authErrorMessageKey(shown)}`), and a retry button only
// when isRetryableAuthError(shown)
// the button: signIn(request)
```

`outcome` is `{ kind: "redirected" | "signing-in" | "cancelled" }` or
`{ kind: "show-error", error }`. Show the box with `outcome.error`, not the
page's own `?error=`: when this tab's budget ran out the page had no error,
and `outcome.error` is `SignInLimit`. Keep `reauth` in the request the button
passes to `signIn`, so a click also fetches new tokens.

`authErrorMessageKey(error)` picks the `Auth.*` message:

| `?error=` / `outcome.error` | Message key | Retries by itself |
| -- | -- | -- |
| `AccessDenied` | `accessDenied` | no |
| `Configuration` | `configurationError` | no |
| `SignInLimit` | `signInLimit` ("too many sign-in attempts, try again in a few minutes") | no |
| `OAuthSignin`, `OAuthCallback`, anything else | `errorDescription` | once |

The codes are next-auth's plus `SignInLimit`; `AUTH_ERROR_MESSAGE_KEYS` lists
every key, so an app's message spec can check each locale has all four.
Header buttons call `signIn({ callbackUrl: <this page>, locale })`, so signing
in from a public page comes back to it (S2).

The sign-in page itself must not require a session: `redirectToSignIn()`
(and so `requireSession()` and `requireAccessToken()`) throws while it renders
rather than redirecting it to itself a level deeper each time. It knows the
page from the return-path header the proxy sets, so it can tell only where
the proxy runs for the sign-in page (tedris, nizam). Where the matcher skips
it (nazar's `auth/`), nothing can tell, and the page simply must not call
them.

### Sign-out

A confirm page or a button calls `signOut({ locale })`. It posts a form to
`/api/auth/signout`; there is no ID token on the client to pass.

### Account actions

Something the account holds, not the app (since #317, the gender in the
profile), is changed on the IdP's own form. Keycloak calls these
application-initiated actions: the authorization request carries
`kc_action=<action>`, Keycloak shows that form to the signed-in user (the
login form first when the SSO session has ended) and then sends the browser to
the callback with a code, as for a sign-in. The callback stores a new session
from that code, ending the old one, so the tokens the app holds afterwards say
what the person changed. A "Değiştir" link is enough:

```tsx
import { accountActionHref } from "@medaris/auth/client"; // or /server
<Button
  href={accountActionHref("UPDATE_PROFILE", {
    callbackUrl: `/${locale}/account/public-profile`,
    locale,
  })}
>
  Değiştir
</Button>
```

- Only the actions in `ACCOUNT_ACTIONS` (`UPDATE_PROFILE`) are passed on; the
  start route treats any other `action=` as none, so a link cannot open
  Keycloak's `delete_account` in the app's name.
- It goes through the IdP even when the browser is signed in, like `reauth`,
  and counts against the start route's cap like any start.
- A callback that fails (Keycloak answering `error=`) lands on the sign-in page
  like any failed callback; the session the browser had is untouched, and the
  sign-in page goes straight back to `callbackUrl`.

### Reads and the one "unauthenticated" path

- Protected page or layout: `await requireSession()` or
  `await requireAccessToken()`, outside any `try`. Without a session it
  redirects to the sign-in page with `callbackUrl` = the page being served
  (the proxy passes it in a request header), so callers need not say.
- Public page: `await auth()`; `null` is a visitor (MDRS-216).
- An API answer of 401 in a page read. The page had a token (that is how it
  asked), so "not signed in" is not what happened: the API refused a token
  the IdP issued and this server still holds as valid (a wrong audience or
  `azp`, clock skew, a session ended at the IdP within the last minute). A
  plain `redirectToSignIn()` is a loop: the sign-in page finds the browser
  signed in and sends it straight back to the same refusal. Two safe forms:
  - `await redirectToSignIn({ reauth: true })`, outside any `try`. The
    sign-in page gets `?reauth=1`, does not count the refused session as
    signed in, and fetches new tokens from the IdP (silently, with a live SSO
    session). Each of those round trips counts against the per-tab and
    per-browser caps below, so a token the API will never take ends on the
    `SignInLimit` box within a few round trips instead of looping. Use it for
    the page's main read.
  - Treat it as a failed read: the page's error state, or nothing at all for
    a side read (a header badge, a count). Use it for anything that is not
    the page's reason to exist.

  Redirect without `reauth` only when there is no usable token, which
  `requireSession()` / `requireAccessToken()` already do.
- Server Action: `return withAccessToken(async (token) => …)`. No token comes
  back as `{ kind: "unauthenticated" }`; a 401 from the API as
  `{ kind: "unauthenticated", reauth: true }`. On the client:

  ```ts
  const result = await saveNotes(input);
  if (handleUnauthenticated(result, { locale })) return;
  ```

  which sends the user to sign in (with `reauth=1` when the result says so)
  and back to the same path, query and fragment.
- Route handler: `const token = await getAccessToken(); if (!token) return 401`.

### Tests in the app

`@medaris/auth/server` imports `server-only`, which throws outside React's
`react-server` condition. An app's `vitest.config.ts` that reaches it needs the
alias this package's own config uses:

```ts
resolve: { alias: [{ find: /^server-only$/, replacement: "<an empty module>" }] }
```

`@medaris/auth/testing` writes and reads the session cookie with the
package's own code, so no spec or Playwright helper copies the format:

| Export | What it does |
| -- | -- |
| `sealSessionCookies(config, session)` | `{ cookies: [{ name, value }], maxAge, secure, header }`: the cookie(s) the app would set, chunked as it chunks them |
| `openSessionCookies(config, cookies)` | the inverse: the `StoredSession` in a `cookie` header or a `{ name, value }` list (Playwright's `context.cookies()`), or `null` |
| `sessionFromTokenResponse(json, now?)` | the session the callback would store for a token endpoint answer (a direct grant's); the ID token is decoded, not verified |
| `sessionCookieName(config)` | `<prefix>.session`, `__Host-` over https |
| `cookieHeader(cookies)` | `name=value; …` |
| `resetRenewalCache()` | forgets the refresh results (30 s), `userinfo` verdicts (10 s) and moved Phase 1 cookies (30 s) every auth instance keeps per token; call it in `beforeEach` |
| `RETURN_TO_HEADER`, `REAUTH_PARAM` | `x-medaris-auth-return-to` (also exported by `./server`), `reauth` |
| `StoredSession`, `CookieConfig`, `TokenResponse` | the types |

`config` is the app's `createAuth` input, or only `{ baseUrl, secret,
cookiePrefix }` (plus `sessionMaxAge`, `now`). A Playwright helper:

```ts
const { cookies, maxAge, secure } = await sealSessionCookies(
  { baseUrl: base.origin, secret: E2E_NEXTAUTH_SECRET, cookiePrefix: "tedris" },
  sessionFromTokenResponse(await directGrant(who))
);
await page.context().addCookies(
  cookies.map((cookie) => ({
    ...cookie,
    url: base.origin,
    httpOnly: true,
    secure,
    sameSite: "Lax" as const,
    expires: Math.floor(Date.now() / 1000) + maxAge,
  }))
);
```

An app builds its auth once per module, and each instance keeps a refresh's
result and a `userinfo` verdict for a few seconds per token. Specs that send
the proxy the same access token one after another get the first answer
unless they call `resetRenewalCache()` (or use another token, or
`vi.resetModules()` and import `~/lib/auth` again).

## Environment

The package reads no variable itself (apart from `NODE_ENV`, for one warning
below); the app passes values from its own `~/env`, which `@medaris/env`
fills from the root `.env`:

| `createAuth` field | App env | Root `.env` key |
| -- | -- | -- |
| `issuer` | `KEYCLOAK_ISSUER` | `WEB__KEYCLOAK_ISSUER` |
| `clientId` | `KEYCLOAK_CLIENT_ID` | `<APP>__KEYCLOAK_CLIENT_ID` |
| `clientSecret` | `KEYCLOAK_CLIENT_SECRET` | `<APP>__KEYCLOAK_CLIENT_SECRET` |
| `baseUrl` | `NEXTAUTH_URL` | `<APP>__NEXTAUTH_URL` |
| `secret` | `NEXTAUTH_SECRET` | `<APP>__NEXTAUTH_SECRET` |
| `sessionStore.url` | `AUTH_STORE_URL` | `WEB__AUTH_STORE_URL` (optional) |
| `sessionStore.keyPrefix` | `AUTH_STORE_KEY_PREFIX` | `WEB__AUTH_STORE_KEY_PREFIX` (required with the URL) |

`WEB__AUTH_STORE_URL` is `redis://<user>:<password>@<host>:6379/0`
(`rediss://` over TLS), with the environment's Valkey ACL user;
`WEB__AUTH_STORE_KEY_PREFIX` is that user's key prefix, `dev` or `prod`.
Empty or unset, the session stays sealed in the cookie. `createAuth` throws
when the URL is set without a lowercase prefix, or does not start with
`redis://` / `rediss://`; neither message repeats the URL. Under
`NODE_ENV=production` without a store, the first request logs one warning:
back-channel logout is off.

No variable is renamed and no Keycloak client changes: the redirect URI stays
`<NEXTAUTH_URL>/api/auth/callback/keycloak` and the post-logout redirect URI
stays `NEXTAUTH_URL`. `baseUrl` must be an origin (no path); `createAuth`
throws otherwise, because a path would change the redirect URI. A plain-http
issuer is accepted only on loopback (a local Keycloak container).

## The cookies

| Cookie | Holds | Lifetime |
| -- | -- | -- |
| `<prefix>.session` | with a session store: a random id (32 bytes, base64url), nothing else. Without one: the session, sealed (`.session.0`, `.1`, … when larger than 3800 characters) | until the refresh token's deadline; 30 days when it has none; the access token's life when there is no refresh token |
| `<prefix>.auth-flow.<16 chars of state>` | one sign-in round trip: `state`, nonce, PKCE verifier, return path, locale | 10 minutes, removed by the callback |
| `<prefix>.auth-starts` | `count.windowStart`: visits to the start route, round trips and "already signed in" go-ons alike (the hard cap) | 5 minutes |

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
`id_token_hint`) and its `sid`, the user's `sub`, `name`, `email`,
`preferred_username`, `locale` and `picture`, and when the IdP last confirmed
the session. Nothing else: no second copy of the profile, no error flag (a
failed session is removed). A refresh that brings a new ID token renews the
profile (B12).

## The refresh rule

Only `proxy.ts` changes a session. For each request it runs on:

1. Less than 60 s left on the access token: refresh. One refresh per refresh
   token in the process at a time; requests that arrive with the same old
   token while it runs, or up to 30 s after, get its result rather than
   spending the token again. With a session store the refresh also takes the
   session's lock in Valkey (`SET …:lock:<hash> NX PX 10000`): the replica
   that wins calls the IdP and writes the store, the others look at the store
   every 100 ms for up to 3 s and take what it wrote, so rotation is safe
   across replicas. Without a store the new cookie is written onto the
   request, so the page rendered for it reads the new session, and onto the
   response; with one, the store is written and the cookie only gets its new
   lifetime.
   - The IdP refuses (`invalid_grant`, `invalid_client`, any 4xx, or a
     refreshed ID token naming another subject): the session ends.
   - The IdP could not answer (timeout, network, 5xx,
     `temporarily_unavailable`): the session is kept while its access token
     is still usable and refreshed on the next request; once the token has
     run out, it ends.
   - No refresh token, or its deadline has passed: no call; the session ends
     when the access token does.
2. Without a session store only: otherwise, at most once a minute, `userinfo`
   (MDRS-210): a 401 or another `sub` ends the session; anything else keeps
   it, stamped, so an IdP outage costs one call a minute. Never in the last
   minute of a token's life, where the refresh answers the same question and
   clock skew could fake a 401 (B10). With a store, back-channel logout ends
   the session instead, and the refresh at the access token's expiry (about
   five minutes) is the backstop for a logout that did not arrive.
3. Gate: a page that is not public, without a usable session, redirects to the
   sign-in page with `callbackUrl`. API routes and Server Actions are never
   redirected. The sign-in page is never redirected to itself.

Every IdP call has a 10 s timeout (`httpTimeout`). Server Components, Server
Actions and route handlers never refresh: `auth()` and `getAccessToken()` read
the session once per request (React `cache()`; with a store, one `GET`) and
treat a session without a usable access token as no session, so they cannot
disagree (A16).

## Loops and parallel tabs

- Each round trip has its own flow cookie, so tabs signing in together no
  longer overwrite each other's `state` (#180). At most 3 are kept.
- The start route goes straight to `callbackUrl` when the browser already has
  a session (not for `intent=register`, nor for `reauth=1`), and counts that
  like a start. A replayed callback (the Back button after signing in,
  MDRS-249 B) of a signed-in browser goes on quietly.
- `enterSignIn` lets one tab at a time start a round trip; the others wait for
  its session. One automatic retry per tab per 2 minutes after a failure; at
  most 3 automatic starts per tab per 2 minutes whatever the reason (a session
  cookie the browser refuses would otherwise loop).
- "Already signed in, go on" is budgeted too: at most 2 per tab per 2
  minutes, then the `SignInLimit` box. Going on spends nothing else, so a
  page that sends a signed-in browser to sign in (an API refusing a token the
  IdP still accepts) would otherwise bounce between the two pages for ever.
  Without `sessionStorage` there is no counter, and the tab shows the box
  rather than go on uncounted.
- `reauth=1` (the API refused the token): the sign-in page goes on only with a
  newer session than the one it was sent with, and the start route goes
  through the IdP rather than straight back, without `prompt=login` (a live
  SSO session answers silently with new tokens). Each such round trip counts
  against both caps. The session is not cleared first: the callback replaces
  it, and a round trip that fails leaves the visitor where they were.
- The start route refuses a sixth visit from one browser within 5 minutes
  with `SignInLimit`, whether it would have started a round trip or gone
  straight on. `AccessDenied`, `Configuration` (a client secret that no longer
  matches) and `SignInLimit` never retry by themselves.
- `redirectToSignIn()` while the sign-in page renders throws instead of
  redirecting the page to itself, and a `callbackUrl` that is the sign-in
  page is replaced by its own `callbackUrl` rather than nested.

## Phase 2: the session store and back-channel logout

`SessionStore` (`src/server/session-store.ts`) is the seam between the
routes, the proxy and the reads on one side and where a session lives on the
other. `sessionStore` in the config picks one of two:

| Mode | When | The cookie | The session | Cross-app sign-out |
| -- | -- | -- | -- | -- |
| server | `WEB__AUTH_STORE_URL` set | a random id | in Valkey, sealed | back-channel logout, at once |
| cookie | unset or empty (local development, most specs) | the session, sealed (Phase 1) | in the cookie | `userinfo` once a minute (MDRS-210) |

### Keys

Every key starts with `<WEB__AUTH_STORE_KEY_PREFIX>:auth:<cookiePrefix>:`, so
`prod:auth:nazar:…`. The Valkey ACL lets each environment's user touch only
its own prefix (`config/keycloak/RUNBOOK.md`, "Back-channel logout and the
session store").

| Key | Holds | TTL |
| -- | -- | -- |
| `s:<sha256(id)>` | the session, sealed with its own key (HKDF label `store`) | the cookie's lifetime: the refresh token's, renewed by every refresh |
| `sid:<sid>` | set of `sha256(id)` of one Keycloak SSO session | at least that of its longest member (`PEXPIRE NX`, then `GT`) |
| `sub:<sub>` | set of `sha256(id)` of one account | the same |
| `lock:<sha256(id)>` | the owner of a refresh in progress | 10 s; released by its owner |
| `jti:<jti>` | a back-channel logout token already used | 3 minutes |

The store holds the id's hash, never the id: a dump of it names no cookie
anyone could send. A store value is sealed under another key than a Phase 1
cookie, so it cannot be replayed as one either.

The client is ioredis 5, one per URL per process (on `globalThis`, so Next's
dev server does not open one per reload), connect timeout 2 s, command
timeout 1 s, no offline queue, no ready check: a request never waits for a
reconnect. Commands it sends: `GET`, `SET` (`PX`, `NX`/`XX`), `DEL`, `SADD`,
`SREM`, `SMEMBERS`, `PEXPIRE` (`NX`, `GT`), `EVAL` (the lock's
compare-and-delete).

### Moving Phase 1 sessions in

In server mode a request that carries a Phase 1 sealed cookie
(`<prefix>.session` or its `.0`, `.1`, … chunks) is moved into the store by
`proxy.ts` on its first request: a new id, the store entry, the id cookie on
the request and the response, the chunks removed. Requests the browser sent
before it stored the new cookie get the same id (within 30 s, per process).
Nobody signs in again because of the deploy. Paths the proxy does not run on
read the Phase 1 cookie as it is until the next proxied request.

### Back-channel logout

`POST /api/auth/backchannel-logout`, form field `logout_token`. The token is
checked as OIDC Back-Channel Logout 1.0 §2.6 asks (`src/server/backchannel.ts`):
signed by a key from the discovered `jwks_uri` with RS256, ES256 or EdDSA (the
API verifier's list); `iss` the issuer; `aud` naming this client; `iat` at
most 2 minutes old (30 s clock tolerance); `exp`, when present, not passed;
`sid` or `sub` present; `events` holding
`http://schemas.openid.net/event/backchannel-logout`; no `nonce`; its `jti`
not seen before (in Valkey, so across replicas; in memory in cookie mode).
Then every session indexed under `sid` is deleted (under `sub` when the token
names no `sid`).

| Answer | When |
| -- | -- |
| 200, empty, `Cache-Control: no-store` | done (also when no session was found) |
| 400, `{ "error": "invalid_request", "error_description": … }` | a check failed, a repeated `jti` included, or no `logout_token` |
| 501, `{ "error": "unsupported", … }` | cookie mode: the token is valid, but there is no store to find a session in |
| 503, `{ "error": "temporarily_unavailable" }` | the IdP's keys or the store could not be reached |
| 405 | not a POST |

Keycloak sends it only to a client with front-channel logout off and a
back-channel logout URL; "Backchannel logout session required" puts the `sid`
in. The clients in `config/keycloak/clients/` say so.

`POST /api/auth/signout` deletes the store entry and its index entries, then
goes to the IdP's end-session endpoint as before; Keycloak then back-channels
the other apps.

### When the store cannot be reached

Nothing treats the visitor as signed out, since the session may well be there
and a trip through the IdP would only come back to the same store:

| Where | What happens | What the user sees |
| -- | -- | -- |
| `proxy.ts` | no gate, no cookie written or removed, the request goes on | the page itself decides, below |
| `requireSession()`, `requireAccessToken()`, `redirectToSignIn()` | throw `SessionStoreUnavailableError` instead of redirecting | a protected page: the app's error page (`error.tsx`, or `global-error.tsx` when a layout asks) with its "try again" |
| `auth()`, `getAccessToken()` | `null` / `undefined` | a public page: rendered as for a visitor |
| `withAccessToken()` | throws `SessionStoreUnavailableError` when there is no token to give | the Server Action fails like any action that throws; no sign-in |
| `GET /api/auth/session` | 503 | nothing: the focus read counts it as "could not ask", not "signed out", so the page does not reload |
| `GET /api/auth/signin` | `?error=OAuthSignin` on the sign-in page, without going to the IdP | the "Giriş yapılamadı" box, one automatic retry per 2 minutes |
| `GET /api/auth/callback/keycloak` | `?error=OAuthCallback` | the same box |
| `POST /api/auth/signout` | the cookie is removed; the IdP's end-session endpoint without `id_token_hint` (the ID token is in the store) | Keycloak's own "Do you want to log out?" page, then signed out |

The store client logs one line per 30 s while it fails
(`@medaris/auth: session store unavailable`, with the error's code), and the
next request asks again.

## Not verified

- Nothing here has run in a browser or against a real Keycloak; the specs mock
  openid-client and drive the route handlers and the proxy directly.
- The Valkey store has run against a `valkey/valkey:8` container (8.1.10) in
  `test/valkey-store.e2e.spec.ts`, as an ACL user restricted to its prefix;
  not against the deployed Valkey. That Keycloak 26 delivers a back-channel
  logout to these routes has not been observed; the claims it sends were read
  from Keycloak 26.3.2's source (`DefaultTokenManager.initLogoutToken`).
- That ioredis bundles into the apps' standalone output was checked by
  `next build` only; the built server has not been started against a store.
- That a cookie written onto the request in `proxy.ts` reaches `cookies()` in
  the page was read from Next 16.3.8's source (`x-middleware-set-cookie` and
  `x-middleware-override-headers` in `resolve-routes.js` and
  `request-store.js`), not observed.
- Keycloak's handling of `ui_locales` on its end-session endpoint.
- An account action against a real Keycloak: that `kc_action=UPDATE_PROFILE`
  shows the profile form and comes back with a code (also when the person
  cancels, with `kc_action_status=cancelled`), and that the tokens issued then
  carry the changed attribute. No Keycloak was run for it; the specs drive the
  start route and the callback with openid-client mocked.
- `@medaris/auth/testing` has been loaded by Vitest only, not yet by a
  Playwright run.
