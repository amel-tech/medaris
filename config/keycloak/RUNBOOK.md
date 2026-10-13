# Keycloak configuration — runbook

The `medaris` realm is configured from this directory, not by hand in the admin
console (MDRS-97). A change made in the console is drift: the next `provision`
overwrites it, and `verify` reports it until then.

| Path | Holds |
| -- | -- |
| `realms/_base.json` | Every realm setting shared by all environments, including the `SYSTEM_ADMIN` realm role |
| `realms/<realm>.json` | Only `realm` and `displayName`; deep-merged over `_base.json` (`jq -s '.[0] * .[1]'`) |
| `clients/_base.json` | Settings shared by every client: confidential, every flow off |
| `clients/<env>/<client>.json` | One client of one environment; deep-merged over `clients/_base.json` |
| `user-profile.json` | The declarative user profile: first name, last name and e-mail required, plus the required privacy-notice box `privacyNoticeRead` (MDRS-102); nothing else |
| `env/<env>.env.example` | The variables the scripts read for that environment — no values for secrets |
| `scripts/` | `validate`, `dry-run`, `provision`, `verify` |

Environments are the directories under `clients/`: `local` (a Keycloak on your
machine, clients on `localhost:4000–4002`) and `prod` (`auth.medaris.app`,
clients on `tedris|nizam|nazar.medaris.app`). Both provision the realm named by
`KC_REALM`, `medaris` by default.

The shared development realm `amel-tech-dev` is **not** managed from here; it
serves other clients too, and turning registration on there would open
self-signup for all of them. It is still set up by
`tools/keycloak/setup-realm.sh`.

Requirements: `bash`, `curl`, `jq`.

## The four scripts

| Script | Talks to the server | Writes | Exit code |
| -- | -- | -- | -- |
| `validate [<env>]` | no | no | 1 on any problem: invalid JSON, a missing required field, a wildcard or empty redirect URI, a web client without PKCE S256 or the audience mapper, a back-channel logout URL on a client with front-channel logout on, or a **literal secret** in any file |
| `dry-run <env>` | reads | no | 0; prints what `provision` would create or update |
| `provision <env>` | reads, writes | yes | 0 on success; runs `validate <env>` first and stops on a failure |
| `verify <env>` | reads | no | 1 if the server differs from the repository, with one line per difference |

`provision` is idempotent. Each part — the realm, the mail sender, each realm
role, the user profile, each client and its protocol mappers — is compared
first; what is missing is created with `POST`, what differs is updated with
`PUT`, what matches is reported as `in sync`. Nothing is skipped because it
already exists. A second run reports `0 difference(s) applied`, and `verify`
then prints `no difference`.

What the comparison covers: every setting the repository sets. A setting the
repository leaves out is not compared (Keycloak has hundreds). Protocol mappers
and user-profile attributes are compared by name in both directions, so a
mapper or attribute added by hand shows up. Clients that are not in
`clients/<env>/` (Keycloak's own `account`, `admin-cli`, … and any added by
hand) are not compared. A client secret is compared only when its
`KC_CLIENT_SECRET_*` variable is set, and its value is never printed.

## Provision

1. Get the admin credentials, the client secrets and the SMTP settings from
   the secret store.
2. `cp config/keycloak/env/prod.env.example config/keycloak/env/prod.env`
   (git-ignored) and fill it. Leave a `KC_CLIENT_SECRET_*` empty to keep the
   secret the client already has.
3. Load it and check what would change:

   ```bash
   set -a; . config/keycloak/env/prod.env; set +a
   config/keycloak/scripts/dry-run prod
   ```

4. Apply, then confirm:

   ```bash
   config/keycloak/scripts/provision prod
   config/keycloak/scripts/verify prod     # expect: verify: no difference
   ```

5. On a first provisioning, copy each web client's secret (admin console →
   Clients → `tedris` → Credentials) into that app's `KEYCLOAK_CLIENT_SECRET`
   in Coolify, unless you set it through `KC_CLIENT_SECRET_*` in step 2.
6. `rm config/keycloak/env/prod.env`.

The tedrisat API of that environment needs, for this realm:

```
KEYCLOAK_ISSUER=https://auth.medaris.app/realms/medaris
KEYCLOAK_JWKS_URL=https://auth.medaris.app/realms/medaris/protocol/openid-connect/certs
KEYCLOAK_AUDIENCE=tedrisat-api
KEYCLOAK_ALLOWED_CLIENTS=tedris,nizam,nazar
```

and each web app `KEYCLOAK_ISSUER` as above and `KEYCLOAK_CLIENT_ID` = its
client (`tedris`, `nizam`, `nazar`).

Guards, the same as `tools/keycloak/setup-realm.sh`: a `KC_URL` that is not
`http://localhost` needs `ALLOW_REMOTE=1` and explicit admin credentials; a
remote `http://` URL additionally needs `ALLOW_INSECURE_HTTP=1`. The admin
password, the bearer token, client secrets and the SMTP password never appear
on a command line (they reach `curl` and `jq` on stdin, through a file
descriptor or through jq's `$ENV`) and are never printed.

## Rotate a client secret

1. Generate a new secret (e.g. `openssl rand -base64 32`) and store it in the
   secret store.
2. Set it as `KC_CLIENT_SECRET_<CLIENT>` (`tedris` → `KC_CLIENT_SECRET_TEDRIS`,
   `tedris-local` → `KC_CLIENT_SECRET_TEDRIS_LOCAL`) and run
   `provision <env>`. The client is reported as `updated` with
   `client.secret: differs (value hidden)`.
3. Put the same value into the app's `KEYCLOAK_CLIENT_SECRET` and redeploy it.
   Between steps 2 and 3 that app's sign-in fails, so do them back to back.
4. `verify <env>` with the variable still set: `no difference`.

## Add a redirect URI

1. Add the exact URI to `redirectUris` in `clients/<env>/<client>.json` —
   no `*`, no wildcard host; `validate` refuses one. For a new origin add it to
   `webOrigins` and to `post.logout.redirect.uris` (entries joined with `##`)
   too.
2. `validate`, open a pull request, merge.
3. `dry-run <env>` shows `client <id>: would update` with the new list;
   `provision <env>` applies it; `verify <env>` reports `no difference`.

## Grant SYSTEM_ADMIN

`provision` creates the realm role; it does not assign it to anyone.

1. Admin console → realm `medaris` → Users → the person → Role mapping →
   Assign role → Filter by realm roles → `SYSTEM_ADMIN` → Assign.
2. The role is in the person's next access token (`realm_access.roles`), so
   they sign out and in again. tedrisat checks for exactly the string
   `SYSTEM_ADMIN` (`libs/common/src/authz/scopes.ts`, `ROLES.SYSTEM_ADMIN`).

Grant it to as few people as possible; it bypasses every ownership check.

## Change a realm setting

Edit `realms/_base.json` (or, for the name and display name only,
`realms/<realm>.json`), then `validate` → pull request → `dry-run <env>` →
`provision <env>` → `verify <env>`. The same holds for `user-profile.json`:
its `PUT` replaces the whole profile, so an attribute that is not in the file
is removed from the realm.

## Copy the genders tedrisat already has (gender rollout, step 2)

#317 makes `gender` (`FEMALE` / `MALE`) a required attribute of the user
profile and puts it into the tokens as the `gender` claim; from then on
Keycloak is the one source of a person's gender, and tedrisat's
`user_profiles.gender` only mirrors the claim. #317's "Production order" (in
its section on the gender, in this file once it is merged) has four steps.
**Step 2** copies the genders people already chose in tedris into their
Keycloak accounts, so the realm does not ask them again when step 3 makes the
attribute required. `tools/keycloak/backfill-gender.mjs` is that step: it
does what #317's steps 2.2 and 2.3 describe by hand.

What it does: it reads the `user_profiles` rows whose `gender` is `FEMALE` or
`MALE` (`user_id` is the Keycloak `sub`) and, for each, reads the account
(`GET /admin/realms/<realm>/users/<id>`). An account that already has a
gender keeps it; an account without one gets tedrisat's, written back with
every other attribute as it was read (`PUT` of the same representation). A
dry run is the default; `--apply` writes. It prints counts only, never an id,
a URL with credentials, a password or a token. Nothing secret is ever an
argument: the settings come from env files, which the tool reads itself and
does not load into the environment.

1. Do step 1 of #317's order first (the theme is live), then its step 2.1:
   admin console → realm `medaris` → Realm settings → General → Unmanaged
   attributes → **Only administrators can edit** → Save. Until the profile
   declares `gender` (step 3), Keycloak drops an attribute nobody may edit.
2. Two git-ignored env files: `config/keycloak/env/prod.env`, filled as for
   `provision` (the tool reads its `KC_URL`, `KC_REALM`, `ALLOW_REMOTE`,
   `KC_ADMIN_USER` and `KC_ADMIN_PASSWORD`), and
   `config/keycloak/env/tedrisat-db.env` with one line,
   `TEDRISAT_DATABASE_URL=postgres://<user>:<password>@<host>:<port>/tedrisat_db?sslmode=require`,
   for a role that can `SELECT` from `user_profiles` (a read is all it does
   there). The machine running it must reach both the database and Keycloak.
3. Dry run, from the repository root after `pnpm install` (the tool uses
   tedrisat's `pg`):

   ```bash
   node tools/keycloak/backfill-gender.mjs \
     --env-file config/keycloak/env/prod.env \
     --env-file config/keycloak/env/tedrisat-db.env
   ```

   It prints how many profiles have a gender, how many of them have no
   Keycloak account (deleted there), how many accounts already have a gender
   (and how many of those another one: Keycloak's stays), and how many it
   would write.
4. Apply: the same command with `--apply`. `written` should equal the dry
   run's `would write`. `refused by Keycloak (400)` counts accounts whose
   profile lacks something an admin must fill (a last name); they are left
   alone, and Keycloak asks those people at their next sign-in. Any other
   answer from Keycloak (401, 403, 5xx) stops the run with exit code 1 after
   printing how far it got; running it again continues, since a written
   account now has its gender.
5. Check: a second dry run prints `would write: 0`, and
   `GET /admin/realms/medaris/users/count?q=gender:FEMALE` plus the same for
   `MALE` is at least the dry run's profile count less `not in Keycloak` and
   `refused by Keycloak (400)`.
6. `rm config/keycloak/env/tedrisat-db.env`, then go on with #317's step 3.

tedrisat and tedris need nothing for this step: until the `gender` scope
reaches the tokens (#317 step 4) they behave as before. Afterwards the claim
is the caller's gender (`libs/common/src/auth-guard/access-token-claims.ts`),
`user_profiles.gender` follows it (`apps/tedrisat/src/user/user-sync.service.ts`),
and tedris shows it read-only with a link to Keycloak's profile form.

## Back-channel logout and the session store (auth Phase 2)

tedris, nizam and nazar keep their sessions in Valkey when
`AUTH_STORE_URL` is set (`libs/auth/README.md`, "Phase 2"). Keycloak then
tells each app when an SSO session ends (OIDC Back-Channel Logout), and the
app deletes the sessions behind it at once; a sign-out in one app ends the
others without waiting for the minute-long `userinfo` check.

### The clients

`clients/<env>/{tedris,nizam,nazar}.json` set, for each web client:

| Setting (admin console: Client → Settings → Logout settings) | Value |
| -- | -- |
| `frontchannelLogout` (Front channel logout) | `false` |
| `backchannel.logout.url` (Backchannel logout URL) | prod: `https://<app>.medaris.app/api/auth/backchannel-logout`; local: `http://host.docker.internal:400x/api/auth/backchannel-logout` |
| `backchannel.logout.session.required` (Backchannel logout session required) | `"true"`: the token names the SSO session (`sid`) the apps index |
| `backchannel.logout.revoke.offline.tokens` (Backchannel logout revoke offline sessions) | `"false"`: the apps hold no offline tokens |

Front-channel logout has to be off: Keycloak skips the back-channel call for a
client that has it on (`AuthenticationManager.backchannelLogoutClientSession`
and `browserLogoutAllClients` in Keycloak 26.3.2,
`services/src/main/java/org/keycloak/services/managers/AuthenticationManager.java`).
`validate` refuses a back-channel URL on a front-channel client.
`tedrisat-api` is not a web client and is unchanged. Apply with
`dry-run prod` → `provision prod` → `verify prod`, like any client change.

A failed back-channel call (the app is down, or still keeps its sessions in
the cookie and answers 501) does not stop the sign-out and is not retried;
the app notices at its next refresh (about five minutes), or within a minute
in cookie mode. So the steps below can happen in any order; the order that
leaves nothing waiting is: deploy the apps, provision the clients, then set
the store variables.

The local Keycloak reaches the apps on the host as `host.docker.internal`;
on Linux start it with `--add-host=host.docker.internal:host-gateway`
(`env/local.env.example`).

The shared dev realm `amel-tech-dev` is not provisioned from here, and
`tools/keycloak/setup-realm.sh` never reconfigures an existing client (it only
warns when these settings differ). Its clients `tedris-dev`, `nizam-dev` and
`nazar-dev` are set by hand: admin console → realm `amel-tech-dev` → Clients
→ the client → Settings → Logout settings → Front channel logout **Off**,
Backchannel logout URL `https://<app>-dev.medaris.app/api/auth/backchannel-logout`,
Backchannel logout session required **On**, Backchannel logout revoke offline
sessions **Off** → Save.

### Valkey

One ACL user per environment, limited to its own key prefix and to the
commands the store sends (`libs/auth/test/valkey-store.e2e.spec.ts` runs the
store as exactly this user against `valkey/valkey:8`):

```
ACL SETUSER medaris-prod reset on >********** ~prod:auth:* resetchannels -@all +get +set +del +sadd +srem +smembers +pexpire +eval
ACL SETUSER medaris-dev  reset on >********** ~dev:auth:*  resetchannels -@all +get +set +del +sadd +srem +smembers +pexpire +eval
```

Keep the users across restarts (an ACL file with `ACL SAVE`, or `user` lines
in the server's configuration). Keys, under `<prefix>:auth:<app>:`:
`s:<sha256 of the cookie's id>` (the sealed session), `sid:<sid>` and
`sub:<sub>` (sets, for back-channel logout), `lock:<hash>` (a refresh in
progress, 10 s), `jti:<jti>` (a logout token already used, 3 minutes). Every
key has a TTL; the sessions' follow the refresh token's lifetime.

Each of the three apps, in Coolify:

| Variable | prod | dev |
| -- | -- | -- |
| `AUTH_STORE_URL` | `redis://medaris-prod:<password>@<valkey host>:6379/0` | `redis://medaris-dev:<password>@<valkey host>:6379/0` |
| `AUTH_STORE_KEY_PREFIX` | `prod` | `dev` |

(`WEB__AUTH_STORE_URL` and `WEB__AUTH_STORE_KEY_PREFIX` in a root `.env`.) An
app given the URL without a prefix fails loudly: `createAuth` throws, so every
request answers 500 until the prefix is set. On the first request after the
switch, each browser's Phase 1 session cookie is moved into the store;
nobody signs in again.

To check: sign in to two apps, sign out in one, and reload the other: it is
signed out at once. `prod:auth:*` keys appear in Valkey
(`SCAN 0 MATCH prod:auth:* COUNT 100` as an admin user).

If Valkey cannot be reached, protected pages show the app's error page and
public pages render as for a visitor; nobody is sent through Keycloak. The
apps log `@medaris/auth: session store unavailable` at most every 30 s.
