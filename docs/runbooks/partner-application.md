# Runbook — connect a partner application

A partner application is a separate site whose registrations become Medaris
course enrollments. A person signs in there with "Medaris ile giriş yap"; when
the partner approves their registration, its server calls tedrisat's
`/integrations/*` routes, and the person becomes a talebe of the course the
partner's code maps to. Cancelling there takes away the seat the integration
added, and only that one.

Each partner gets one confidential client in the realm, made by hand per
environment. No real partner's client is in this repository; the local example
is `ornek-uygulama` (`config/keycloak/clients/local/ornek-uygulama.json`, and
`tools/keycloak/setup-realm.sh` for the shared development realm), with every
setting below. The one `setup-realm.sh` makes lacks step 7: that realm has no
`full-name` scope, so its example keeps Keycloak's default scopes.

| | |
|---|---|
| tedrisat routes | `PUT` and `DELETE /integrations/enrollments/{registrationRef}/{courseCode}`, `GET /integrations/courses` (`apps/tedrisat/src/integration/`) |
| Who passes | a token tedrisat verifies (signature, issuer, expiry, access token) whose `azp` is in `INTEGRATION_PARTNERS`, carrying the realm role `partner-enrollment` and tedrisat's audience. Nothing else, and that token on no other route |
| tedrisat env | `INTEGRATION_PARTNERS` (empty: every `/integrations/*` route answers 404), the existing `KEYCLOAK_ADMIN_CLIENT_ID` / `_SECRET` |
| Codes | course staff map the partner's codes to courses in nazar: Ders ayarları → Ortak uygulama kodları (`course.partner_codes`: the köşk nazımı and the başnazım) |

---

## 1. The realm role, once per realm

`partner-enrollment`, a realm role. In a realm provisioned from
`config/keycloak/` it is in `realms/_base.json`, and `provision <env>` creates
it. By hand: *Realm roles* → *Create role* → name `partner-enrollment`,
description "Partner application whose registrations become course
enrollments". Give it to no person and to no group, and never make it a
default role: only a partner client's service account holds it.

## 2. The partner's client

*Clients* → *Create client*.

1. **General settings.** Client type *OpenID Connect*. Client ID: the
   partner's, e.g. `<partner>-medaris`; it is what tedrisat reads in `azp`.
   Name: the partner's display name; the consent screen shows it.
2. **Capability config.**
   - *Client authentication*: **on** (confidential).
   - *Authorization*: off.
   - *Standard flow*: **on**. *Direct access grants*, *Implicit flow*,
     *OAuth 2.0 Device Authorization Grant*, *OIDC CIBA Grant*: **off**.
   - *Service accounts roles*: **on**: the partner calls tedrisat with the
     client credentials grant.
   - *PKCE Method*: **S256**.
3. **Login settings.**
   - *Valid redirect URIs*: the partner's exact callback URL(s), no wildcard.
   - *Valid post logout redirect URIs*: the partner's origin.
   - *Web origins*: empty: the sign-in runs on the partner's server.
   - *Consent required*: **on**. *Display client on screen*: on.
4. **Logout settings.** *Front channel logout*: off. No back-channel logout
   URL: the partner keeps its own session.
5. **Client scopes** → `<client id>-dedicated`:
   - *Add mapper* → *By configuration* → **Audience**: name
     `audience-tedrisat-api`, *Included Client Audience* the value of
     tedrisat's `KEYCLOAK_AUDIENCE` in that environment (`tedrisat-api`),
     *Add to access token* on, *Add to ID token* off. If an environment still
     runs tedrisat with `KEYCLOAK_AUDIENCE=account`, add a second Audience
     mapper for `account`: with full scope off (below) the token does not get
     it on its own.
   - *Add mapper* → *By configuration* → **User Realm Role**: name
     `realm-roles`, *Token Claim Name* `realm_access.roles`, *Claim JSON
     Type* String, *Multivalued* on, *Add to access token* on, *Add to ID
     token* off, *Add to userinfo* off. Needed because, with consent on,
     Keycloak leaves the built-in `roles` scope out of the service account's
     token (measured on 26.3.2): without this mapper the token carries no
     `partner-enrollment` and tedrisat answers 403 `PARTNER_ROLE_MISSING`.
   - *Scope* tab: *Full scope allowed* **off**, then *Assign role* →
     `partner-enrollment`. A token through this client then names no realm
     role but that one: a person who signs in at the partner shows none of
     theirs.
6. **Service accounts roles** tab → *Assign role* → realm role
   `partner-enrollment`.
7. **Client scopes** tab (the client's own list, not
   `<client id>-dedicated`):
   - *Add client scope* → `full-name`, `email`, `gender` → *Add* →
     **Default**. A new client already holds `full-name` and `gender` as
     optional; remove them there first, since Keycloak keeps a scope in one
     list only.
   - *Remove* `profile`, `roles` and `microprofile-jwt`, from whichever list
     holds them.

   `full-name` (`config/keycloak/client-scopes/full-name.json`) and `gender`
   exist in a realm `provision <env>` has run on; elsewhere create them from
   those files first. The local example sets the same through
   `defaultClientScopes` and `removedClientScopes` in its file.

### What the partner receives

Of the person: the first name, the last name and the full name
(`given_name`, `family_name`, `name`, from `full-name`), the e-mail address and
whether it is verified (`email`), and the gender (`gender`). Nothing else. No
user name and no locale goes to a partner: `profile` carries both
(`preferred_username`, `locale`) besides the names, and `microprofile-jwt`,
which the consent screen does not even show, carries the user name as `upn`.
`roles` is removed because the `realm-roles` mapper above stands in for it.

The partner requests `scope=openid email full-name gender`. These are the
client's default scopes, so `openid` alone brings the same; a scope the client
does not have, such as `profile`, makes Keycloak refuse the sign-in with
`invalid_scope`.

### What the consent screen asks

The default scopes it shows, in the theme's words
(`apps/keycloak-theme/src/login/i18n.ts`): `full-name` ("Adın ve soyadın"),
`email` ("E-posta adresin") and `gender` ("Cinsiyetin"). `web-origins`, `acr`,
`basic` and `service_account` share nothing of the person and are not shown.
(From the scopes' settings and the theme's tests; the screen of a real
sign-in was not looked at for this runbook.)

## 3. tedrisat

Set, in Coolify, on tedrisat, **without** the `TEDRISAT__` prefix (the prefix
exists only in the repository's root `.env`):

```
INTEGRATION_PARTNERS=<client id>=<Display name>
```

Several partners are comma-separated pairs; a display name holds no comma. The
display name is what nazar and the audit log show. Then redeploy tedrisat.

- The partner's client id is **never** in `KEYCLOAK_ALLOWED_CLIENTS`; tedrisat
  refuses to boot if it is. Its tokens are refused on every other route.
- tedrisat checks the person's account (exists, enabled, e-mail verified) with
  the service account it already has (`KEYCLOAK_ADMIN_CLIENT_ID`,
  `view-users`). Without it the partner's PUT answers 503.
- The partner's budget is 600 calls a minute per route
  (`THROTTLE_PARTNER_LIMIT`, `THROTTLE_PARTNER_TTL`); past it, 429 with
  `Retry-After`.

## 4. Handing the partner its secret

*Clients* → the client → *Credentials* → *Client secret*: copy it and hand it
over through a channel that keeps it (a shared password-manager entry, or an
encrypted message), never in chat, an issue or e-mail in clear, and never in
this repository. The partner keeps it on its server only. Also give it the
issuer (`KEYCLOAK_ISSUER`), the client id, tedrisat's base URL and the
interface it implements.

To rotate: *Regenerate* on the same tab, hand over the new one; the old one
stops working at once.

## 5. Check

```bash
curl -s -X POST "$ISSUER/protocol/openid-connect/token" \
  -d grant_type=client_credentials -d client_id="$CLIENT_ID" \
  --data-urlencode client_secret@- <<<"$SECRET" | jq -r .access_token |
  cut -d. -f2 | base64 -d 2>/dev/null | jq '{azp, aud, realm_access}'
```

`azp` is the client id, `aud` holds tedrisat's audience, and
`realm_access.roles` is `["partner-enrollment"]`. With that token,
`GET <tedrisat>/integrations/courses` answers 200 and the codes course staff
have mapped (`[]` before any).

## 6. Ending a partnership

Disable the client in the realm first, then take the pair out of
`INTEGRATION_PARTNERS` and redeploy tedrisat: its token is then refused on
`/integrations/*`, and nazar no longer offers its codes. The order matters: a
client that is no longer in `INTEGRATION_PARTNERS` is no longer refused by
name on tedrisat's other routes, so where `KEYCLOAK_ALLOWED_CLIENTS` is empty
only the disabled client keeps its tokens out. Seats it added stay; the
course team removes them on the roster if they should go.
