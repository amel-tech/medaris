# MDRS-97 — the Keycloak configuration in the repository

Until this change the only realm was `amel-tech-dev`, configured by hand, and
the repository held `tools/keycloak/setup-realm.sh`, which creates clients but
none of the realm's settings. This change adds `config/keycloak/`, a
declarative package the production realm `medaris` is provisioned from. How to
use it is in [`config/keycloak/RUNBOOK.md`](../../config/keycloak/RUNBOOK.md).

## What was done

- **`config/keycloak/`** as the issue lays it out: `realms/_base.json` +
  `realms/medaris.json` (name and display name only, deep-merged with
  `jq -s '.[0] * .[1]'`), `clients/_base.json` + `clients/<env>/<client>.json`
  for two environments (`local`, `prod`), `user-profile.json`,
  `env/<env>.env.example`, `RUNBOOK.md`, and `scripts/` with `validate`,
  `dry-run`, `provision` and `verify`.
- **Realm settings pinned** in `realms/_base.json`: registration on, e-mail
  verification on, login with e-mail, no duplicate e-mails, password reset on;
  brute-force protection (lock after 10 failures, up to 15 minutes); password
  policy `length(10) and notEmail and notUsername`; `sslRequired: external`;
  internationalisation with `tr`, `en`, `ar` and `tr` as default; login and
  e-mail theme `medaris-keycloak-theme` (the e-mail templates shipped with
  MDRS-100, already on this branch); token, code and session lifetimes written
  out (access token 5 min, SSO idle 30 min, SSO max 10 h, offline idle 30 days,
  …); the realm role `SYSTEM_ADMIN`.
- **Clients.** Web clients are confidential, standard flow only, PKCE S256,
  exact redirect URI (`<origin>/api/auth/callback/keycloak`), web origin and
  post-logout URIs (`<origin>` and `<origin>/`, which `NEXTAUTH_URL` is sent
  as), and an `oidc-audience-mapper` that puts `tedrisat-api` into the access
  token. `tedrisat-api` has every flow off. Nothing is wildcarded; `validate`
  refuses a `*`.
- **User profile**: the four built-in attributes, with first name, last name
  and e-mail required for users and admins, and no other attribute.
- **Idempotent provisioning.** Every part is compared first; missing parts are
  created with `POST`, differing ones updated with `PUT` (the realm, roles,
  user profile, clients, and each protocol mapper separately, because a client
  `PUT` leaves mappers alone). Nothing is skipped because it exists.
- **SMTP one way only.** The MDRS-98 step moved into
  `config/keycloak/scripts/lib/smtp.sh`; `tools/keycloak/setup-realm.sh` step 5
  and `provision` both source it, so the checks, the payload and the
  `ALLOW_INSECURE_SMTP` rule are the same code.
- **No secret in argv.** The new scripts send the admin password on stdin and
  the bearer token through a header file descriptor, and read client secrets
  and the SMTP password through jq's `$ENV`. This is the MDRS-98 follow-up,
  done for the new scripts; `setup-realm.sh`'s own `authenticate` and `api`
  are unchanged.
- **`validate` refuses literal secrets**: a JSON key named `secret`,
  `password`, `credentials`, `token`, … anywhere in the package, a value that
  looks like a JWT or a PEM private key, an `smtpServer` block, and a value on
  a `*SECRET*`/`*PASSWORD*` line of an `env/*.env.example`. Filled copies
  (`config/keycloak/env/*.env`) are git-ignored.
- `tools/keycloak/setup-realm.sh` is kept for `amel-tech-dev`, which the issue
  says to leave alone; its header now says so.

Decisions taken where the issue left room, to confirm:

| Decision | Chosen | Why |
| -- | -- | -- |
| Production client IDs | `tedris`, `nizam`, `nazir` | The dev realm uses `<app>-dev`; the production realm is its own namespace |
| Production origins | `https://tedris.medaris.app`, `https://nizam.medaris.app`, `https://nazir.medaris.app` | The dev apps are at `<app>-dev.medaris.app`; the production hosts are used as examples in `libs/common/src/config/cors.config.ts`. Not verified against Coolify — MDRS-96 creates those applications |
| E-mail as username | off (`registrationEmailAsUsername: false`) | The issue lists "sign-in with e-mail" (`loginWithEmailAllowed`), not "e-mail as username"; the register form therefore still asks for a username |
| `sslRequired` | `external` | "SSL required" for every non-private address. `all` would lock out a Keycloak whose reverse proxy terminates TLS without forwarding the scheme, and makes the http container of the e2e suite unusable |

## What was verified

`apps/tedrisat/test/e2e/keycloak-provision.e2e.spec.ts`, against a blank
Keycloak 26.3.2 container and a Mailpit container that only accepts mail after
SMTP AUTH with a per-run password — 7 tests, green:

- `validate` passes on the repository, and fails with
  `clients/prod/tedris.json: literal secret at .secret` on a copy with a secret
  in it; `provision` on that copy stops before it contacts the server.
  **(AC: no secret committed / validate fails on a literal secret.)**
- `provision local` on the blank container creates the realm, and the realm
  read back carries every setting pinned above, the `SYSTEM_ADMIN` role, the
  user profile and the client shapes. **(AC: provisioning a blank Keycloak 26
  yields a working realm.)**
- A second `provision` reports `0 difference(s) applied` and no `created` or
  `updated` line; `verify` prints `no difference`. **(AC: running provision
  twice changes nothing.)**
- On a copy with `accessTokenLifespan: 600` and one more redirect URI,
  `dry-run` names both and writes nothing; `provision` applies both; `verify`
  against the unchanged repository then exits 1 with
  `realm.accessTokenLifespan: repository 300, server 600`; a repository run
  restores it. **(AC: changing a setting in the JSON and re-running applies
  it.)**
- With `KC_CLIENT_SECRET_TEDRIS_LOCAL` set, `provision` updates the client and
  prints `client.secret: differs (value hidden)`; the secret is then the
  client's. With `curl` and `jq` replaced by argv-logging wrappers, neither the
  client secret, the SMTP password nor the admin password appears in any
  command line, stdout or stderr.
- A new user opens the registration page through `tedris-local` with PKCE,
  registers, gets no code yet (verification pending), receives the
  verification e-mail from `no-reply@medaris.test` in Mailpit, follows its
  link in the same browser, is redirected to the web client's callback with a
  code, and is `emailVerified: true`. The code exchange with PKCE verifier and
  client secret yields an access token with `iss = <kc>/realms/medaris`,
  `aud ∋ tedrisat-api`, `azp = tedris-local`, `email_verified: true`, and
  tedrisat — real AuthGuard and `KeycloakPublicKeyProvider` against the
  container — answers `GET /flashcard/decks/collections` with 200. **(AC:
  register, receive, verify, token tedrisat accepts.)**
- `keycloak-audience.e2e.spec.ts` (9 tests) and `keycloak-smtp.e2e.spec.ts`
  (9 tests) are green after the SMTP step moved into the shared library —
  18/18. **(AC: the audience e2e still passes.)**

Without the theme JAR, Keycloak 26.3.2 logs
`Failed to find LOGIN theme medaris-keycloak-theme, using built-in themes` and
serves the built-in pages — measured on the container; that is how the e2e
test reaches the register form without MDRS-99.

## What was not verified

- **The production realm has been provisioned from the package (AC 5).** That
  is a run of `provision prod` by the Keycloak admin with the production
  credentials, SMTP settings and client secrets from the secret store; none of
  them is reachable from here. The steps are in `RUNBOOK.md` → Provision.
- **The production hosts and client IDs** in `clients/prod/` (table above);
  a wrong origin surfaces as `Invalid parameter: redirect_uri` on sign-in.
- **The theme on the production realm.** `loginTheme`/`emailTheme` name
  `medaris-keycloak-theme`; until MDRS-99 deploys the JAR, the realm falls back
  to the built-in theme.
- **Real e-mail delivery.** Mailpit accepts everything; inbox placement,
  SPF/DKIM/DMARC and TLS to a real provider are MDRS-98's open points.
- **Brute-force protection and password policy behaviour** were verified as
  settings read back, not by failing logins or rejected passwords.

## Review findings

The `/code-review` run was lost with its session, so the diff was reviewed
line by line by hand. Seven findings. Fixed: `find -printf` in the
environment listing (GNU only, broke on macOS); a `created` line printed before
the write it reports; a 401/403/5xx on the existence check read as "missing"
and answered with a `POST` (now only 404 means missing, anything else stops
the run); `KC_REALM` used unchecked as a file name and URL segment; the
60-second master admin token could expire in a slow remote run (renewed after
45 s); under a Turkish locale `tr` upper-cased `tedris` to `TEDRİS`, and the
secret variable name came out as `KC_CLIENT_SECRET_TEDR_S`. Bash's `[a-z]`
under the same locale leaves out `i`, so the scripts now run with
`LC_ALL=C`. Deferred: `verify` does not list clients that exist only on the
server (below).

## Follow-up

- Bring `amel-tech-dev` under the package (the issue's own follow-up), once
  its other clients are accounted for.
- `setup-realm.sh` still puts the admin password and bearer token on curl's
  command line (MDRS-98 follow-up); the new scripts show the fix.
- `verify` does not report clients that exist on the server but not in
  `clients/<env>/`; Keycloak's built-in clients would need an allow-list first.
