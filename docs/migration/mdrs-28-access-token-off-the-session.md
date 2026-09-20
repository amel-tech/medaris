# MDRS-28 — the Keycloak access token leaves the client-visible session

Both `tedris-web` and `nizam-web` copied the raw Keycloak access token onto the
NextAuth `Session` (`session.accessToken = token.accessToken`). NextAuth serves
`Session` from `GET /api/auth/session`, so any script on the page — an XSS
payload, a malicious extension — could read a bearer token that `tedrisat`
accepts on every guarded route.

## What changed

- The `session` callback no longer copies `accessToken`; the field is gone from
  the `Session` interface in both `next-auth.d.ts` files. `idToken` stays for
  now — each app's `logout.tsx` reads it from a client component — as the
  issue proposed.
- Server code reads the token through `getAccessToken()` in each app's
  `lib/auth_options.ts`. Every consumer — route handlers under `app/api/**`,
  server actions, server components, `authenticated-action.ts` — moved from
  `(await auth())?.accessToken` to it. All were already server-side.
- `getAccessToken` is built from **`createAccessTokenReader` in
  `@medaris/services/auth`** (`libs/services/src/auth/get-access-token.ts`), a
  new subpath export. Each app supplies three values: `NEXTAUTH_SECRET`, its
  session cookie name (the custom names from MDRS-24, which `getToken` cannot
  find on its own), and its own `refreshAccessToken`. `libs/services` gains
  `next`, `next-auth` and `react` as dependencies for it; the library is
  already `scope:web` / `platform:web` and is the sanctioned boundary both
  apps cross to reach tedrisat.

### What the reader does that a bare `getToken()` did not

The first version of this branch returned `token?.accessToken` straight from
`getToken()`. Review pointed out what that loses: `auth()` goes through
`getServerSession`, which runs the `jwt` callback, and the `jwt` callback is
where the `Date.now() < token.accessTokenExpired` check and
`refreshAccessToken()` live. `getToken()` only decrypts the cookie. With
Keycloak's default five-minute access-token lifetime, a user idle past expiry
would have sent a stale bearer token from every server path and been 401'd,
where before the token was refreshed in-request.

The reader therefore:

1. returns `undefined` when the token carries `error` — a session whose refresh
   has already failed no longer takes the authorized path with a dead token
   (`authenticated-action.ts` only checked that a string was present);
2. returns the stored token while `accessTokenExpired` is in the future;
3. otherwise calls the app's `refresh` and returns the refreshed token, or
   `undefined` if that failed too.

A refreshed token cannot be written back to the cookie from a server component.
That was equally true of the `auth()` path, so this restores parity rather
than regressing it; the client `SessionProvider`'s next `/api/auth/session`
call persists the refresh.

It is wrapped in React's per-request `cache()`. `getToken()` derives the
encryption key with HKDF and decrypts a JWE on every call, and
`apps/tedris/app/[locale]/decks/[id]/page.tsx` calls it three times in one
render (inside a `Promise.all`). `cache()` is scoped to one server request, so
two users can never share an entry.

## Review findings and what they changed

| # | Finding | Outcome |
|---|---|---|
| 1–2 | `getToken()` skips the `jwt` callback, so the token is never refreshed on the server and `token.error` is invisible. | **Fixed** — expiry check, refresh and fail-closed `error` handling in the shared reader. |
| 3 | Not request-memoized; several pages call it more than once per render. | **Fixed** — `cache()`. |
| 4 | A byte-for-byte identical block added to both apps, in the most security-sensitive function either has. | **Fixed** — one implementation in `@medaris/services/auth`; each app keeps a three-value wrapper. |
| 5 | `libs/services/README.md` still taught `session?.accessToken` for both server and client use. | **Fixed** — the server snippet uses `getAccessToken()`; the client section says the session no longer carries the token and points at server actions / route handlers. |

## Second review round (2026-09-12, after the MDRS-21 merge)

| # | Finding | Outcome |
|---|---|---|
| 6 | `token.error` is sticky: a single transient refresh failure was re-spread by every later successful refresh, and the reader's fail-closed check then returned `undefined` for the rest of the session. | **Fixed.** Both apps' `refreshAccessToken` set `error: undefined` on the success path, so the flag describes only the most recent attempt. nizam's `RefreshTokenExpired` early return stays sticky — that one is terminal. |
| 7 | Passing `headers()` into `getToken()` opened the `Authorization: Bearer` fallback next-auth has, a session-presentation channel `getServerSession()` never had, on the `app/api` routes the middleware skips. | **Fixed.** The reader passes cookies only. |
| 8 | The refreshed token is discarded at the end of the request, so between expiry and the client's next `/api/auth/session` call every server request pays a `refresh_token` POST. | **Recorded** as follow-up 4 below. Server components cannot write cookies; route handlers and server actions can, so a persist hook is the right shape, and it is a separate change. |
| 9 | The README's structure block still listed a `src/core/` that does not exist and not the two real subpaths. | **Fixed.** |
| 10 | `pnpm-lock.yaml`'s `libs/services` importer still resolved the pre-MDRS-21 `next@16.1.7` / `react@19.1.9`, so `--frozen-lockfile` failed in CI. | **Fixed.** Regenerated with `pnpm install` on the merged tree; the importer now resolves `next@16.3.4` / `react@19.2.8` like the four web apps. |

## Third round — the rebuild of PR #64 (2026-09-15)

PR #64 was rebuilt on `main` as one commit per Linear task. The review threads
left open on it were all the same shape: a fix applied to `apps/tedris` and
not to the byte-for-byte copy in `apps/nizam`, plus two branches of the shared
reader that trusted more than the rest of it.

| # | Finding | Outcome |
|---|---|---|
| 11 | nizam still computed the refresh-token deadline from `refresh_expires_in` unguarded, so Keycloak's `0` (this realm, shared by both apps through `WEB__KEYCLOAK_ISSUER`) became a timestamp in the past and the guard killed the session the moment the access token aged out. | **Fixed.** `refreshDeadline()` and the `typeof` guard, as in tedris; `JWT.refreshTokenExpireIn` is optional in nizam's `next-auth.d.ts` too. |
| 12 | nizam's `session` callback did not mirror `token.error` and its `ClientProviders` was a bare `SessionProvider`, so after a failed refresh every server path returned `undefined` while the client kept a valid-looking session. | **Fixed.** `session.error = token.error` and the same `RefreshErrorRedirect` as tedris; `Session.error` is optional and documented. |
| 13 | The reader treated an absent `accessTokenExpired` as "never expires" — the one fail-open branch in an otherwise fail-closed function. | **Fixed.** Only a token with a known future expiry and no recorded error takes the fast path; an unknown deadline goes through the app's refresh. |
| 14 | A transient refresh failure was terminal on the server side: any `error` in the cookie short-circuited to `undefined` and never called `refresh`, although the `jwt` callback's own policy is to retry on every request while the token is stale. | **Fixed.** A token carrying `error` is refreshed once more per request (memoized by `cache()`); an expired refresh token is still refused before any network call by the app's own guard, so the terminal case stays terminal. |

Two threads were left for separate tasks, on purpose: every tedris page still
runs both `auth()` (via `Header`) and `getAccessToken()`, two decrypts and up to
two refreshes per render; and `isDeckInCollection` on the deck page downloads
the user's whole deck collection, with every `decks_users` row, for one
boolean.

## What was verified

- `typecheck`, `lint`, `module-boundaries` for `services`, `tedris-web`,
  `nizam-web`; the full five-target gate on the branch (results in the pull
  request).
- `grep -rn "accessToken" apps/tedris apps/nizam` finds the field only inside
  `auth_options.ts` (the `jwt` callback and the refresh function) and the
  `JWT` augmentation in `next-auth.d.ts` — nothing on `Session`.

## What was NOT verified

- **No live Keycloak.** The refresh path was not exercised against a realm;
  the logic is the same `refreshAccessToken` the `jwt` callback already ran,
  moved behind a different entry point.
- **No test asserts the refresh or the fail-closed branch.** Neither app has
  a test harness for `lib/`, and `libs/services` has no `test` target; adding
  one is the follow-up below rather than a reason to leave the branch
  duplicated.

## Follow-ups (not opened as issues)

1. **`idToken` is still on the `Session`.** It is read by a client component in
   each app's logout flow. Moving it server-side means a route handler for the
   Keycloak end-session redirect; the issue already scopes that as the second
   half.
2. **A `test` target for `libs/services`**, so the reader's three branches can
   be pinned with a stubbed `getToken`.
3. **`header.tsx` in tedris still calls `auth()`** for the user's display name.
   It decodes the same cookie a fourth time in the request; harmless, and
   `auth()` is the right call for the user object, so it was left alone.
4. **Persist the refreshed token where the runtime allows it.** Route handlers
   and server actions can set cookies; give `createAccessTokenReader` an
   optional persist hook that re-encodes the refreshed JWT with
   `next-auth/jwt`'s `encode` and writes it back under the session cookie's
   options, so later requests hit the not-expired fast path instead of each
   paying a Keycloak round trip until the client `SessionProvider` refetches.
   Server components stay as they are (they cannot write cookies).
