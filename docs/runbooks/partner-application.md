# Runbook — connect a partner application

A partner application is a separate site whose registrations become Medaris
course enrollments. A person signs in there with "Medaris ile giriş yap"; when
the partner approves their registration, its server calls tedrisat's
`/integrations/*` routes, and the person becomes a talebe of the course the
partner's code maps to. Cancelling there takes away the seat the integration
added, and only that one.

Each partner gets one confidential client in the realm, made by hand per
environment, and is registered in nizam, where the başnazım chooses the köşks
it works with. No real partner's client is in this repository; the local
example is `ornek-uygulama` (`config/keycloak/clients/local/ornek-uygulama.json`,
and `tools/keycloak/setup-realm.sh` for the shared development realm), with
every setting below. The one `setup-realm.sh` makes lacks step 7: that realm
has no `full-name` scope, so its example keeps Keycloak's default scopes.

| | |
|---|---|
| tedrisat routes | `PUT` and `DELETE /integrations/enrollments/{registrationRef}/{courseCode}`, `GET /integrations/courses` (`apps/tedrisat/src/integration/`) |
| Who passes | a token tedrisat verifies (signature, issuer, expiry, access token) whose `azp` is a partner registered in nizam and enabled, carrying the realm role `partner-enrollment` and tedrisat's audience. Nothing else, and a registered partner's token, enabled or not, on no other route |
| Registry | nizam → Ayarlar → **Ortak uygulamalar** (`platform.partner_manage`: the başnazım, and a Medaris nazımı only when given it). Table `integration_partners`, and `integration_partner_kosks` for the köşks. No partner registered: every `/integrations/*` route answers 404 |
| tedrisat env | the existing `KEYCLOAK_ADMIN_CLIENT_ID` / `_SECRET`. `INTEGRATION_PARTNERS` is deprecated: it is read only at boot, to register a listed partner the table does not have yet (see §3) |
| Codes | course staff map the partner's codes to courses in nazar: Ders ayarları → Ortak uygulama kodları (`course.partner_codes`: the köşk nazımı and the başnazım). Only the partners bound to the course's köşk are listed, and only there do their codes enrol anyone |

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

## 3. Registering the partner in nizam

nizam → Ayarlar → **Ortak uygulamalar**, as the başnazım (or a Medaris nazımı
given "Ortak uygulamaları yönet", `platform.partner_manage`; no role holds it by
default). No redeploy, no environment variable.

1. **Ortak uygulama ekle**: the client id (exactly the realm client's, what
   its tokens carry in `azp`) and the display name nazar and the audit log
   show (at most 100 characters). The partner is added **enabled** and bound to
   **no köşk**: its token is accepted on `/integrations/*` at once, but none of
   its codes counts anywhere yet.
2. **Köşkleri seç** on its row: tick every köşk it works with and save. Only in
   those köşks does Ders ayarları list it, may staff map its codes, and do its
   codes enrol anyone; `GET /integrations/courses` lists only those codes.
3. Course staff map its codes in nazar (Ders ayarları → Ortak uygulama
   kodları).

Every change is written to the audit log (`integration_partner.create`,
`.rename`, `.disable`, `.enable`, and `.kosk_bind` / `.kosk_unbind` under the
köşk). It is in force at once on the instance that took it; tedrisat keeps the
list of partners in memory for a minute, so another instance follows within
that minute. Unbinding a köşk **removes the partner's codes from that köşk's
courses**, each written to the audit log as `course.partner_code_remove`, and
binding the köşk again brings none back: course staff map them anew. So a code
is never stuck on a course nobody can see it on, and the partner may map the
same code in another köşk. What its registrations did there stays, and the
partner's DELETE for those registrations still takes away the seats they made.
Switching a partner off keeps its codes. Course staff holding
`course.partner_codes` can take any registered partner's code off a course,
also one that is switched off or not bound to the köşk.

- The partner's client id is **never** one of the front-ends in
  `KEYCLOAK_ALLOWED_CLIENTS`: registering one is refused with 409
  `PARTNER_FRONT_END_CLIENT`. A registered partner's tokens are refused on
  every other route, enabled or not.
- tedrisat checks the person's account (exists, enabled, e-mail verified) with
  the service account it already has (`KEYCLOAK_ADMIN_CLIENT_ID`,
  `view-users`). Without it the partner's PUT answers 503.
- The partner's budget is 600 calls a minute per route
  (`THROTTLE_PARTNER_LIMIT`, `THROTTLE_PARTNER_TTL`); past it, 429 with
  `Retry-After`.

### Coming from `INTEGRATION_PARTNERS`

Before the registry moved into the database, `INTEGRATION_PARTNERS`
(`<client id>=<Display name>`, comma-separated) on tedrisat was the whole
list. tedrisat still reads it, at boot and for nothing else: each listed
partner that is not registered yet is registered, enabled, and bound to every
köşk that already holds a course one of its codes is mapped to, so a partner
that worked before the upgrade keeps working after it. A partner registered
already is left as it is, so a restart never undoes a rename, a disabling or an
unbinding made in nizam. While the value is set, the log says once per boot
that it is deprecated. After the first boot of this release, check the partner
in nizam, then remove the value from Coolify; nothing changes when it goes.
The boot's rows are in the audit log with no actor and `seededFrom:
INTEGRATION_PARTNERS`.

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
have mapped in the partner's köşks (`[]` before any, or before a köşk is
chosen).

## 6. Ending a partnership

Switch it off in nizam (Ortak uygulamalar → its row → *Açık* off), then
disable the client in the realm. Switched off, its token is refused on
`/integrations/*` with 403 `PARTNER_DISABLED`, and nazar offers its codes in no
course; it stays registered, so its token stays refused on every other route
too. Switching it on again brings it back with its köşks and codes. A partner
is never deleted. Seats it added stay; the course team removes them on the
roster if they should go.
