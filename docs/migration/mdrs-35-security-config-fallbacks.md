# MDRS-35 — Remove silent security-config fallbacks, verify database TLS

Base: `68faa44`. Independent of PR #80; see the MDRS-25 note under "Follow-ups".

## What changed

| File | Change |
| --- | --- |
| `apps/tedrisat/src/config/security-env.ts` | New. `readSecurityEnv()` and `requireDbPassword()` — the zod validation for `KEYCLOAK_JWKS_URL` and `DB_PASSWORD`, plus `isTestRunner()`. |
| `apps/tedrisat/src/config/config.ts` | Neither variable carries a default any more. The `\|\| "test-url"` fallback and the TODO above it are gone, as is `\|\| "tedrisat"` for the password. |
| `apps/tedrisat/src/config/database-ssl.ts` | New. `resolveDatabaseSsl()` — one implementation of the `ssl` option, shared by the runtime pool and the migration client so they cannot drift. |
| `apps/tedrisat/drizzle.config.ts` | Uses both helpers, so `pnpm db:migrate` fails the same way the service does instead of handing `undefined` to `pg`. |
| `apps/tedrisat/test/jest-e2e.json` | `testTimeout: 60000`, `maxWorkers: 1`, and the `globalTeardown` the main config already had. This is what makes AC #2 verifiable — see below. |
| `apps/tedrisat/test/unit/config.spec.ts` | New. 15 tests. |
| `apps/tedrisat/package.json` | `zod: "catalog:"` added to `dependencies`. |
| `.env.example`, `apps/tedrisat/.env.example` | Document that the two variables are required, add `DB_CA_CERT`, and change the tedrisat template's `DB_PASSWORD` from `tedrisat` to `change-me`. |
| `CLAUDE.md`, `README.md` | Gate expectation corrected to the measured 106 tests / 11 suites, plus the two prerequisites in "A note on the gate". |

### The TLS change

`DB_SSL=true` produced `{ rejectUnauthorized: false }` in both files: the
connection was encrypted but the server was never authenticated, so anything
answering on the host:port was trusted. It now produces
`{ rejectUnauthorized: true }`, plus `ca: DB_CA_CERT` when that PEM is set.
Without `DB_CA_CERT` the platform trust store applies.

`DB_CA_CERT` is normalised for literal `\n` sequences, because the usual ways of
delivering a multi-line PEM (an unquoted dotenv value, docker-compose
`environment:`, several CI secret UIs) escape the newlines; left as-is `tls`
reports `PEM routines: NO_START_LINE`, which reads like a broken certificate
rather than a broken variable.

**This is a breaking change for any deployment that runs `DB_SSL=true` against a
self-signed or private-CA certificate** — such a connection now fails instead of
silently succeeding, and needs `DB_CA_CERT`. That is the point of the issue, but
it needs saying before a deploy discovers it.

### Why the exemption is `JEST_WORKER_ID`, not `NODE_ENV=test`

The issue's proposal says "throw … outside `NODE_ENV=test`". Keying only on
`NODE_ENV` leaves the original hole half-open: `NODE_ENV=test` is not exclusive
to the test runner — a staging container or a CI job reusing a compose file can
carry it, and would still be handed `jwksUrl = "test-url"`, boot, swallow the
JWKS fetch error and 401 every request. `isTestRunner()` therefore requires
`NODE_ENV === "test"` **and** `JEST_WORKER_ID` to be set.

The requirement also covers development, not just production (AC #1 names
`NODE_ENV=production`): that way a production deploy which also forgets
`NODE_ENV` is caught, and since both `.env.example` files ship both values a
developer who copies the template is unaffected.

## Verified

Every figure below came from command output in this worktree.

| Claim | How it was checked |
| --- | --- |
| **AC #1 — a boot without either variable exits non-zero, naming it** | Built, then run against `dist/src/main.js`. Without `KEYCLOAK_JWKS_URL`: exit **1**, `@medaris/tedrisat cannot start, the environment is incomplete: KEYCLOAK_JWKS_URL — Required. See apps/tedrisat/.env.example.` Without `DB_PASSWORD`: exit **1**, the same message naming `DB_PASSWORD`. With `NODE_ENV=test` but no `JEST_WORKER_ID`: exit **1** as well. The real binary, not a unit-test stand-in. |
| **AC #2 — `test:e2e` passes** | `pnpm --filter @medaris/tedrisat test:e2e` → **4 suites, 58 tests, all passing**. It did *not* pass before this branch; see below. |
| **AC #3 — no `rejectUnauthorized: false` remains** | `grep -rn 'rejectUnauthorized' apps libs` → every hit is `true` |
| The migration client fails the same way | `env -u DB_PASSWORD pnpm exec drizzle-kit check` → `environment is incomplete: DB_PASSWORD — Required`; with `DB_PASSWORD=x` → "Everything's fine", exit 0. The shared imports also resolve in drizzle-kit's own loader, not just under `tsc`. |
| The full gate | typecheck **16 projects** · test **106 tests / 11 suites** (tedrisat 104/9, teskilat 2/2) · build **8** · lint **16** · module-boundaries **16** |
| Baseline for that gate | Measured on `68faa44` before editing: **91 tests / 10 suites** (tedrisat 89/8, teskilat 2/2). The +15 is `config.spec.ts`. |
| The Biome ratchet did not move | `node tools/ci/biome-ratchet.mjs` → 529 files, 0 errors / 94 warnings / 27 infos, all equal to baseline |
| zod is a catalog reference, not a new version | `pnpm-workspace.yaml:200` — `zod: ~3.25.76`, already used by the web apps |

## AC #2 — what was actually wrong with `test:e2e`

`test:e2e` was red on `origin/main` (4 suites, 57 failed / 1 passed of 58) and
red on the first draft of this branch with identical counts. **The first reading
of that — "the Drizzle migration fails against the Testcontainers postgres" —
was wrong**, and is recorded here because the wrong version briefly reached this
document.

What is actually true, measured:

- `pnpm exec jest --listTests` in `apps/tedrisat` returns **9** files: 5 unit
  specs **and all 4 `test/e2e/*.e2e.spec.ts`**, because `jest.config.json`
  matches `test/**/*.spec.ts`. The e2e suites were therefore already inside the
  green `test` target the whole time — and the `test` gate needs Docker.
- `test/jest-e2e.json` omitted the `testTimeout: 60000` and `maxWorkers: 1` that
  `jest.config.json` sets. Four Testcontainers postgres instances started in
  parallel and every `beforeAll` blew Jest's 5-second default; the errors were
  `Exceeded timeout of 5000 ms for a hook`, after which `createTestApp` returned
  undefined and the assertions collapsed into noise that *looked* like a
  migration failure.

Adding those two keys (plus the `globalTeardown` the main config already had)
turns `test:e2e` green: **4 suites, 58 tests**. Migrations were never broken.

## Not verified

- **AC #4 — "with `DB_SSL=true` against a server presenting a self-signed
  certificate and no `DB_CA_CERT`, the connection is refused rather than
  established."** **Not verified end-to-end.** No TLS-enabled Postgres was
  stood up. Verified one level down: `resolveDatabaseSsl()` returns
  `{ rejectUnauthorized: true }`, `DatabaseService` passes that value straight
  into `new Pool` (`apps/tedrisat/src/database/database.service.ts:28-35`), and
  `pg` delegates it to `tls.connect`. The refusal rests on documented
  `node:tls` behaviour rather than an observed handshake failure. A real
  self-signed-certificate test is the manual step this task did not run.
- **Whether the two variables are set in every deployment environment.** The
  service now fails closed. If a live environment is missing either variable it
  will stop booting on the next deploy — the intended behaviour, but the
  deployment secrets were not inspected from here.

## A note on the gate

Two prerequisites, both now written into `CLAUDE.md`:

- **`-t test` needs a running Docker daemon**, because 4 of tedrisat's 9 suites
  are the e2e specs. The comment at `.github/workflows/ci.yaml:82-84` says the
  opposite — "the 10 Jest suites in the `test` target need no database". That
  comment is wrong; CI passes only because `ubuntu-latest` ships a Docker
  socket. Correcting it belongs to whoever owns `ci.yaml` next (MDRS-20).
- **`-t build` needs `apps/<app>/.env`** for the four Next.js apps, which
  validate their environment at build time. The 8-project build above was
  measured after copying the four templates.

## Follow-ups

- **`apps/nizam/lib/auth_cookies.ts:62` and `apps/tedris/lib/auth_cookies.ts:62`
  omit `secure: useSecureCookies` on the `nonce` cookie**, while the other five
  entries carry it. With `NEXTAUTH_URL=https://…` next-auth names that cookie
  `__Secure-<app>.nonce`, and a browser rejects a `__Secure-`-prefixed cookie
  set without the `Secure` attribute — so the nonce is never stored and the OIDC
  callback fails its nonce check. Landed in `4305356` (PR #17), not in this
  branch. Same files, line 25: the `callbackUrl` entry drops `httpOnly: true`.
  **Both need their own issue; the first looks like it breaks production
  sign-in.**
- `apps/teskilat/src/config/config.ts:14` carries the same class of defect as
  this task fixed — `process.env.DB_PASSWORD || "password"`. Out of scope for
  MDRS-35, which names tedrisat only.
- `libs/common/src/config/cors.config.ts:1` defaults `ALLOWED_ORIGINS` to `"*"`.
- MDRS-25 (env consolidation, currently Block) rewrites how `config.ts` reads
  its environment. It needs to keep `readSecurityEnv` / `requireDbPassword` /
  `resolveDatabaseSsl` rather than re-flatten them into `||` chains.
