# MDRS-85 — one production-Swagger resolver, two named policies

## Problem

Both APIs get the same `SWAGGER_ENABLED` value. It is shipped once as
`API__SWAGGER_ENABLED`, and docker-compose.yml maps it into each service. The
decision about what that flag means in production was implemented twice:

| File | Behaviour under `NODE_ENV=production` |
| --- | --- |
| `apps/tedrisat/src/config/swagger-env.ts` — `resolveSwaggerEnabled` | throws unless `SWAGGER_ALLOW_IN_PRODUCTION=true` (MDRS-33) |
| `apps/teskilat/src/config/swagger-env.ts` — `swaggerEnabledUnlessProduction` | returns `false`, with no opt-in and no throw (MDRS-69) |

The two behaviours differ on purpose. `docs/migration/mdrs-69-teskilat-config-hygiene.md`
explains why teskilat must not throw on a key it shares with tedrisat. Having
two implementations was not a decision: a third service, or a config factory
copied between the apps, would pick up whichever file it happened to import.

## What changed

- **`libs/common/src/config/swagger-production.config.ts` (new).** Holds the
  single implementation, exported from `@medaris/common`:
  - `resolveSwaggerEnabled(rule, env)`
  - `swaggerSuppressedByProduction(rule, env)`
  - `swaggerProductionSuppressionNotice(rule)`
  - `SWAGGER_PRODUCTION_OPT_IN`

  Every caller passes
  `rule = { policy: "throw-unless-opted-in" | "refuse-in-production", service }`.
  The rationale for both policies, previously split across the two per-app
  files, now sits in this file's header.
- **tedrisat.** `config/config.ts` calls the resolver with
  `throw-unless-opted-in`. `swagger-env.ts` is deleted. The tedrisat-only
  `resolveSwaggerOauthRedirectOrigin` it also held moved, unchanged, to
  `config/swagger-oauth-redirect.ts`. Its importers (`main.ts`,
  `test/unit/config.spec.ts`) and one comment in `throttle-env.ts` were updated.
- **teskilat.** `config/config.ts` and `swagger.ts` both name
  `refuse-in-production` at their own call site. `swagger-env.ts` is deleted.
- **Exactly one implementation remains.** `grep -rn "swagger-env\|swaggerEnabledUnlessProduction" apps libs` finds only the history
  note in the new file's header and a local alias inside teskilat's unit spec.

### What changed in behaviour

- **Message wording.** tedrisat's throw message is byte-identical, because the
  service name is substituted into the same text. teskilat's suppression
  notice said "a key teskilat shares with tedrisat"; it now says "a key the
  APIs share", because the notice lives in the shared file. Both messages
  still name `SWAGGER_ENABLED` and the service, and teskilat's still says
  "There is no opt-in".
- **No other behaviour change.** Both policies key on the exact
  `NODE_ENV === "production"` and treat any `SWAGGER_ENABLED` other than
  `"true"` as off, as the two originals did.

## Tests

- **tedrisat `test/unit/config.spec.ts`.** Unchanged except for the import path
  of the redirect-origin helper. Its five Swagger cases still run through
  `configuration()`.
- **teskilat `test/e2e/swagger.e2e.spec.ts`.** Assertions unchanged. One
  docblock line named the deleted function and now refers to "the shared
  resolver".
- **teskilat `test/unit/swagger-env.spec.ts` → `swagger-policy.spec.ts`.** The
  existing cases are kept, at the same count (24 tests in the project), and
  now call the shared resolver with teskilat's rule.
- **`libs/common/test/config/swagger-production.config.spec.ts` (new).** Holds
  six cases for the resolver itself, with both policies side by side:
  - `throw-unless-opted-in` throws and names the opt-in and the service;
  - the opt-in unlocks only `throw-unless-opted-in`;
  - `refuse-in-production` never throws;
  - only `refuse-in-production` reports a suppression;
  - both policies agree outside production and when the flag is off;
  - the notice names the service and the variable, and says there is no
    opt-in.

  `libs/common` has a Vitest `test` target, inferred from
  `libs/common/vitest.config.ts` rather than declared in `project.json`. An
  earlier version of this record said the library had none, which was wrong.
  The cases were first written into teskilat's spec and moved here during
  review.

## Verification

- **Fail-closed check.** I swapped the policies at the call sites:
  - tedrisat → `refuse-in-production`: 2 of the 29 tests in `config.spec.ts`
    fail (the throw case and the opt-in case).
  - teskilat → `throw-unless-opted-in` at both call sites: 6 tests fail — 1 in
    `swagger-policy.spec.ts` ("resolves swagger.enabled to false in
    production") and 5 in `swagger.e2e.spec.ts`.
  - The opt-in check removed inside the resolver, so `throw-unless-opted-in`
    returns `true` in production: 1 of the 6 common cases fails ("throws in
    production without the opt-in").
  - All restored.
- **Gate** with `--skip-nx-cache` and Docker running:
  - typecheck 17, lint 17, module-boundaries 17, build 8 and test 5 projects,
    all green;
  - tedrisat `tests="377" failures="0"`, teskilat 24 passed, common 57 passed
    (51 before this change);
  - `pnpm run security-check` exits 0;
  - `tools/ci/biome-ratchet.mjs` reports `warnings 79 (baseline 79)`. Its one
    `format` error comes from the untracked, git-excluded `.cursor/mcp.json`
    and also reproduces on `origin/main`.
