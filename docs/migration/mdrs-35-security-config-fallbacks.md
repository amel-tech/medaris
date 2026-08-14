# MDRS-35 — Remove silent security-config fallbacks, verify database TLS

Base: `68faa44`. Independent of PR #80; see the MDRS-25 note under "Follow-ups".

## What changed

| File | Change |
| --- | --- |
| `apps/tedrisat/src/config/config.ts` | `KEYCLOAK_JWKS_URL` and `DB_PASSWORD` are validated with zod and no longer carry a default. The `\|\| "test-url"` fallback and the TODO above it are gone, as is `\|\| "tedrisat"` for the password. `NODE_ENV=test` keeps both fallbacks. |
| `apps/tedrisat/src/config/database-ssl.ts` | New. `resolveDatabaseSsl()` — one implementation of the `ssl` option, shared by the runtime pool and the migration client so they cannot drift. |
| `apps/tedrisat/drizzle.config.ts` | Uses `resolveDatabaseSsl()`; `password` lost its `"tedrisat"` fallback for the same reason as the runtime config. |
| `apps/tedrisat/package.json` | `zod: "catalog:"` added to `dependencies`. |
| `apps/tedrisat/test/unit/config.spec.ts` | New. 10 tests over the two behaviours. |
| `.env.example`, `apps/tedrisat/.env.example` | Document that the two variables are required, and add the new `DB_CA_CERT`. |
| `CLAUDE.md`, `README.md` | Gate expectation corrected to the measured 101 tests / 11 suites, and the build's `.env` prerequisite written down (see "A note on the gate"). |

### The TLS change

Before, `DB_SSL=true` produced `{ rejectUnauthorized: false }` in both files: the
connection was encrypted but the server was never authenticated, so anything
answering on the host:port was trusted. Now `DB_SSL=true` produces
`{ rejectUnauthorized: true }`, plus `ca: DB_CA_CERT` when that PEM bundle is
set. Without `DB_CA_CERT` the platform trust store applies.

**This is a breaking change for any deployment that runs `DB_SSL=true` against a
self-signed or private-CA certificate** — such a connection now fails instead of
silently succeeding, and needs `DB_CA_CERT`. That is the point of the issue, but
it needs saying before a deploy discovers it.

### Why the requirement covers development, not only production

The issue's proposal says "throw … outside `NODE_ENV=test`" while its first
acceptance criterion names `NODE_ENV=production`. The wider reading is
implemented, for two reasons: a production deployment that also forgets to set
`NODE_ENV` is still caught, and both `.env.example` files already ship both
values, so a developer who copies the template is unaffected. `NODE_ENV=test`
remains exempt — `apps/tedrisat/test/helpers/test-app.helper.ts:51-67` sets both
variables before `AppModule` is imported, and no unit suite boots the container.

## Verified

Every figure below came from command output in this worktree.

| Claim | How it was checked |
| --- | --- |
| Baseline was green before the change | `typecheck` 16 projects, `test` 3 projects — run on `68faa44` before editing |
| AC #3 — no `rejectUnauthorized: false` remains | `grep -rn 'rejectUnauthorized' apps libs` → 2 hits, both `true`, both in the new helper's output path |
| The shared helper loads under drizzle-kit | `DB_PASSWORD=x pnpm exec drizzle-kit check` → "Everything's fine", exit 0 — the `./src/config/database-ssl` import resolves in drizzle-kit's own loader, not just under `tsc` |
| Missing `KEYCLOAK_JWKS_URL` / `DB_PASSWORD` throw, naming the variable | `test/unit/config.spec.ts`, 10 tests |
| zod is a catalog reference, not a new version | `pnpm-workspace.yaml:200` — `zod: ~3.25.76`, already used by the web apps |

## Not verified

- **AC #4 — "with `DB_SSL=true` against a server presenting a self-signed
  certificate and no `DB_CA_CERT`, the connection is refused rather than
  established."** **Not verified end-to-end.** No TLS-enabled Postgres was
  stood up. What was verified is one level down: `resolveDatabaseSsl()` returns
  `{ rejectUnauthorized: true }`, `DatabaseService` passes that value straight
  into `new Pool` (`apps/tedrisat/src/database/database.service.ts:28-35`), and
  `pg` delegates it to `tls.connect`. The refusal therefore rests on documented
  `node:tls` behaviour rather than on an observed handshake failure. A real
  self-signed-certificate test is the manual step this task did not run.
- **Whether the two variables are set in every deployment environment.** The
  service now fails closed. If a live environment is missing either variable it
  will stop booting on the next deploy, which is the intended behaviour, but
  the deployment secrets were not inspected from here.

## Follow-ups

- `apps/teskilat/src/config/config.ts:14` carries the same class of defect —
  `process.env.DB_PASSWORD || "password"`. Out of scope for MDRS-35, which names
  tedrisat only; worth its own issue.
- `libs/common/src/config/cors.config.ts:1` defaults `ALLOWED_ORIGINS` to `"*"`.
  A separate permissive-default question, not touched here.
- MDRS-25 (env consolidation, currently Block) rewrites how this same file reads
  its environment. It will need to preserve `readSecurityEnv` and
  `resolveDatabaseSsl` rather than re-flatten them into `||` chains.
