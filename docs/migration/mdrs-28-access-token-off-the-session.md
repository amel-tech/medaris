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
