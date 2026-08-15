# MDRS-30 — verify `iss`, `aud` and the token type, not the signature alone

`JwtVerifierService.verifyToken` called `jwt.verify(token, key, { algorithms: ["RS256"] })`
and checked nothing else. The key is resolved by `kid` against one realm's JWKS, so the
token had to come from that realm — but *within* that realm every token signed by the realm
key passed: an ID token, a token minted for another client, or a service-account token for
an unrelated application. `AuthGuard` then assigned the whole payload to `request.user` and
every controller trusted `request.user.sub`.

Nothing exercised this. All four e2e specs build their app through `createTestApp`, which
replaces the guard wholesale.

## What changed

### `libs/common`

- `src/auth-guard/services/jwt-verifier.service.ts` — the verify call now carries `issuer`
  and `audience`, and two claims `jsonwebtoken` does not know about are checked afterwards:
  - `typ` must be `Bearer`. Keycloak stamps `Bearer` on access tokens, `ID` on ID tokens and
    `Refresh` on refresh tokens; only the first may be presented to an API.
  - `azp` must be in the allow-list **when one is configured**. Empty means no `azp`
    restriction — `aud` already binds the token to this API.
  - `exp` must be present. `jsonwebtoken` enforces the expiry when the claim is there but
    accepts a token that omits it, which would never expire. Keycloak always sets it; this
    is the one check beyond the acceptance criteria's list, added because it sits on the
    same code path and costs nothing.
- The policy comes from `ConfigService` (`keycloak.issuer`, `keycloak.audience`,
  `keycloak.allowedClients`) and is read in the constructor. A missing `issuer` or `audience`
  throws at construction, i.e. the app does not boot. Falling back to "skip the check" would
  restore exactly the hole this task closes, and the gap would be invisible at runtime.
- `src/auth-guard/exceptions/exceptions.ts` — new `JwtClaimError` (`JWT_CLAIM_REJECTED`),
  a sibling of the existing JWT errors and therefore a 401 through `AuthGuard`.
- `src/auth-guard/index.ts` — the barrel now also exports the tokens, the interfaces, the
  exceptions and `JwtVerifierService`, so a consumer can build the verifier in a test.
  `DummyPublicKeyProvider` is deliberately **not** exported: it is a test double, and
  widening the library's public surface with it invites wiring it into a real app.

### `apps/tedrisat`

- `src/config/security-env.ts` — `KEYCLOAK_ISSUER` (absolute URL) and `KEYCLOAK_AUDIENCE`
  join `KEYCLOAK_JWKS_URL` and `DB_PASSWORD` as variables that must not fall back, for the
  same reason MDRS-35 made those two required. `KEYCLOAK_ALLOWED_CLIENTS` is optional and
  comma-separated. The `isTestRunner` exemption is unchanged and now also covers the two new
  variables.
- `src/config/config.ts` — `keycloak.issuer`, `keycloak.audience`, `keycloak.allowedClients`.
- `.env.example` and the root `.env.example` document all three.
- `test/helpers/test-app.helper.ts` sets `KEYCLOAK_ISSUER` and `KEYCLOAK_AUDIENCE` alongside
  the JWKS URL, so the e2e suites do not rely on the test-runner fallback.

### Tests

`apps/tedrisat/test/unit/jwt-claim-validation.spec.ts` — 19 cases. `libs/common` still has no
test target (`project.json` declares only `lint`, and there is no jest dependency), so the
specs live in tedrisat, next to `app.controller.spec.ts`.

The realm keypair is generated with `node:crypto` `generateKeyPairSync`; `DummyPublicKeyProvider`
ships a public key only, so there is nothing in the repository to sign fixtures with. Tokens
are assembled by hand (`createSign` / `createHmac` over the base64url signing input) rather
than with `jsonwebtoken`, so the fixtures do not depend on the library under test and no new
dependency was added to tedrisat.

`config.spec.ts` gained four cases for the two new required variables and the optional
allow-list.

## What was verified

Gate, from this worktree, after merging `origin/main` at `22a4c6f` (the branch started from
`7210c91`; the merge brought in MDRS-31's flashcard-label e2e suite and only CLAUDE.md's test
counter conflicted):

| Command | Result |
| --- | --- |
| `pnpm nx run-many -t typecheck --skip-nx-cache` | 16 projects |
| `pnpm nx run-many -t test --skip-nx-cache` | **150 tests / 13 suites**, all passing |
| `pnpm nx run-many -t build --skip-nx-cache` | 8 projects |
| `pnpm nx run-many -t lint --skip-nx-cache` | 16 projects |
| `pnpm nx run-many -t module-boundaries --skip-nx-cache` | 16 projects |
| `node tools/ci/biome-ratchet.mjs` | errors 0 · warnings 94 · infos 27 — all at baseline |

The 150/13 figure is the measured total on the merged tree: tedrisat 148 in 11 suites,
teskilat 2 in 2 suites, `tedris-web:test` is `echo 'Tests not implemented'`. `CLAUDE.md` was
106/11 when this branch opened and 127/12 on `main` by the time the merge landed; it now
carries the measured 150/13, and its "of tedrisat's 9 suites" line reads 11.

The acceptance criteria's mutation check was actually run, not assumed:

- Deleting `audience: this.policy.audience` from the verify call, rebuilding `common` and
  re-running the spec: **2 failed** — "rejects a token minted for another Keycloak client"
  and the guard's "answers 401 to a token minted for a different client of the same realm".
- Deleting `issuer: this.policy.issuer` instead: **1 failed** — "rejects a token from another
  realm's issuer".
- Both options restored; the 19 cases pass again.

The five cases the acceptance criteria names are covered, plus the wrong signing key, a
missing `kid`, a missing `exp`, a multi-valued audience, the three `azp` cases and the
policy-is-mandatory pair. `AuthGuard` is exercised through a real Nest app and supertest, so the wrong-audience
rejection is asserted as an HTTP 401 rather than only as a thrown error from the verifier.

## What was not verified

- **No token from a real Keycloak was tested.** Every fixture is minted locally. The claim
  shapes (`typ: "Bearer"` on access tokens, `azp` naming the requesting client, `iss` equal
  to the realm URL) are taken from Keycloak's documented token format, not observed against
  a live realm. Whoever configures the deployment must confirm that `KEYCLOAK_AUDIENCE`
  matches an `aud` the realm actually mints — Keycloak only adds an API's client id to `aud`
  when an audience mapper is configured on the requesting client, which is MDRS-42's work.
  Until then, a realistic value is `account`, which Keycloak includes by default.
- **The deployment's own environment was not touched.** Any environment that runs tedrisat
  outside `NODE_ENV=test` now needs `KEYCLOAK_ISSUER` and `KEYCLOAK_AUDIENCE` or the service
  refuses to boot — the same trade-off MDRS-35 accepted for `KEYCLOAK_JWKS_URL`.
- `apps/teskilat` does not import `AuthGuardModule`, so its `.env.example` was left alone.

## Follow-ups

- **MDRS-42** owns creating the per-app Keycloak clients and the audience mapper that puts
  `tedrisat-api` into `aud`. Until it lands, `KEYCLOAK_AUDIENCE` must be set to whatever the
  current realm actually mints.
- `libs/common` still has no test target. Adding one is a separate change; the specs for its
  auth-guard code currently live in `apps/tedrisat/test/unit/`.
- `AuthGuard` still assigns the whole decoded payload to `request.user` with no shape
  validation. Narrowing that to a typed subject is not in this task's scope.
