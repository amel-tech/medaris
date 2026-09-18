# MDRS-42 — per-app Keycloak clients and the audience the API checks

## Problem

MDRS-30 made `JwtVerifierService` check `iss`, `aud`, `typ` and `azp`. It could
not make the realm mint an `aud` that names the API. Keycloak adds a client id
to `aud` only when an audience mapper asks for it, and no such mapper existed.
So `.env.example`, the runbook and the deployed service all use
`KEYCLOAK_AUDIENCE=account`. Keycloak puts that audience into **every** access
token of the realm. The client binding therefore rests on the `azp`
allow-list alone.

The realm setup that would fix this was in madrasah-backend PR #80
(`scripts/setup-keycloak.sh`, 262 lines), and it never reached medaris.

## What changed

### `tools/keycloak/setup-realm.sh` (new)

An idempotent realm setup script. It talks to the Keycloak admin REST API with
`curl` + `jq`. When they are missing, it creates:

| Object | Settings |
| --- | --- |
| realm `amel-tech-dev` | enabled |
| client `tedrisat-api` | confidential; standard, implicit, password and service-account flows all **off**. It exists only to be named in `aud`, and nothing logs in through it. |
| clients `tedris-dev`, `nizam-dev`, `nazir-dev` | confidential, standard flow only, **PKCE S256 required**, redirect and post-logout URIs on the app's origin, plus an `oidc-audience-mapper` named `audience-tedrisat-api` that puts `tedrisat-api` into the access token's `aud` |
| users `owner-user`, `stranger-user` | only with `--with-test-users`, only against localhost |

A second run creates nothing and prints `exists` for every step.

**An existing client is never reconfigured.** The script adds a missing audience
mapper and nothing else. Redirect URIs, flows and the secret are left as they
are. If an existing client is public, lacks PKCE S256 or allows the password
grant, the script prints a warning and leaves the client alone. This is what
makes it safe to run against a realm that already serves users (see
**Rollout**). The same thinking sets the script's guards. A non-localhost
`KC_URL` requires `ALLOW_REMOTE=1` and explicit admin credentials.
`--with-test-users` and `--print-secrets` are refused there.

### `apps/tedrisat/test/e2e/keycloak-audience.e2e.spec.ts` (new)

The spec starts `quay.io/keycloak/keycloak:26.3.2` in a Testcontainer, runs the
script against it, and boots tedrisat with the **real** `AuthGuard` and
`KeycloakPublicKeyProvider`, pointed at that realm with
`KEYCLOAK_AUDIENCE=tedrisat-api`. Five cases:

1. The first run creates the realm, the API client, the web client and the mapper.
2. A second run prints no `created`, and `exists` appears six times.
3. An authorization request to `tedris-dev` without a `code_challenge` is
   answered `error=invalid_request`, so PKCE is enforced.
4. `owner-user` logs in through `tedris-dev` the way next-auth v4's Keycloak
   provider does (`checks: ["pkce", "state"]`): authorization code, then
   S256 verifier, then client secret. The access token carries
   `aud ⊇ [tedrisat-api]`, `azp: tedris-dev` and `typ: Bearer`, and
   `GET /flashcard/decks/collections` answers **200**.
5. The same login through `unmapped-probe` — a client shaped like a web client
   but with no mapper — yields a token without `tedrisat-api` in `aud`. The API
   answers **401**, and the verifier's rejection reads `jwt audience invalid`.
   The probe is on the `azp` allow-list on purpose, so the audience check is
   the only thing that can refuse it. `AuthGuard` answers every failure with a
   bare 401, so the reason is read from `JWT_VERIFIER` directly.

The Keycloak container adds about 12 s to the tedrisat test run (measured
locally, image already pulled) and one image pull on a cold CI runner.

## Where this departs from PR #80 and from the issue text

| PR #80 / MDRS-42 as filed | Here | Why |
| --- | --- | --- |
| Web clients "public + PKCE" (the issue, and the PR's `AUTHORIZATION.md`) | confidential + PKCE | tedris and nizam authenticate through next-auth on the server with `KEYCLOAK_CLIENT_SECRET` (`apps/*/lib/auth_options.ts`). A public client would break that login. The secret never reaches the browser, so the "SPAs cannot keep a secret" concern does not apply. The PR's own script also created them confidential, despite its header comment. |
| `authorizationServicesEnabled` and `serviceAccountsEnabled` on every client | both off | Nothing in medaris uses Keycloak Authorization Services, and a service account on a web client is a way to mint tokens without a user. |
| `directAccessGrantsEnabled=true` on every client | off | The password grant exists in the PR for curl-based smoke tests. The spec logs in through the real flow instead. |
| `tedris-dev`, `nizam-dev` | plus `nazir-dev` | `.env.example` already names `nazir-dev` in `KEYCLOAK_ALLOWED_CLIENTS` and `NAZIR__KEYCLOAK_CLIENT_ID`. `WEB_CLIENTS` overrides the list. |
| Three users, `SYSTEM_ADMIN` realm role | two users, opt-in, no realm role | The realm role belongs to the authz matrix (MDRS-41/43), not to the audience check. Test users with username-equal passwords must never be created on a shared realm, so they are localhost-only. |
| `docker compose exec keycloak kcadm.sh` | admin REST API over `curl` | medaris's `docker-compose.yml` has no Keycloak service, and the script should work against any reachable Keycloak. |
| "A token minted for `tedris-web` is rejected; one for `tedrisat-api` is accepted" (acceptance criterion) | a web-client token **with** the mapper is accepted; one from a client **without** it is rejected | Under the PR's own design every web client carries the mapper, so a `tedris-dev` token *should* be accepted. The criterion as written contradicts the design it describes. What the check has to prove is that a token not meant for this API is refused. |

## Acceptance criteria — status

| Criterion | Status |
| --- | --- |
| Script creates the clients idempotently on a clean Keycloak | **Met**, cases 1–2 |
| Wrong-audience token 401, right-audience token accepted, asserted by a test | **Met** in the adjusted form above, cases 4–5 |
| Web clients carry no secret in a committed file | **Met.** The secrets are generated by Keycloak, printed only with `--print-secrets` on localhost, and `.env.example` still ships `set-me-per-machine` |
| Issuer/audience variables documented in `.env.example` | **Already met by MDRS-30.** `apps/<app>/.env.example` no longer exists (MDRS-25); the root file's comment is updated here |
| tedris and nizam still log in end to end | **Not verified.** Case 4 runs the exact flow next-auth uses against a client the script built, but the web apps themselves were not started against it. It has to be checked on the shared realm during rollout. |

## Rollout — not done by this change

Nothing here touches the shared `amel-tech-dev` realm at `auth.medaris.app` or
the Coolify environment. Until both steps below happen, the deployed service
keeps `KEYCLOAK_AUDIENCE=account` together with `KEYCLOAK_ALLOWED_CLIENTS`,
exactly as today. The order matters.

1. **A realm admin** runs, against the shared realm:

   ```bash
   KC_URL=https://auth.medaris.app ALLOW_REMOTE=1 \
   KC_ADMIN_USER=… KC_ADMIN_PASSWORD=… \
   tools/keycloak/setup-realm.sh
   ```

   The run adds the audience mapper to each existing web client, creates
   `tedrisat-api` if it is missing, and reports any drift as warnings. A web
   client that does **not** exist on the realm is reported and skipped: without
   `WEB_CLIENTS` the script only knows the localhost origins, and a remote run
   never creates a client from them. To create one, pass its real origin, e.g.
   `WEB_CLIENTS="nazir-dev=https://nazir.medaris.app"`. Tokens
   issued afterwards carry `aud: [tedrisat-api, account]`, which the running
   service still accepts under `account`. **Log in to tedris and nizam at this
   point** — this is the check the acceptance criterion asks for.
2. **Only after that**, set `KEYCLOAK_AUDIENCE=tedrisat-api` in Coolify and
   redeploy. Flipping it first would 401 every session whose access token
   predates the mappers. Keep `KEYCLOAK_ALLOWED_CLIENTS`: once the audience
   names this API it is an optional narrowing, but it still refuses a new realm
   client that someone adds the mapper to by mistake.
3. Change `API__KEYCLOAK_AUDIENCE` in `.env.example` to `tedrisat-api` in a
   follow-up PR once step 2 is live. Local development points at the shared
   realm, so changing it earlier would 401 every local login.

## Verification

- `tools/keycloak/setup-realm.sh --with-test-users`, run twice against a local
  `quay.io/keycloak/keycloak:26.3.2`. The first run printed `created` for all
  objects. The second printed `exists` for every step. Both exited 0.
- `keycloak-audience.e2e.spec.ts`: 5/5 pass.
- Fail-closed, measured with two mutations:
  - (a) Mapper set to `included.client.audience: "account"` in the script:
    case 4 fails, 4 pass.
  - (b) `audience: this.policy.audience` removed from `jwt-verifier.service.ts`
    and `common` rebuilt: case 5 fails, 4 pass.
  - Both restored, 5/5 pass.

## Review follow-up

The AI review of PR #77 found gaps in the script's guards. All were fixed in
the same PR:

| Finding | Change | Pinned by |
| --- | --- | --- |
| `is_local` matched a URL prefix, so `http://localhost:8080@auth.example.org` counted as local and got the `admin`/`admin` defaults | Classified on the host curl connects to (userinfo, port and path stripped). Only `http://localhost` and `http://127.0.0.1` count as local | case "treats a URL that only starts with http://localhost: as remote" |
| A remote run created a missing web client from the localhost `WEB_CLIENTS` defaults | A remote run creates a missing client only when `WEB_CLIENTS` is set; otherwise it warns and skips | case "does not create a missing web client remotely…", which reaches the same container through `0.0.0.0` so the remote path runs |
| `--with-test-users` relied only on the URL, and a port-forward to a shared realm reads as localhost | Also refuses when the realm holds any user other than `owner-user` / `stranger-user` | case "refuses --with-test-users in a realm that has other users" |
| Drift report skipped two flows | Also warns on `implicitFlowEnabled` and `serviceAccountsEnabled` | not covered by a test |
| Editing the script did not invalidate tedrisat's cached `test`, and `nx affected` left it out | `apps/tedrisat/project.json` adds `{workspaceRoot}/tools/keycloak/**` to `test` and `test:e2e` inputs. `nx show projects --affected --files=tools/keycloak/setup-realm.sh` returned `[]` before and `["tedrisat"]` after | — |
| `new URL("")` hid the login diagnostic; the token exchange was not checked | Explicit errors for a missing redirect and a non-2xx token response | — |
| The Keycloak image was pinned twice with nothing tying the copies together | The spec's constant names `apps/keycloak-theme/package.json` as the version of record, and `KEYCLOAK_IMAGE` overrides it | — |
| `-t test` now needs `curl` and `jq` | Added to the prerequisites in CLAUDE.md and README | — |

The three pinned cases were run against the previous script: all three fail,
and the other five pass. With the new script, `keycloak-audience.e2e.spec.ts`
passes 8/8.
