# MDRS-142 (first half) — `GET /me` says what is held where

Stacked on MDRS-148 (`taha/mdrs-148-publish-decks-only-through-the-basnazim`, tip `b43f048c`), which carries
MDRS-135 (#177) and MDRS-205 (#197). MDRS-142 has two halves: `GET /me` lists the caller's assignments and, per
scope, the effective permissions; and the account lookup (`GET /users?email=`) asks `user.lookup` in the scope given
with the request. **Only the first half is built.** `GET /me` still returned the MDRS-104 summary, with an
always-empty `nazirOf` (the issue: "Its nazır list is always empty"). Every number below sits next to the command
that printed it; commands run from the repository root unless a `cd` says otherwise.

## Decided by the owner

**d-1004-09 (4 Oct), his words "şimdilik dursun", option "Hayır: rolü olan her kapsamda arayabilsin (bugünkü)":
the account lookup does not change.** `GET /users` and `GET /users/lookup` keep today's role-based gate
(`holdsAnyRole`, `managesAny`). So MDRS-206 and the lookup half of MDRS-142 are deferred, and none of these were
touched: no `?scope=`, no `user.lookup` tag for the platform or the medrese, no sixth platform section "people", no
change to the seven picker call sites, no lookup audit change, no new throttle. `holdsAnyRole` and `managesAny`
stay.

What the deferred half still needs, if the owner changes his answer (a first attempt exists, unpushed, on the local
branch `taha/mdrs-206-gate-the-account-lookup-on-user-lookup`, built on the same base, with its own note):

- the `scope` query on both routes with a grammar (`platform | kosk:<id> | madrasah:<id> | medrese:<id> | course:<id>`),
  a resolver for `@Authz(user.lookup, …)` and a 400/404 for a malformed or missing scope;
- `user.lookup` tagged for the platform (a Medaris nazımı's platform grant reaches nothing without it) and for the
  medrese, with `libs/common/test/authz/catalogue-golden.spec.ts` and the pinned grant-plan counts moved;
- the code made grantable on the Medaris nazımı screens (`PLATFORM_CATALOG`, the i18n section), and the seven
  nizam/nazir call sites sending the scope, with a "no permission to search" message instead of "şu an
  yapılamıyor";
- the audit row for `GET /users` (only `GET /users/lookup` writes one today) and a throttle test for it.

## Decided by default, owner may overrule

1. **The başnazım gets no entries.** `roles.systemAdmin: true` and `permissions: []` when he holds no role rows: the
   realm role is not a list of codes. A başnazım who also holds role rows (possible: the realm role is separate)
   is listed like anyone, plus `roles.systemAdmin: true`. Pinned both ways in `user.e2e.spec.ts`. (Dossier D8.)
2. **Passive scopes and policies are not applied.** The engine is asked with `passiveScope: null` and `policies: []`,
   so a nazır of a passive scope still sees its content codes listed, which the real routes refuse. The policies
   only close implicit codes, which are not listed. `GET /me` says what the caller holds, not what a route will let
   through at this moment; the DTO text says so. The alternative (a public passive-scope probe on
   `TedrisatAuthzContext`, whose `managerStats` is private) was not built.
3. **A köşk's or medrese's entry includes the course work held across its courses** (the köşk nazımı's `course.edit`
   appears under the köşk), because the engine's chain does. A medrese course hosted in a köşk would additionally
   drop `notInMadrasahCourse` codes at the köşk level; only a per-resource decision shows that.
4. **Unlisted codes are kept** (`permission.grant`, `madrasah.hide`, `course.hide`: a button needs them) and the
   implicit codes every signed-in caller holds (viewing, enrolling) are left out.
5. **One entry per scope** where a role is held, kept even when `permissions` is empty ("holds nothing" is
   information), plus one for a scope below a role where a grant is held. A grant under no role gets no entry (it
   counts for nothing, the engine's rule); a role whose scope no longer exists (`scope_id` is no foreign key) gets
   none. Entries are ordered platform, köşk, medrese, course, then by name.
6. **`roles.nazirOf` is filled** with the medreses where the caller holds `MEDRESE_BASMUDERRIS` or `MEDRESE_NAZIR`,
   once each, with the medrese's name. The issue says the list is always empty; it was empty because tedrisat stored
   no nazırs, and `role_assignments` has since MDRS-134.

## What changed

`GET /me` gains two fields, nothing is removed, so every `Pick<MeResponse, "roles">` consumer compiles unchanged
(`nx run-many -t typecheck -p nizam-web nazir-web tedris-web` passes after regenerating the client).

- `assignments`: the caller's live role assignments, the same `AssignmentResponse` as `GET /me/assignments` (role,
  scope type and id, name, imam flag, expiry, who granted). `AssignmentService.myAssignments` and `myOverview` share
  one `describeAssignments`, so the two routes cannot drift.
- `permissions`: `MeScopePermissions[]`, `{ scopeType, scopeId, scopeName, roles, permissions }`. Each entry is the
  engine's own `effectivePermissions` over that scope's chain (`[platform]`, `[köşk|medrese, platform]`,
  `[course, medrese?, köşk, platform]`) with everything the caller holds. Pure
  (`apps/tedrisat/src/assignment/me-permissions.ts`), fed by `TedrisatAuthzContext.holdings` (the loader's two
  reads, expiry and revocation decided against the database clock). A grant counts only while a role covers it, and
  a grant "for every course" counts in the courses where a role is held.
- `roles.nazirOf`: filled (decision 6).

`GET /me/assignments`, `/me/effective-permissions`, `/me/permissions` and `/me/roles` are unchanged (the account
screens and the dashboard depend on their shapes). `buildEffectivePermissions` is still a second implementation
beside the engine, with the gaps the dossier lists (no nesting, "every course" grants dropped, no passive-scope
closure, unlisted codes left out); folding it onto `effectivePermissions` is not done.

It reads what the caller holds once and never calls `authz.effective()` per scope (five statements each, on the
page every sign-in loads). Measured with `Pool.prototype.query` counted around `AssignmentService.myOverview`, in
`user.e2e.spec.ts` ("reads what a caller holds in a fixed number of statements"): **6 statements** for a ders
nazırı of one course, **8** for the same person after seven courses, a köşk and a medrese (nine entries). The köşk
and the medrese add one statement each (their names); the six more courses add none. The planner's "about eight"
holds.

No route is added or removed: the route inventory snapshot is unchanged
(`vitest run test/e2e/authz-route-inventory.e2e.spec.ts` passes without `-u`). No migration.

## Behaviour changes callers will see

- `GET /me` (and `PATCH /me`, which answers the same body) carries `assignments` and `permissions`, and a filled
  `roles.nazirOf`. Additive: no existing field changed.
- nizam's `koskListEmptyState` reads `roles.nazirOf`: a başmüderris or medrese nazırı who manages no köşk now gets the
  `nazir` empty state instead of `none`. The function has no component caller today (`grep` finds only its
  definition and `kosk-abilities.spec.ts`), so no screen changes yet; its comment, which said the list is empty, was
  corrected. `docs/migration/mdrs-104-users-table.md`, `-106-` and `-108-` still say `nazirOf` is empty; they are
  history and were left alone.
- Nothing else: no route answers a different status, no screen loses a button, no catalogue code moves.

## Tests, and that each fails without the change

Added or changed: `test/unit/assignment/me-permissions.spec.ts` (10 tests, pure), the `GET /me` block of
`test/e2e/user.e2e.spec.ts` (13 tests; the file has 34 in all), and one case in
`test/e2e/authz-engine.e2e.spec.ts` ("GET /me says the same per scope", the medrese nazırı's entry is exactly what
its routes allow, and goes with the role; the file has 54 in all).

The e2e matrix per role: başmüderris, medrese nazırı (alone, and both roles on one medrese), ders nazırı with one group
grant, köşk nazımı, müderris (imam flag), Medaris nazımı (empty platform entry, then one grant), başnazım with and
without role rows, a talebe, a role on a deleted köşk, a role that ended, a grant that expired and a grant that was
revoked. The Medaris nazımı's grant is `platform.kosk_create`: `user.lookup` is not tagged for the platform on this
base (the lookup half is deferred), so it would reach nothing.

Each change below was put back on its own (source changed, listed specs run through the slot wrapper, source
restored with `git checkout -- <file>`), counts read off the vitest summaries:

| Change put back | Criterion | Result |
| --- | --- | --- |
| `getMe` as on the base (no `assignments`, `permissions`, `nazirOf: []`) | every `/me` criterion | 13 failed of 88 (12 in `user.e2e`, 1 in `authz-engine`) |
| `grantHeld()` answers `true` (no expiry, no revoke) | a grant's expiry and revoke are reflected | 1 failed of 34 ("stops listing a grant when it expires or is revoked") |
| `isHeld()` answers `true` | a role's end is reflected | 2 failed of 14 selected (`user.e2e` "drops a role that has ended", `authz-engine` "GET /me says the same per scope") |
| `myOverview` reads the loader once per held scope | the statement count is fixed | 1 failed ("expected 8 to be 6") |
| `effectivePermissions` fed no grants | grants count, per scope | 4 failed of 10 (unit) |
| implicit-code filter removed | listed codes only | 5 failed of 10 (unit) |
| live-expiry filter removed from `permissionsPerScope` | expired role/grant not listed (pure) | 1 failed of 10 (unit) |
| a scope with no name (deleted köşk) given an entry anyway | no entry for a dangling role | 1 failed of 10 (unit) |

## Criteria

| # | Criterion (Linear, 4 Oct) | Status | Test |
| --- | --- | --- | --- |
| 1 | `GET /me` returns the role assignments: role, scope type, scope id, imam flag, expiry | met | `user.e2e.spec.ts` (başmüderris case, müderris case) |
| 2 | and the effective permissions per scope, computed by MDRS-135 | met | `user.e2e.spec.ts` `/me` block, `me-permissions.spec.ts`, `authz-engine.e2e.spec.ts` |
| 3 | e2e: a başmüderris lists the medrese assignment and medrese-scoped permissions; a ders nazırı with one group grant, exactly the group's | met | `user.e2e.spec.ts` (first and fourth cases) |
| 4 | `GET /users?email=` requires `user.lookup` in the scope given | unmet (deferred by the owner, d-1004-09) | none |
| 5 | by default köşk nazımı, başmüderris, müderris, başnazım; others a grant; no scope or no permission is 403 | unmet (deferred by the owner) | none |
| 6 | e2e: a köşk nazımı looks up with `scope=kosk:<own>`, 403 with another's, 403 with none | unmet (deferred by the owner) | none |
| 7 | every lookup writes an `audit_log` row | unmet (deferred by the owner); `GET /users/lookup` already writes one, `GET /users` does not | none |
| 8 | rate limit: apply the existing throttler to `GET /users` | unmet (deferred by the owner) | none |
| 9 | (dossier) `nazirOf` stops being always empty | met | `user.e2e.spec.ts` (başmüderris, medrese nazırı, both roles once) |
| 10 | (dossier) per-scope reads are a fixed number of statements | met | `user.e2e.spec.ts` ("fixed number of statements") |

## Not verified, and what to look at

- Playwright specs were not run (they need a running stack); nothing in nizam/nazir/tedris changed but one comment.
- The statement count was measured for one shape (a ders nazırı growing to nine entries), not for a Medaris nazımı
  with platform grants or a caller with several medreses (the code path is the same).
- The web apps' vitest suites were not run in full; `kosk-abilities.spec.ts` (11 tests) was, because of `nazirOf`.
  Typecheck of nizam-web, nazir-web and tedris-web passes against the regenerated client.
- `buildEffectivePermissions` is still a second implementation (see above).
- Nobody reads the new fields yet: MDRS-123 slice A2 (nazir abilities) and MDRS-108 are the consumers.
