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
| `apps/tedrisat/test/helpers/test-app.helper.ts` | `createTestApp` takes `keyProvider?: "stub" \| "real"`, default `"stub"`, and overrides `PUBLIC_KEY_PROVIDER` accordingly. The `KEYCLOAK_*` writes moved out of `useDatabaseForThisFile` into `applyStubKeycloakEnv`, which runs in stub mode only — see below. |
| `apps/tedrisat/test/setup-no-network.ts` | **New.** A `setupFiles` entry that replaces `globalThis.fetch` in every worker, refuses any non-loopback host, refuses to follow a redirect out of loopback, and records every refusal. |
| `apps/tedrisat/test/helpers/network-refusals.ts` | **New.** The refusal ledger, in its own module so the guard's spec can drain it without re-running the setup file's side effects. |
| `apps/tedrisat/test/unit/no-network-guard.spec.ts` | **New.** The guard's own regression test, four clauses. |
| `apps/tedrisat/vitest.config.ts`, `vitest.integration.config.ts` | Both name the setup file. `globalSetup` cannot do this — it runs once in the main process and the requests happen inside the forks. |
| `apps/tedrisat/test/e2e/keycloak-audience.e2e.spec.ts` | Opts into `keyProvider: "real"`. |
| `apps/tedrisat/test/e2e/flashcard-label.e2e.spec.ts` | Two tests added to the MDRS-27 authentication block: a minted token is accepted, and one signed under an unknown `kid` is refused. |
| `apps/tedrisat/test/unit/config.spec.ts`, `openapi-document.spec.ts` | String fixtures moved off `auth.medaris.app` onto `keycloak.invalid`. Nothing dereferenced them; a production hostname in a test file is an invitation. |
| `apps/tedrisat/test/unit/jwt-claim-validation.spec.ts` | Comment no longer points at the deleted `DummyPublicKeyProvider`, and records why this spec keeps its own keypair. |
| `libs/common/src/auth-guard/key-providers/dummy-provider.ts` | **Deleted.** |
| `CLAUDE.md` | The no-network rule with its real scope, and the suite count 23 → 25 (it was already stale by one before this branch; the guard's spec accounts for the other). |

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

### Why the `KEYCLOAK_*` writes are bound to the mode

`keyProvider: "real"` first shipped depending on an unwritten rule. The
placeholder values were written by `useDatabaseForThisFile`, which is memoised,
so a suite that called it itself and *then* set its own `KEYCLOAK_*` kept them —
which is what `keycloak-audience.e2e.spec.ts` happened to do. A suite that set
the variables and called `createTestApp({ keyProvider: "real" })` directly, the
obvious way to write it, had them overwritten with `keycloak.invalid`, the
failed pre-load swallowed by `onModuleInit`, and every request answered 401 for
a reason nothing in the output named. Raised in review on PR #91.

The writes now live in `applyStubKeycloakEnv`, called from `createTestApp` in
stub mode only, so call order cannot matter. `KEYCLOAK_ALLOWED_CLIENTS` is
deleted there as well: the verifier only enforces an `azp` allow-list when it is
set, `mintTestToken` stamps no `azp`, and an inherited value would have turned
every minted token into an unexplained 401.

### Why `DummyPublicKeyProvider` was deleted rather than replaced

The issue suggested exporting the in-process provider from `@medaris/common` so
`teskilat` could reuse it. It was not exported: `libs/common/src/auth-guard/index.ts`
never exported `key-providers/`, so the dead class was unreachable by name from
outside the package, and shipping a test double out of a production security
module to serve a consumer that does not exist yet is a worse trade than
thirty lines duplicated when `teskilat` grows an auth suite.

## Verification

The gate:

```
$ pnpm nx run-many -t typecheck lint module-boundaries build test \
    --projects=tedrisat,common,teskilat --skip-nx-cache
NX   Successfully ran targets typecheck, lint, module-boundaries, build, test
     for 3 projects and 1 task they depend on
```

Test counts, `nx run tedrisat:test --skip-nx-cache --output-style=static`:

```
before (5d52210)   Test Files  24 passed (24)    Tests  390 passed (390)
after              Test Files  25 passed (25)    Tests  396 passed (396)
```

`biome-ratchet`: `errors 0 (baseline 0) · warnings 79 (baseline 79) · infos 24
(baseline 25)`.

### The "21 outbound requests" figure is a static count, not an instrumented one

It is `grep -c "await createTestApp(" apps/tedrisat/test/e2e/*.ts` summed to
**22**, minus the one call in `keycloak-audience.e2e.spec.ts`, which points its
`KEYCLOAK_*` at its own container before booting. Every one of those call sites
sits in a `beforeAll`/`beforeEach` that the passing run executes, and each boot
constructs `KeycloakPublicKeyProvider` and awaits its `onModuleInit`, so 21 is
the number of app boots that would have fetched the deployed realm. It was
**not** measured by counting requests as they left the process.

The **after** figure is measured by the guard rather than by a count, and the
argument needs one more step than it first appeared to. "Any non-loopback fetch
throws, the run is green, therefore none happened" is **not** sound on its own:
the caller most likely to trip the guard is `KeycloakPublicKeyProvider`, whose
`onModuleInit` catches everything and logs — a refusal raised inside it would
have been swallowed exactly as the original problem was, one level up. Raised in
review on PR #91.

So the guard also **records** every refusal, and an `afterEach` the swallowing
code cannot reach fails the test on anything left unacknowledged. With that, a
green run does carry the claim.

`Failed to pre-load JWKS keys` is 0 both before and after this branch, for two
different reasons — before, because the host was up and the fetches succeeded;
after, because nothing fetches. That is exactly why the line was useless as a
criterion, and why it is not one here.

Against the acceptance criteria:

- **No outbound call.** The guard is armed, not assumed — and the proof is a
  committed spec rather than a throwaway one. `test/unit/no-network-guard.spec.ts`
  asserts all four clauses: a non-loopback host is refused, loopback is not, a
  loopback 3xx is refused, and that same 3xx is handed back when the caller asks
  for `redirect: "manual"`. The first version of this branch proved the same
  thing with a spec it then deleted, leaving the rule the whole issue rests on
  untested; raised in review.
- **No `auth.medaris.app` under `apps/tedrisat/test/`** except two comments that
  explain the history.
- **The MDRS-27 block still answers 401 on all ten routes** — unchanged, still
  mounting the real guard, now with the real verifier reaching a real key
  provider rather than one whose cache a failed fetch left empty.
- **A minted token is accepted by the real `AuthGuard` + `JwtVerifierService`**,
  and one under an unknown `kid` is refused. The first is what distinguishes a
  working key provider from a suppressed fetch.
- **No unreachable provider remains** in `libs/common/src/auth-guard`.

### What the guard does and does not cover

It replaces `globalThis.fetch`. It does not see `node:http` / `node:https`
clients, `undici.request`, or anything a child process does —
`tools/keycloak/setup-realm.sh` shells out to `curl` and is invisible to it.
Covering those means an undici `setGlobalDispatcher` with a connect hook, which
would reach `fetch` and `undici.request` together but still not the http
modules; that is wider than this issue and has not been done. `CLAUDE.md` states
the same limit rather than the flattering version.

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
