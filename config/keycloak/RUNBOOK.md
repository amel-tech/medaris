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
| `user-profile.json` | The declarative user profile: first name, last name and e-mail required, nothing else |
| `env/<env>.env.example` | The variables the scripts read for that environment — no values for secrets |
| `scripts/` | `validate`, `dry-run`, `provision`, `verify` |

Environments are the directories under `clients/`: `local` (a Keycloak on your
machine, clients on `localhost:4000–4002`) and `prod` (`auth.medaris.app`,
clients on `tedris|nizam|nazir.medaris.app`). Both provision the realm named by
`KC_REALM`, `medaris` by default.

The shared development realm `amel-tech-dev` is **not** managed from here; it
serves other clients too, and turning registration on there would open
self-signup for all of them. It is still set up by
`tools/keycloak/setup-realm.sh`.

Requirements: `bash`, `curl`, `jq`.

## The four scripts

| Script | Talks to the server | Writes | Exit code |
| -- | -- | -- | -- |
| `validate [<env>]` | no | no | 1 on any problem: invalid JSON, a missing required field, a wildcard or empty redirect URI, a web client without PKCE S256 or the audience mapper, or a **literal secret** in any file |
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
KEYCLOAK_ALLOWED_CLIENTS=tedris,nizam,nazir
```

and each web app `KEYCLOAK_ISSUER` as above and `KEYCLOAK_CLIENT_ID` = its
client (`tedris`, `nizam`, `nazir`).

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
