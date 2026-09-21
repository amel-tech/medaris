# MDRS-89 — The tedrisat suite stops calling production Keycloak

Base: `5d52210`. Test infrastructure and one dead file in `libs/common`; no
application behaviour changed.

Every figure below was read off command output on this branch, on one machine
(Docker 28.4.0, Node 22.21.0). What could not be established is listed under
**Not established** rather than left out.

## The defect

`createTestApp({ authUserId })` calls `overrideGuard(AuthGuard)`. That replaces
the **guard**, not the **key provider**: `AuthGuardModule` registers
`KeycloakPublicKeyProvider` under `PUBLIC_KEY_PROVIDER`, and its `onModuleInit`
does `await fetch(jwksUrl)` against whatever `KEYCLOAK_JWKS_URL` says.
`app.init()` awaits that hook, so every test app paid the round trip — including
the ones that impersonate a user and never look at a token.

`test-app.helper.ts` pointed `KEYCLOAK_JWKS_URL` and `KEYCLOAK_ISSUER` at the
deployed realm, `https://auth.medaris.app/realms/amel-tech-dev`. Measured on
`2b9457f`: **22** `await createTestApp(` call sites across the nine e2e files,
**21** of them against production (`keycloak-audience.e2e.spec.ts` points its
one call at its own container).

### Why it survived

`onModuleInit` catches its own failure and logs
`Failed to pre-load JWKS keys during module initialization`. A log line is not a
gate, and the log line is not even stable:

| | `Failed to pre-load JWKS keys` in a full run |
| -- | -- |
| 2026-09-18, commit `9cf36a8` | every app boot |
| 2026-09-20, commit `2b9457f` | **0** |

Same machine, no code change in between. On 2026-09-20
`curl https://auth.medaris.app/.../certs` answered `HTTP 200` in 161 ms, so the
fetches were succeeding rather than not happening. The suite had not become
hermetic; it had become quietly dependent. That is the failure mode this issue
is about, and the reason the fix ends in an enforced guard rather than a
convention.

## What changed

| File | Change |
| --- | --- |
| `apps/tedrisat/test/global-setup.ts` | Generates one RSA-2048 keypair per run and `provide`s it as `keycloak` — `kid`, both PEMs, and the `issuer` / `audience` / `jwksUrl` the app is configured with. Keygen is the expensive part, so it happens once, not per file. |
| `apps/tedrisat/test/helpers/test-keycloak.helper.ts` | **New.** `stubPublicKeyProvider()` returns the in-process `IPublicKeyProvider`; `mintTestToken()` / `bearerFor()` sign RS256 tokens with the run's private key. |
| `apps/tedrisat/test/helpers/test-app.helper.ts` | `createTestApp` takes `keyProvider?: "stub" \| "real"`, default `"stub"`, and overrides `PUBLIC_KEY_PROVIDER` accordingly. The `KEYCLOAK_*` environment now comes from the provided context — `.invalid` hosts, not the deployed realm. |
| `apps/tedrisat/test/setup-no-network.ts` | **New.** A `setupFiles` entry that replaces `globalThis.fetch` in every worker and throws on any non-loopback host. |
| `apps/tedrisat/vitest.config.ts`, `vitest.integration.config.ts` | Both name the setup file. `globalSetup` cannot do this — it runs once in the main process and the requests happen inside the forks. |
| `apps/tedrisat/test/e2e/keycloak-audience.e2e.spec.ts` | Opts into `keyProvider: "real"`. |
| `apps/tedrisat/test/e2e/flashcard-label.e2e.spec.ts` | Two tests added to the MDRS-27 authentication block: a minted token is accepted, and one signed under an unknown `kid` is refused. |
| `apps/tedrisat/test/unit/config.spec.ts`, `openapi-document.spec.ts` | String fixtures moved off `auth.medaris.app` onto `keycloak.invalid`. Nothing dereferenced them; a production hostname in a test file is an invitation. |
| `apps/tedrisat/test/unit/jwt-claim-validation.spec.ts` | Comment no longer points at the deleted `DummyPublicKeyProvider`, and records why this spec keeps its own keypair. |
| `libs/common/src/auth-guard/key-providers/dummy-provider.ts` | **Deleted.** |
| `CLAUDE.md` | The no-network rule, and the suite count corrected 23 → 24 (already stale before this branch). |

### Why `"real"` exists rather than an unconditional stub

The issue asked for the override to be unconditional. It was filed
2026-09-18T07:23Z; `keycloak-audience.e2e.spec.ts` reached `main`
2026-09-19T03:29Z in #77, so the issue never saw it. That suite starts its own
Keycloak, runs `tools/keycloak/setup-realm.sh` against it, and asserts through
`app.get<IJwtVerifier>(JWT_VERIFIER).verifyToken(token)` that the realm mints
`aud: tedrisat-api` and the **real** `KeycloakPublicKeyProvider` resolves the
key. Stubbing the provider there leaves nine passing tests that assert nothing
about Keycloak.

The issue also contradicted itself: step 1 said "nothing in the e2e path may
call `fetch`", step 4 said throw "on any **non-loopback** URL". Step 4 is the
one that survives contact with that suite, and it is what shipped.

### Why `DummyPublicKeyProvider` was deleted rather than replaced

The issue suggested exporting the in-process provider from `@medaris/common` so
`teskilat` could reuse it. It was not exported: `libs/common/src/auth-guard/index.ts`
never exported `key-providers/`, so the dead class was unreachable by name from
outside the package, and shipping a test double out of a production security
module to serve a consumer that does not exist yet is a worse trade than
thirty lines duplicated when `teskilat` grows an auth suite.

## Verification

`pnpm nx run-many -t typecheck lint module-boundaries build test --projects=tedrisat,common,teskilat --skip-nx-cache` → green.

| | Before (`5d52210`) | After |
| -- | -- | -- |
| Test files / tests | 24 / 390 | 24 / **392** |
| Outbound requests to `auth.medaris.app` per run | 21 | **0** |
| `Failed to pre-load JWKS keys` lines | 0 (the host was up) | 0 (nothing fetches) |

Against the acceptance criteria:

- **No outbound call.** The guard is armed, not assumed: a throwaway spec
  asserting `fetch("https://auth.medaris.app/")` rejects with `/MDRS-89/` and
  `fetch("http://127.0.0.1:1/")` does not, passed 2/2 and was then deleted.
- **No `auth.medaris.app` under `apps/tedrisat/test/`** except two comments that
  explain the history.
- **The MDRS-27 block still answers 401 on all ten routes** — unchanged, still
  mounting the real guard, now with the real verifier reaching a real key
  provider rather than one whose cache a failed fetch left empty.
- **A minted token is accepted by the real `AuthGuard` + `JwtVerifierService`**,
  and one under an unknown `kid` is refused. The first is what distinguishes a
  working key provider from a suppressed fetch.
- **No unreachable provider remains** in `libs/common/src/auth-guard`.

### Acceptance criterion 1 was rewritten, deliberately

As filed it read "`Failed to pre-load JWKS keys` no longer appears in the
output". That was **already true on untouched `main`** by the time the work
started, for the reason in the table above — a criterion that passes without the
work is not a criterion. The half that carries the weight is the `fetch` guard,
and that is what the bullet above asserts.

## Not established

**The flake is not fixed, and this branch cannot say whether it moved.**

| | Full runs | Failed |
| -- | -- | -- |
| `9cf36a8`, 2026-09-18 | 8 | 1 |
| MDRS-84 branch, 2026-09-18 | 6 | 2 |
| This branch, 2026-09-21 | 7 | 1 |

The failure that appeared here was
`flashcard-bulk.e2e.spec.ts > deck ownership > still lets a non-owner collect a
PUBLIC deck`, with `Error: Parse Error: Expected HTTP/, RTSP/ or ICE/` — a third
signature, in the same file and describe block as one of the September 18
failures. So removing the JWKS fetch did not remove the flake.

Two reasons not to read anything into 1-in-7 against 1-in-8:

1. the samples are far too small to separate those rates;
2. the network condition changed between the measurements — the September 18
   numbers were taken while every JWKS fetch failed, the September 21 numbers
   after the host became reachable and then after the fetch was removed
   entirely. Any difference has at least two candidate causes.

What this branch does establish is narrower and still worth having: **the JWKS
fetch can now be struck off the candidate list**, because it no longer happens.
The flake needs its own issue, its own machine time, and a run count chosen to
make a rate mean something.
