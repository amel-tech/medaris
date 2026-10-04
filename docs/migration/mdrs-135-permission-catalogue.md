# MDRS-135 — Permission catalogue, scoped permissions and the engine that decides with them

Replaces the static role × scope matrix (`libs/common/src/authz/auth-matrix.ts`) with a
permission catalogue, role defaults computed from it, scope nesting, grants, groups, policies and
passive scopes, and makes `AuthzService.can` decide from all of them. Base: `main` at `cd36d706`
(the nazır chain and the screen stack are in). Every number below sits next to the command that
printed it; the commands run from the repository root unless a `cd` says otherwise.

## What was done

### The catalogue (`libs/common/src/authz/`)

| File | What it holds |
| --- | --- |
| `permissions.ts` | the codes, `PERMISSION_META` (scope types, grantable, content, notInMadrasahCourse, implicit, derivedFrom, unlisted), `ROLE_DEFAULT_PERMISSIONS`, `roleCodesAt` |
| `assignments.ts` | `SCOPE_TYPES`, `ASSIGNED_ROLES`, `ROLE_SCOPE_TYPES`, `MANAGER_ROLE_OF` |
| `relations.ts` | what a caller holds with no role: PUBLIC, ANONYMOUS, ENROLLED, PENDING, DECK_OWNER (the rows of the old matrix that were not roles) |
| `policies.ts` | `POLICY_CLOSES` (which policy closes which ability) and `authorityAbove` |
| `effective-permissions.ts` | the one pure computation, `effectivePermissions`, and `roleCoversScope` |
| `authz.service.ts` | `can`, `canAnonymous`, `effective`; the başnazım bypass and its audit rows |
| `authz-context.interface.ts` | what a decision needs about a resource and a caller (`IAuthzContext`), the audit sink |

```
$ node -e 'const c=require("./libs/common/dist"); …'      # after `tsc -b libs/common`
codes 75 listed 56 grantable 56 implicit 14 derived 3 unlisted 2
tagged platform 17
tagged kosk 10
tagged madrasah 12
tagged course 22
default MEDARIS_NAZIM 0
default KOSK_NAZIM 30
default MEDRESE_BASMUDERRIS 33
default MEDRESE_NAZIR 0
default MUDERRIS 22
default DERS_NAZIR 0
unlisted: course.hide, permission.grant
notInMadrasahCourse: course.open_standalone
```

```
$ git show cd36d706:apps/tedrisat/src/assignment/permission-catalog.ts | grep -cE '^  [A-Z_]+: "[a-z_]+\.[a-z_]+",'
54
```

So the catalogue is the 54 codes MDRS-169 and MDRS-171 gave the screens, plus the owner's 1 October
entries and the codes the routes needed: 75 in all.

- **Listed** (56): what the screens draw and a role or a grant carries; all 56 are grantable.
- **Implicit** (14) are held by a relationship (`course.view`, `course.view_details`, `course.enroll`,
  `course.staff_read`, `kosk.view`, `madrasah.view`, five `deck.*`, three real deletes). No screen
  lists them, no grant carries them, and a role default never adds one.
- **Derived** (3) are an ability inside `course.settings` that a policy can close on its own:
  `setting.approval_off`, `setting.recordings_public`, `setting.course_open`.
- **Unlisted** (2), role defaults no screen draws and no grant carries: `permission.grant` (the
  permission to give permissions: held by the roles that may give them, never handed on) and
  `course.hide` (the köşk nazımı's hiding of a course: the canvases have no sentence for it).

The three real deletes (`course.delete`, `kosk.delete`, `madrasah.delete`) are held by no role, no
grant and no relationship: only the başnazım's realm bypass reaches them (MDRS-124).

### Role defaults (§3) and nesting (§2)

Defaults are computed from the scope tags, so a new code lands in the right default by being tagged:

- `KOSK_NAZIM`: every köşk- and course-scoped code, in the köşk and the courses held there (30).
- `MEDRESE_BASMUDERRIS`: every medrese- and course-scoped code, in the medrese and its courses (33).
  Main's table gave it `[]`; the spec says "every medrese + course permission".
- `MUDERRIS`: every course-scoped code, in its course (22).
- `MEDARIS_NAZIM`, `MEDRESE_NAZIR`, `DERS_NAZIR`: nothing; they hold only grants.

A course held for a medrese sits in both its köşk and its medrese: the loader's chain for it is
course → medrese → köşk → platform. The owner's 1 October decision is one tag:
`course.open_standalone` ("Medrese dışı ders aç; müderrisleri ve imamı seç") carries
`notInMadrasahCourse`, so a köşk nazımı holds it in the köşk's own courses and not in a course held
for a medrese, where the medrese's `madrasah.course_open` and `madrasah.muderris_manage` are the
ones. Hiding, banning and reading stay the köşk nazımı's in both.

### Grants, two expiries, no re-delegation (§4)

- A grant counts only while a role held at its scope or above covers it: *a permission never
  outlasts its role*. `roleCoversScope` is the one rule; the engine and the account screen both use it.
- Role expiry and grant expiry are separate columns; both are decided in the loader's statements
  against the database clock (`now()`), so there is no cache that could outlive an end date.
- A code that is not grantable is ignored even if a row carries it (`permission.grant`,
  `course.hide`), so it cannot be smuggled in by a row written outside the API.
- `permission_grants.authority_scope_type` (migration `0047_mdrs_135_grant_authority`) records the
  level the giver acted under: the başnazım and a Medaris nazımı as `platform`, a köşk nazımı as
  `kosk`, a başmüderris as `madrasah`. A row that predates it reads null, which the engine takes to
  mean "made at its own scope".

```
$ cat apps/tedrisat/src/database/migrations/0047_mdrs_135_grant_authority.sql
ALTER TABLE "permission_grants" ADD COLUMN "authority_scope_type" "scope_type";
$ python3 -c "import json;j=json.load(open('apps/tedrisat/src/database/migrations/meta/_journal.json'));print(len(j['entries']),j['entries'][-1]['tag'])"
46 0047_mdrs_135_grant_authority
```

**Numbering:** main's journal has 45 entries and ends at `0046_madrasah_bans_offsite_requests`; it has
no 0035 and no 0040. `drizzle-kit generate` therefore names the next file `0045_…` and overwrites main's
`0045_snapshot.json`. The generated SQL and snapshot were renamed to `0047` by hand and main's
`0045_snapshot.json` was restored (`git diff cd36d706 HEAD -- apps/tedrisat/src/database/migrations/meta/0045_snapshot.json`
prints nothing). The rollback is `src/database/rollbacks/0047_mdrs_135_grant_authority.down.sql`, and
`test/e2e/grant-authority-migration.e2e.spec.ts` applies the journal up to 0046, adds a grant, applies
0047, rolls it back and applies it again.

### Who may give, and groups (§4, §5)

- A başmüderris gives from the `permission.grant` their role holds (a role default, never a grant), as
  the medrese's authority. The başnazım gives as the platform. A Medaris nazımı holding
  `platform.madrasah_nazir_grant` appoints a medrese nazırı and gives permissions as the platform, but
  **only from what they hold themselves** in that medrese: their own default is empty, so what the
  başnazım gave them is all they have, and a Medaris nazımı with nothing appoints and gives nothing
  (owner, MDRS-209, see "Decided by the owner"). All three go through
  `MadrasahPermissionService.authorityOf`, which asks the engine. A medrese nazırı, a ders nazırı and a
  grantee of any kind cannot give, and nobody may name themselves (`SelfGrantGuard`).
- A köşk nazımı's ceiling for ders nazırları is `course.manage_all` opening `COURSE_CATALOG`; the rule
  (`kosk-grants-rules.ts`) is unchanged and its grants now record `authority = kosk`.
- Groups are read at decision time with their items, so a change to a group in use reaches every
  holder at once; the "(a) keep the scope and the permissions per person / (b) change for everyone"
  question on edit and delete is the one `PermissionAdminRepository` already asked (MDRS-171) and its
  grant copies now keep `authority_scope_type`.

### Policies (§6)

`effectivePermissions` computes
`(relationship ∪ role defaults ∪ live grants) ∩ policies ∩ passive scope`. The three policies close
three abilities: `ALWAYS_REQUIRE_APPROVAL` closes `setting.approval_off`, `RECORDINGS_NEVER_PUBLIC`
closes `setting.recordings_public`, `CLOSED_COURSE_REQUIRED` closes `setting.course_open`. They are
read at three levels (`platform_policies`, `kosks.always_require_approval` /
`recordings_never_public`, `madrasah_settings.policy_*`). A grant made by an authority *above* the
policy's level survives that policy and no other (`authorityAbove`: platform over köşk, medrese and
course; köşk and medrese over course; a köşk and a medrese are not above one another).

Enforcement points: `CourseService.enroll` and `publicRecordingsAllowed` still read the settings
themselves and still force approval, or hide the public recording, whatever a course's own flag says.
`PATCH` and `PUT /courses/:id` now ask the engine (see "The review of 3 October", H3): a switch-off
of "requires approval" needs `setting.approval_off`, opening a closed course needs
`setting.course_open`, and a policy that closes either answers 409 `PLATFORM_POLICY_LOCKED` as before.
`PlatformPolicyService.assertCourseMayChange` is gone; `assertKoskMayChange` stays.

### Passive scopes (§7)

A scope on the resource's chain that once had a manager role (köşk nazımı, başmüderris, müderris) and
has none now is passive. Every `content` code is closed there, even to the enrolled talebe; the page
(`course.view`) stays. A Medaris nazımı holding `platform.inactive_scopes_manage` opens it, and every
open writes a `scope.passive_open` row; so does the başnazım's. A scope that never had a manager is
new, not passive.

**Closing the descendants is confirmed, the warning is not built.** The owner (d-1003-08) confirmed
that putting a scope to passive closes what hangs below it, which the engine already does (a scope "on
the resource's chain" closes the content of every course below it). What he asked on top: **"Bunları
pasife alırken yanında neleri götürdüğünü uyarıyla göstersin, onaylanırsa devam edilsin."** That is, the
screen that puts a scope to passive must first list what goes passive with it and ask for a
confirmation. It is **MDRS-227** and is not in this branch: nothing here changes how a scope is put to
passive, only how a passive one is read.

### Audit (§8)

- Already written before this change: grants, revocations, group changes, policy changes (MDRS-169,
  171, 181). Unchanged.
- `course.content_read`: `CourseService.present` records a content read by anyone who is neither an
  enrolled talebe nor one of the course's müderrisler; its `details` now name the permission
  (`course.view_details`) and whether the realm bypass was used. Test:
  `authz-engine.e2e.spec.ts` › "a köşk nazımı reads a medrese course's content in their köşk, and the
  read is on the record".
- `course.roster_read` (owner, d-1003-09, **"Kayda alınsın"**): a read of a course's roster by anyone who
  is neither an enrolled talebe nor one of the course's müderrisler writes a row, by the same rule as
  the content read (an enrolled talebe who also holds a role in the course's chain stays audited). The
  routes: `GET /courses/:id/enrollments` (the talebe list, with names and e-mail addresses),
  `…/enrollments/removed`, `/stats`, `/badge-counts`, and the köşk-wide
  `GET /kosks/:koskId/enrollments/pending`, which belongs to no one course and so writes a row for
  every read, with the köşk as its entity. `details` has `via` (which route), `systemAdmin` and the
  permission it read through (`course.staff_read`, `course.manage_all` for the köşk's list). The row is
  awaited before the data is read (`CourseService.auditRosterRead`, called after the guard and the
  service's own narrowing), so a write that fails fails the read. On the audit page it is a
  "Kişisel veri okuma" (`PERSONAL_DATA_READ`), as the roster is names and e-mail addresses; the content
  read stays "İçerik okuma". Tests: `roster-read-audit.e2e.spec.ts` (every route for the köşk nazımı,
  the başnazım, a başmüderris, a müderris who also holds a seat, an enrolled köşk nazımı, and the
  callers the route refuses; one row per read; the row's failure fails the read on all five routes).
  **Not covered:** `GET /madrasahs/:id/students` (the medrese's talebe, names and e-mail addresses, for
  its başmüderris) and the medrese's badge counts are not course roster reads and write no row; say if
  they should.
- `scope.passive_open` and `deck.admin_read` are written by `AuthzService` itself through the audit
  sink (`TedrisatAuthzAudit`, straight to `audit_log`).
- The başnazım's bypass on someone else's private deck is read-only: `can` answers false for every
  deck permission but `deck.view` (MDRS-148), and writes a `deck.admin_read` row.

### Query budget (§7)

One decision costs the `RoleResolver`'s lookups (for a course: `findKoskId` and `findEnrollment`, and
the ban check only when the caller has an enrollment) and the loader's statements. The loader asks for the resource's own row, which names its köşk and medrese and
carries their policies, then four side by side: the caller's roles, their grants with their groups'
items, the manager counts of the scopes on the chain, the platform's policies.

```
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/unit/authz/tedrisat-authz-context.spec.ts
 ✓ test/unit/authz/tedrisat-authz-context.spec.ts (9 tests)
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

The first test (`answers a course in five statements`) asserts exactly 5 recorded statements for a
course, however many grants and groups the caller has; the second asserts 3 for a sentinel id.

### The 105 handlers (§7)

```
$ git grep -hE '^\s*@Authz\(' cd36d706 -- apps/tedrisat/src | wc -l
105
$ grep -rnE '^\s*@Authz\(' apps/tedrisat/src --include=*.ts | wc -l
105
$ grep -rnE '\bSCOPES\b|\bMATRIX\b' apps/tedrisat/src apps/tedrisat/test libs/common/src libs/common/test --include=*.ts | grep -v 'BAN_SCOPES\|SCOPE_TYPES' | wc -l
0
```

All 105 are migrated, none is left on a scope, and `SCOPES`, `MATRIX` and `auth-matrix.ts` are gone.

Main then moved (`b451266c`) and brought one more handler on the old API: `GET /kosks/:id/dashboard`
(MDRS-182, #176) came with `@Authz(SCOPES.EDIT, byExistingKosk)`. It asks what the köşk overview asks,
`kosk.manage | platform.kosk_edit` (3d4e20e0), so the count is now 106 and `SCOPES` and `MATRIX` are
still at 0. `GET /nizam/dashboard` has no `AuthzGuard` on purpose (the catalogue has no platform
entity and no code for "open the Medaris home page"; the service asks for the role and cuts the page to
the platform permissions held), and the route inventory lists both. Nothing else in main's nine
commits (notifications, migration boot, the tedris and the sign-out work) asks who may do what.
`@Authz` takes a catalogue code or a list (any one will do). The guard is unchanged: undecorated
handlers still fall through, and `AuthzWiringAssertion` still refuses to boot a guarded handler that is
neither decorated nor `@AuthzExempt`/`@AuthzPublic`.

The mapping, where a route was not a one-to-one rename:

| Route(s) | Was | Is | Why |
| --- | --- | --- | --- |
| `POST /kosks` | `CREATE_KOSK` (no row) | `platform.kosk_create` | the başnazım passes by the bypass; a Medaris nazımı holding it by grant; no relationship or role default |
| `PATCH /kosks/:id`, `kosk-admin` reads, hide/restore | `EDIT` | `kosk.manage` or `platform.kosk_edit` | the köşk nazımı's own, or the Medaris nazımı's |
| `POST|DELETE /kosks/:id/managers/:userId` | `MANAGE_KOSK_MANAGERS` | `kosk.manage` or `platform.kosk_nazim_manage` | |
| `GET|POST|PATCH|DELETE /kosks/:id/grants` | `EDIT` | `course_nazir.assign_kosk` | the permission the screen already names |
| hosting rights | `EDIT` | `kosk.hosting` or `platform.hosting_grant` | |
| `POST /kosks/:koskId/courses` | `MANAGE_COURSES` | `course.open_standalone` | "Medrese dışı ders aç" |
| `PUT /courses/:id/muderris` and the müderris list inside a whole-course save | `ASSIGN_MUDERRIS` | `course.open_standalone` or `madrasah.muderris_manage` | one permission opens a course and chooses its müderrisler; in a medrese course it is the medrese's (owner, 1 October) |
| hide / restore a course | `ARCHIVE` | `course.hide` or `madrasah.course_hide` | who may restore is decided by kademe, see "Hide and restore by kademe" |
| `PATCH|PUT /courses/:id`, lesson routes | `EDIT` | `course.edit`, `session.manage` | the lesson routes are session work |
| enrollment decide / complete / remove | `MANAGE_ENROLLMENTS` | `enrollment.decide`, `enrollment.complete`, `enrollment.remove` | the catalogue already told them apart |
| roster, stats, badge counts | `MANAGE_ENROLLMENTS` | `course.staff_read` | "ders kadrosu talebenin adını ve e-postasını varsayılan görür; bu ayrı bir izin değildir"; each read is audited (`course.roster_read`), see "Audit" |
| `PUT /courses/:id/progress` | `VIEW_DETAILS` | `course.view_details` | unchanged: "the enrolled and the course staff" |
| medrese list for management, create, head müderris | `CREATE_MADRASAH` | `platform.madrasah_create` / `platform.madrasah_edit` / `platform.head_muderris_manage` | the başnazım by the bypass, a Medaris nazımı by grant |
| restore a medrese | `CREATE_MADRASAH` | `madrasah.hide` or `platform.madrasah_edit` | the başmüderris joins the Medaris administration, by kademe: see "Hide and restore by kademe" |
| medrese delete | `DELETE` | `madrasah.delete` | held by nobody; the realm bypass alone (MDRS-124) |
| medrese portal reads | `MANAGE_MADRASAH` | `madrasah.students_view` | |
| medrese settings | `MANAGE_MADRASAH` | `madrasah.settings_edit` or `platform.madrasah_edit` | |
| medrese courses, hosting köşks | `MANAGE_MADRASAH` | `madrasah.course_open` / `madrasah.muderris_manage` / `madrasah.course_hide` / `madrasah.offsite_course_request` | one per route |
| nazır roster and permission routes | `MANAGE_MADRASAH`, `INVITE_NAZIR`, `REMOVE_NAZIR` | `madrasah.nazir_appoint` or `platform.madrasah_nazir_grant` | |
| medrese bans | `MANAGE_MADRASAH` | `madrasah.ban` or `platform.ban_scoped` | |
| flashcard decks and cards | `VIEW`, `CREATE_FLASHCARD`, `MANAGE_FLASHCARDS`, `CREATE_PRIVATE_DECK`, `MANAGE_PRIVATE_DECK` | `deck.view`, `deck.create_card`, `deck.manage_cards`, `deck.create_private`, `deck.manage_private` | relationship codes: author and any signed-in caller, exactly as the rows were |

**Relationships keep today's behaviour.** `TedrisatRoleResolver` now answers only *what the caller is
to the resource* (enrolled, pending, author, any signed-in caller) and no longer resolves roles; the
köşk nazımı, başmüderris and müderris answers come from `role_assignments` through the loader. A
barred or removed talebe still falls back to PUBLIC. Roles add to relationships: a müderris who is
also enrolled in a sibling course keeps both.

### Where the screens read it (§E)

`buildEffectivePermissions` (the account screen) and the engine share `roleCodesAt` (what a role holds
in a scope of its own type), `roleCoversScope` and `GRANTABLE_CODES`. The screen drops a grant no role
covers and a code that cannot be handed on, as the engine does; a course grant under a medrese nazırı's
role is found through the course's köşk and medrese ids. `authz-engine.e2e.spec.ts` › "is told by the
account screen exactly what the routes allow" asserts that the list `GET /me/permissions` prints for a
nazır with a group is exactly the group's two codes, that those two routes open and a third stays
shut, and that revoking the role empties the list and closes the routes together.

### Sentences

Turkish only (owner, 3 October). Checked against `design-sentences.json` (420 lines transcribed from
the four canvases) with a script that finds each sentence of the catalogue's codes in the tr messages
verbatim, or inside a design line:

```
sentences for catalogue codes in tr messages: 58 | found in the design export (verbatim or inside a design line): 56
  not in design: deck.propose_kosk -> Köşk destesi öner
  not in design: course_nazir.assign -> Ders nazırı ata; izin ya da grup ver, kendi izinlerinizi aşmadan
codes with a sentence: 56 of 75
```

- 56 codes have a sentence: exactly the 56 *listed* ones. The 19 without are the 14 implicit, the 3
  derived and the 2 unlisted: no screen draws them.
- `madrasah.offsite_course_request` → "Medrese dışı ders talebi gönder" is the button label named in nazir/07,
  verbatim.
- `deck.propose_kosk` → "Köşk destesi öner" has no line in the canvases: nizam/25 says "Köşk destesi
  açar; müderrislerin önerilerini alır" and no permission list names the müderris's side. The wording
  is mine; the canvases predate the owner's 1 October list.
- `course_nazir.assign` in the nizam and nazır apps says "kendi izinlerinizi aşmadan" where tedris/43
  says "kendi izinlerini aşmadan": the apps' own voices (pre-existing, not touched here).
- The two new listed codes were added to `tr`, `en` and `ar` so the locales' parity checks hold; the
  English and Arabic wording is a translation of the Turkish and nobody has reviewed it (MDRS-202 owns
  the real renderings).

## What is NOT done

(The review of 3 October closed most of the earlier list; what is still open is here and under
"Open questions".)

- **The ban tiers** (`ban-tier.ts`, `BanService`) keep their own rule from the roles held; they are not
  read from `ban.*` / `madrasah.ban` / `platform.ban_*`. `BanController` has `@UseGuards(AuthGuard)`
  only, no `@Authz`. What follows from that, measured by the review: a Medaris nazımı or a ders nazırı
  with no grant bans (`MAY_BAN_ROLES`), a medrese nazırı with no `madrasah.ban` lifts, widens and asks
  for a permanent ban (`MAY_MODERATE_ROLES`, `MADRASAH_WIDE_ROLES`), a Medaris nazımı lists every ban
  with its reason, and a granted `ban.course`, `ban.lift_course`, `ban.manage_kosk`, `madrasah.ban`,
  `madrasah.permanent_ban_request` or `platform.ban_*` changes nothing. Pre-existing on main; left
  untouched on purpose, see "Open questions" for what has to be decided first.
- **`GET /users/lookup`** is open to anyone holding any role (`AssignmentRepository.holdsAnyRole`), not
  to `user.lookup`. A grant-less medrese nazırı, ders nazırı or Medaris nazımı can resolve an e-mail
  to an account. Also left, for the reason under "Open questions".
- **Nazır dismissal** (`MadrasahNazirRepository.heldGivenBy`) still leaves out the rows a nazır made for
  themselves; the self-grant guard stops such a row being written, so there is nothing to list.
- **`ALWAYS_REQUIRE_APPROVAL`, `RECORDINGS_NEVER_PUBLIC`, `CLOSED_COURSE_REQUIRED` as engine
  decisions**: the three abilities are computed, but the code that enforces each policy on
  enrolment and recordings still reads the settings itself (it did, and still does the same thing).
  `policy_closed_course_required` and `policy_no_public_recordings` have no server effect elsewhere
  yet (MDRS-176 and the recording model).
- **The nazır screens still word a medrese's restore as Medaris-only** (`Archive.hide.text`,
  `Archive.hide.confirmBody`, `Archive.errors.parentHidden` say so in tr, en and ar), and the medrese
  page has no "Geri al" button. The API now lets the başmüderris who hid the medrese bring it back (see
  "Hide and restore by kademe"); the copy and the button are a follow-up. `ARCHIVE_RESTORE_LEVEL` is
  worded with the existing "a higher level may have hidden it" message.
- **The passive-scope warning and confirmation** (MDRS-227): see "Passive scopes".
- **Bans** are not started (MDRS-205, with its second and third questions parked as d-1004-02 and
  d-1004-03): see "Open questions".
- **`apps/nazir`'s Playwright e2e** needs a running stack and was not run here.
- **MDRS-46** (a cache of the role lookups) is a separate issue; nothing here caches across requests.

## Verified

```
$ cd libs/common && ./node_modules/.bin/vitest run test
 Test Files  8 passed (8)
      Tests  111 passed (111)
$ cd apps/tedrisat && ./node_modules/.bin/vitest run          # unit + e2e + the three Keycloak-container specs
 Test Files  121 passed (121)
      Tests  1792 passed (1792)
   Duration  2233.10s
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/e2e/grant-authority-migration.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
$ cd apps/nazir && ./node_modules/.bin/vitest run
 Test Files  34 passed (34)
      Tests  645 passed (645)
$ cd apps/nizam && ./node_modules/.bin/vitest run
 Test Files  33 passed (33)
      Tests  560 passed (560)
$ cd apps/tedris && ./node_modules/.bin/vitest run
 Test Files  53 passed (53)
      Tests  534 passed (534)
$ tsc -b libs/common; (cd apps/tedrisat && tsc --noEmit -p tsconfig.json); tsc -b libs/services libs/i18n apps/nizam apps/tedris apps/nazir
libs/common rc=0
tedrisat rc=0
rc=0
$ pnpm run openapi:tedrisat && git diff --stat cd36d706 HEAD -- libs/services
 libs/services/swagger-docs/tedrisat.json | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

(the one OpenAPI line is a description that named `assign_muderris`; the generated client is unchanged.)

After the hide kademe, the roster audit and the merge with main (`b451266c`), at `b3d04b55`:

```
$ cd libs/common && ./node_modules/.bin/vitest run
 Test Files  10 passed (10)
      Tests  140 passed (140)
$ cd apps/tedrisat && ./node_modules/.bin/vitest run          # one run, on the merged tree
 Test Files  1 failed | 133 passed (134)
      Tests  1 failed | 1974 passed (1975)
   Duration  863.23s
$ cd apps/tedrisat && ./node_modules/.bin/vitest run test/e2e/madrasah-directory.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  25 passed (25)
$ cd apps/nizam && ./node_modules/.bin/vitest run      # Tests  615 passed (615)
$ cd apps/nazir && ./node_modules/.bin/vitest run      # Tests  653 passed (653)
$ cd apps/tedris && ./node_modules/.bin/vitest run     # Tests  5 failed | 582 passed (587)
$ tsc: libs/common, libs/services, libs/ui (-b), apps/tedrisat, nizam, nazir, tedris: rc=0
$ node tools/ci/assert-openapi-spec-fresh.mjs
✔ openapi spec freshness: 165 paths, identical to what the exporter writes today
```

The one tedrisat failure was `madrasah-directory.e2e.spec.ts` › "answers 409 … 403 for anyone else", which
asserted the old rule (the hidden medrese's own başmüderris refused); it is rewritten for the kademe rule
in `b3d04b55` and passes, so the tree is 1 file and 1 test over the run above. The five `apps/tedris`
failures are all `test/auth-entry.spec.ts` (`localStorage.clear` on an undefined `localStorage` under
Node 26), a file this branch does not touch and which is identical to main's.
The migration spec was written after the full run began and so is not in its 121 files; it passed
on its own, as above. The suites above ran after the last source change.

### Acceptance criteria (issue text), and the test that proves each

| Criterion | Test |
| --- | --- |
| Unit: effective permissions for each role default, for a grant, for an expired grant, for a policy that removes a permission | `libs/common/test/authz/effective-permissions.spec.ts`: "role defaults" (9 tests), "grants" (9), "policies" (6), "passive scopes and relationships" (4); `permissions.spec.ts` for the defaults themselves |
| Unit: a grant from a higher authority bypasses the policy it outranks, and no other | `effective-permissions.spec.ts` › "a grant from an authority above the policy's level bypasses that policy, and no other" and "knows which authority is above which level" |
| e2e: a medrese nazırı with no grants is refused everything; after a group grant, allowed exactly the group's permissions, in that medrese only | `authz-engine.e2e.spec.ts` › "is refused everything the medrese holds, with no grants" and "after a group grant is allowed exactly the group's permissions, and in that medrese only" |
| e2e: a ders nazırı cannot grant anything, whatever they hold | `authz-engine.e2e.spec.ts` › "a ders nazırı cannot grant anything, whatever they hold" (both tests) |
| e2e: a köşk nazımı reading a course's content in their köşk succeeds, and an `audit_log` row records it | `authz-engine.e2e.spec.ts` › "a köşk nazımı reads a medrese course's content in their köşk, and the read is on the record"; a müderris's own read writes none |
| e2e: after `expires_at` passes, the same request is refused without a restart | `authz-engine.e2e.spec.ts` › "is refused again after expires_at passes, without a restart (AC)" (grant ends 2 s out, the same route 200 then 403 on one running app) |

## Old tests restated in catalogue terms

None was weakened; each stated a rule of the old matrix and now states the same rule in the catalogue:

- `libs/common/test/authz/auth-matrix.spec.ts` is deleted with the matrix; its rules (anonymous codes
  hold the page and nothing else, nobody holds a delete, creating a köşk is on no role, the page is
  public and the content is not) are in `permissions.spec.ts` › "relationship codes".
- `authz.service.spec.ts`, `authz.guard.spec.ts`, `authz-wiring.assertion.spec.ts`: the fixtures speak
  catalogue codes and relationships; same cases.
- `tedrisat-role-resolver.spec.ts`: the staff-role cases (köşk manager, müderris, medrese nazır) became
  "answers PUBLIC and does not look the role up"; the enrolment, ban, 404 and anonymous cases are
  unchanged.
- `nizam-kosk-buttons.spec.ts`, `madrasah-course.spec.ts`, `madrasah-settings.spec.ts`,
  `badge-counts.spec.ts` (two): "the scope only X holds" became "the permission only X holds by
  default", read through `test/helpers/authz-holders.ts`, which asks `effectivePermissions`.
- Behaviour changes these tests had to learn (listed again under "Behaviour changes" below):
  `madrasah-permission.e2e.spec.ts` counts (11 and 21), `assignments.e2e.spec.ts` (a başmüderris now
  has a default group; a grant with no covering role counts for nothing), `badge-counts.e2e.spec.ts`
  (a başmüderris opens their medrese's course badge counts).

## Behaviour changes

Outside the owner's decisions of 1 and 3 October there are four, each forced by the issue text:

1. **A başmüderris now holds defaults** (33 codes: every medrese- and course-scoped one). Main's table
   gave `[]` and the account screen showed them nothing; the issue says "every medrese + course
   permission". Visible effects: the account screen lists them, and a başmüderris may now call the
   course routes of their own medrese's courses (before, PRD §4.1 gave a medrese no authority over a
   course).
2. **A grant with no role covering it counts for nothing**, on the routes and on the account screen
   (owner, 3 October: "A permission cannot outlast its role"). Grants written by the API always sit
   beside the role they hang on, so no real grant is lost.
3. **Two catalogue entries from the owner's 1 October list** are new listed codes:
   `madrasah.offsite_course_request` and `deck.propose_kosk`. The dialogs now offer 11 medrese and
   21 course permissions where nazir/06 prints 10 and 20.
4. **`course.hide`** is a new role default of the köşk nazımı so the old `ARCHIVE` row keeps meaning
   exactly "the köşk's nazımı and the başnazım", plus the owner's "köşk nazımı holds hide in a medrese
   course".
5. **Hide and restore by kademe** (owner, d-1003-07): see "Hide and restore by kademe". What changes for
   people: a başmüderris can bring back a medrese they hid; a köşk nazımı can bring back a köşk they
   hid; the köşk nazımı can no longer bring back what the platform hid (the başnazım hid it, or a
   Medaris nazımı with the platform permission); and the başmüderris can no longer bring back a
   medrese course the köşk's nazımı hid by `POST /courses/:id/restore`, which had no kademe check at
   all before.

## Hide and restore by kademe

The owner, asked whether hiding has a kademe like the bans (d-1003-07): **"Elbette kademe var."** So
whatever two authorities can hide, **the level that hid it, or any level above it, brings it back**: the
ban rule, on the ban ladder `BAN_TIERS`, in one table (`HIDE_RANK` in `archive/hide-level.ts`).

| Level | Who acts at it | Hides |
| --- | --- | --- |
| course (1) | a müderris / ders nazırı, for weeks and sessions | `DELETE /lessons/:id`, the week and session hides of a course save |
| medrese (2) | the başmüderris, or a nazır holding `madrasah.course_hide` | `POST /madrasahs/:id/hide` (and its courses), `POST /madrasahs/:id/courses/:courseId/hide`, a medrese's course through `POST /courses/:id/archive` |
| köşk (3) | the köşk's nazımı | a course, a deck, the köşk itself, the courses a hosting right's withdrawal hides |
| platform (4) | the başnazım, and a Medaris nazımı holding the platform permission (`platform.kosk_edit`, `platform.madrasah_edit`, `platform.hosting_grant`) | the same, over any köşk or medrese |

- **The level is recorded** in `archived_level` (`scope_type`, nullable) on courses, course weeks,
  lessons, decks, köşks and medreses, written by every hide and cleared by every restore. **Migration
  `0048_mdrs_135_archived_level`** (six `ADD COLUMN`s; rollback in `rollbacks/0048_…down.sql`; the
  journal had gaps, so drizzle-kit's `0046` was renamed by hand and `0046_snapshot.json` restored).
  A hide records the level its hider acts at; someone holding more than one rung acts at the highest.
- **A restore below the level that hid is refused** with 403 `ARCHIVE_RESTORE_LEVEL`, "This was hidden at
  the kosk level; only that level or above brings it back (you act at the madrasah level)", with both
  levels in the context. It is checked in the service (course, archive route) or inside the locked
  transaction (köşk, medrese), so a race cannot get round it.
- **A row with no level** (hidden before this) counts as the lowest level that could have hidden it: a
  medrese's course or a medrese is the medrese's, a köşk's own course, a deck and a köşk are the
  köşk's, a week, a session or a recording is the course's. This is a loosening for old rows: one the
  başnazım hid before the level was recorded can be restored by the köşk's nazımı or the başmüderris.
- **Routes covered:** `POST /courses/:id/restore` (it had no kademe check; it now has the same as the
  archive route), `POST /archive/:type/:id/restore`, `POST /kosks/:id/restore` (was the başnazım's
  alone; now the köşk's nazımı and a Medaris nazımı holding `platform.kosk_edit` by kademe),
  `POST /madrasahs/:id/restore` (was `platform.madrasah_edit` alone; now `madrasah.hide` too).
- **Medaris nazımı:** there is no platform code for hiding a course (`course.hide` is the köşk's and not
  grantable), so for a course the platform level is the başnazım's. For a köşk, a medrese and a hosting
  right a Medaris nazımı holding the platform permission acts at the platform level.
- **Tests:** `hide-kademe.e2e.spec.ts` (the köşk nazımı hides a medrese course: the başmüderris is
  refused with both levels named, the köşk nazımı and the başnazım can; the başnazım hides: neither can;
  the same on the archive route; medrese-level hide of a course; a lesson by a müderris and by a nazım;
  a medrese hidden by the başmüderris, by the başnazım and by a Medaris nazımı; the same for a köşk, a
  deck and a hosting right's courses; rows with no level), `hide-level.spec.ts`, the archive service
  unit spec, and the migration spec `archived-level-migration.e2e.spec.ts` (up, down, up again).
  Each fails with the source change put back (checked: restore always allowed, level never recorded).

**Read this against the coordinator's sentence "başmüderris hides → köşk nazımı cannot restore".** On
the ban ladder the köşk is above the medrese, so by "or any level above" the köşk's nazımı *can* bring
back what a başmüderris hid, and that is what is built (`hide-kademe.e2e.spec.ts`, "the köşk, above, may
too"). If the owner meant the two as separate hands, it is the one table `HIDE_RANK`, and `mayRestoreAt`
is the one comparison.

## The review of 3 October

An independent adversarial review of this change (read-only; its report is not in the repository)
found, by its own count, 1 blocker, 4 high, 9 medium, 13 low and 10 test findings (the count is the
report's; it cannot be reproduced from this repository). What changed, by finding, and the test that
fails without it (each was checked by putting the old code back):

| Finding | Change | Test |
| --- | --- | --- |
| B1, M4: a Medaris nazımı with one platform permission appoints themselves a nazır and gives themselves every permission | `SelfGrantGuard` refuses a caller naming themselves for everyone but SYSTEM_ADMIN and writes `permission.self_grant_refused` to the audit log. The nazır, köşk-nazım (including `POST /kosks` without `managerUserIds`, which would seat the caller), head-müderris, köşk-grant (create and edit), passive-scope and köşk-manager paths refuse always; naming yourself müderris of a course, on the medrese's route or the course's own (`PUT /courses/:id/muderris`, the list in `PUT /courses/:id`), passes only for someone who already holds every müderris default there (a köşk nazımı, a başmüderris). A refusal on a create route has no row to name, so `TedrisatAuthzAudit` files it under the caller with the entity in `details.about` | `self-grant.e2e.spec.ts`; `authz-engine.e2e.spec.ts` › "naming yourself into more than you hold"; `inactive-scope.e2e.spec.ts` › "never themselves"; `self-grant.guard.spec.ts`; `tedrisat-authz-audit.spec.ts` |
| H1: an upper-case uuid in the path dropped the resource's own scope from roles, grants and the passive check | ids lower-cased once at the boundary (`AuthzService`, the loader) and compared lower-cased in `effectivePermissions` | `authz-engine.e2e.spec.ts` › "an id spelled in upper case"; `effective-permissions.spec.ts` › "ids compare lower-cased" |
| H4: what a dismissed Medaris nazımı made for themselves survived | `heldGivenBy` lists those rows and `dismiss` revokes them whatever the answer; an answer owed only for what went to others | `permission-admin.e2e.spec.ts` › "made for themselves" |
| H3: `course.publish`, `course.settings`, `course.view_unpublished` and the `setting.*` abilities were computed and never asked | `PATCH`/`PUT /courses/:id` ask the engine; a draft shows to a holder of `course.view_unpublished` | `authz-engine.e2e.spec.ts` › "the abilities the engine knows are asked on a course save" |
| M1: any course code opened the roster and the content | the roster comes with enrollment work (`enrollment.decide/remove/complete`), the details with the work on the course itself; the roles' defaults still carry both | `effective-permissions.spec.ts` › "what implies reading the roster and the content"; `authz-engine.e2e.spec.ts` › "M1" |
| M3: `madrasah.settings_edit` hid the whole medrese | `madrasah.hide`, an unlisted role default of the başmüderris | "M3" |
| M5: Programım, the upcoming card and the calendar feed gave the live link of a passive course | `enrolledCourseIds(..., { excludePassive: true })` in the schedule and the feed | `schedule.e2e.spec.ts` › "passive course" |
| M6: the recordings list was not audited | audited like a page read, `via: "recordings"` | "M6" |
| M7: `platform.kosk_nazim_manage` passed the guard and the repository then refused it | the köşk's manager routes accept it | "M7" |
| L1: a page view of a passive course wrote two open rows | `scope.passive_open` only when a content code was among the granted ones | "L1"; `authz.service.spec.ts` |
| L2: the başnazım's audited read of a private deck returned 403 for the header | the handler honours the audited admin read | "L2" |
| L3: enrolling removed a staff member from the audit | an enrolled talebe who holds a role in the course's chain stays audited | "L3" |
| L11: a hosting right from a Medaris nazımı was recorded as the köşk nazımı's | `MEDARIS_NAZIM` in the API, the generated client and the label (tr/en/ar) | "L11" |
| T1-T10 | the hide test posts the real route; "allowed" names the statuses it accepts; a hand-written golden table of the catalogue; one negative case per engine rule a mutation could drop; loader cases (deleted group, "every course", policies, passive, sibling köşk); audit unit cases; a snapshot of every route's permissions | `catalogue-golden.spec.ts`, `effective-permissions.spec.ts`, `authz-engine.e2e.spec.ts`, `authz-route-inventory.e2e.spec.ts` |

The review's decision was **not to audit roster reads** (`course.content_read` was written for the
course's content only), written down because the talebe list is arguably personal data (KVKK). The owner
then said to audit them (d-1003-09), and that is done: see "Audit" and "Decided by the owner".

The route inventory is a snapshot of every HTTP handler with the codes it asks for:

```
$ wc -l apps/tedrisat/test/e2e/__snapshots__/authz-route-inventory.txt
207 apps/tedrisat/test/e2e/__snapshots__/authz-route-inventory.txt
```

A widened `@Authz` now shows up as a line of that file in a diff.

### Grantable codes no handler or service asks for

```
$ node -e "…"   # for each grantable code: grep -rEl "PERMISSIONS\.<KEY>" apps/tedrisat/src, excluding permission-catalog.ts
21 grantable codes no handler or service asks for (of 56 grantable):
ban.manage_kosk, deck.manage_kosk, user.lookup, session.live_link, week.hide, recording.manage,
recording.upload, recording.watch_restricted, session.view_content, ban.course, ban.lift_course,
deck.manage_course, deck.propose_kosk, course_nazir.assign, permission_group.define,
platform.appeal_decide, platform.ban_account, platform.youtube_manage, madrasah.admission_rules,
madrasah.appeal_open, madrasah.permanent_ban_request
```

Granting one of them does nothing yet, except that five of them (`session.live_link`, `recording.manage`,
`recording.upload`, `recording.watch_restricted`, `session.view_content`) imply reading the course's
details inside the engine. They belong to features that are not built (recordings,
appeals, admission rules, YouTube, the ban moves above, week hiding) or to the lookup above. They are
kept grantable because nazir/06 and nizam/13 print them: removing one would change the 10, 20 and 11, 21
the screens count.

## Decided by the owner

**Answers of 3 and 4 October (decision box d-1003-06 … d-1004-01).**

- **A başmüderris may ban in their medrese's courses (d-1003-06): "Evet".** The catalogue was right
  (`ban.course` is in their defaults) and the route (MDRS-133) was not. Making the route follow is
  **MDRS-205**, which is separate and not started; its second and third questions are parked as
  d-1004-02 and d-1004-03. Nothing about bans changes in this branch.
- **Hiding has a kademe (d-1003-07): "Elbette kademe var."** Built: see "Hide and restore by kademe".
- **Closing the descendants on passive (d-1003-08)**: confirmed; the warning and the confirmation are
  MDRS-227, not built: see "Passive scopes".
- **Roster reads are audited (d-1003-09): "Kayda alınsın."** Built: see "Audit".
- **`deck.propose_kosk` keeps its sentence (d-1003-10): "Kalsın."**
- **A Medaris nazımı may seat a role without the ceiling (d-1004-01): "Rol atayabilsin."** Holding
  `platform.kosk_nazim_manage` he seats a köşk nazımı, holding `platform.head_muderris_manage` a
  başmüderris, whatever the role's default bundle is; the ceiling below is for giving *permissions*, not
  for seating. This was open question 6 and is built that way already.
- **The Linear statuses stay Done (d-1003-11): "Dokunma."**

**What a Medaris nazımı may hand on (MDRS-209, 3 October).** The question was what "within their
authority" caps a Medaris nazımı holding `platform.madrasah_nazir_grant` at: only what they hold
themselves (nothing: their own default is empty and a grantee never hands on a grant), or everything the
catalogue lists. His first answer, ticked on the question, was "Hepsi, her grant denetlenip başnazıma
gösterilsin"; that was read as "everything" and then corrected in his own words: **"Benim az önceki
kararım 'kendi izinlerinin sınırını aşar' anlamında değil, kendi izinleriyle sınırlı elbette."** So:

- **The ceiling is their own holdings.** A Medaris nazımı gives a nazır, or puts in a group, only codes
  they hold themselves in that medrese: their effective permissions on the medrese and in every course
  below it. Their role default is empty, so that is what the başnazım gave them: codes held at that
  medrese (they are seated there as a nazır and given them), and course codes given "for every course".
  With none of those they appoint and give nothing, which is intended. The shipped sentence "Medrese
  nazırına, kendi izinleriyle sınırlı olarak izin verir." is right as designed.
- **Refused with the codes that exceed it:** 403 `GRANT_EXCEEDS_GIVER`, message "You do not hold: a, b",
  before anything is written. It is checked on `PUT /madrasahs/:id/nazirs/:userId/permissions` (on the
  rows it really inserts, and on kept rows whose end moves later, since more time on a code is handing it
  on again; a kept row is no gift and an earlier end is not one), on creating a group (all its codes) and
  on changing one (the codes the change adds; a rename and a removal are not gifts).
- **Nothing changes for the others.** The başnazım is not asked. The başmüderris holds every medrese
  and course code by role default, so their ceiling asks nothing; they give at the medrese's level. A
  nazır holding `madrasah.nazir_appoint` by a grant, a ders nazırı and a Medaris nazımı without the
  permission cannot give; a code outside the medrese and course lists is refused to everyone
  (`PERMISSION_UNKNOWN`, before any ceiling).
- **Every such act is audited and shown to the başnazım** (he ticked that too): each grant, group change
  and appointment writes an `audit_log` row with the level the giver acted at, and
  `GET /nizam/medaris-nazims/:id/given` lists what they handed on.
- **Naming themselves stays refused** (`SelfGrantGuard`).

What was already true and what was added for the audit and the list, path by path:

| Path a Medaris nazımı can use | Audit row (a) | Listed to the başnazım (b) |
| --- | --- | --- |
| `PUT /madrasahs/:id/nazirs/:userId/permissions` | `permission.grant` and `permission.revoke` existed; the grant row now carries the ids of the grants written (`grants: [{ id, permission, groupId, scopeType, scopeId }]`) and `authority`, the revoke row `grantIds` and `authority` | already: every grant row is `granted_by` the actor, so `heldGivenBy` lists it (GRANT items) |
| `POST /madrasahs/:id/nazirs/:userId` (appoint) | `madrasah_nazir.appoint` existed with the user only; it now carries `role`, `roleAssignmentId`, `scopeType`, `scopeId` and `authority` | already: the seat is `granted_by` the actor (ROLE item) |
| `DELETE …/nazirs/:userId` (dismiss) | `madrasah_nazir.dismiss` existed | n/a |
| `POST`, `PATCH`, `DELETE /madrasahs/:id/permission-groups` | `permission_group.create/update/delete` existed; each now carries `authority`, update and delete the group's `scopeType` and `scopeId`, and `holderIds` (who held the group when it changed or went) | **added:** a GROUP item per live group the person defined or last changed, with its codes and whether they defined or changed it (`groupAction`); `GivenItemResponse.to` is null for it |
| `POST /kosks/:id/nazims` (admin route) | `kosk.nazim.add` existed | already (ROLE item) |
| `POST`, `DELETE /kosks/:id/managers/:userId` | **added:** neither wrote an audit row; they now write `kosk.nazim.add` / `kosk.nazim.remove` with `authority` | already (ROLE item) |
| `PUT /madrasahs/:id/head-muderris`, `inactive_scope.assign` | `madrasah.head_muderris.set`, `inactive_scope.assign` existed | already (ROLE item) |
| `POST /kosks/:id/hosting-rights` | `hosting_right.grant` existed, now with `grantedByRole` `MEDARIS_NAZIM` (review L11) | not in `given`: a hosting right is neither a role nor a permission; the köşk's hosting list names the granter and their level |

The seatings (köşk nazımı, başmüderris, passive-scope assign) give a *role*, whose default is a bundle
larger than a Medaris nazımı's own holdings; each is governed by its own platform permission
(`platform.kosk_nazim_manage`, `platform.head_muderris_manage`, `platform.inactive_scopes_manage`) and
not by this ceiling: the owner decided so (d-1004-01, above).

Two more changes so the başnazım can find these rows: `madrasah_nazir.*` is typed as a role change on
the audit page (it was "other", visible only under "Tümü"), and the dismissal dialog lists the groups
beside the roles and grants, asking no answer for them: a group is not a right the person holds, and what
its holders hold is theirs. Dismissing a Medaris nazımı leaves the groups they defined or changed as they
are. The nazır screens word the refusal (`Problems.exceedsGiver`, tr; en and ar unreviewed, MDRS-202).

Tests: `authz-engine.e2e.spec.ts` › "what a Medaris nazımı hands on: only what they hold, on the record,
listed to the başnazım (MDRS-209)" (six cases: with nothing they appoint and give nothing; after the
başnazım gives them X exactly X can be handed on, audited and listed; groups; kept rows and more time;
a grant "for every course"; the other callers' limits) plus the admin-route köşk nazımı case and the köşk
manager and hosting cases of "review fixes"; `madrasah-permission.spec.ts` › "the ceiling of a Medaris
nazımı"; `effective-permissions`' every-course case through `AuthzService.effective({ acrossCourses })`.
Each fails with the source change put back (checked: no ceiling, the ceiling not asked in the write, the
every-course lift dropped, a group change left unchecked).

## Open questions

1. **Bans through the catalogue** (MDRS-205, not started). The first question, may a başmüderris ban in
   a course of their medrese, is answered yes (above). Parked as d-1004-02 and d-1004-03: which code
   lifts a köşk-level, a medrese-level and a platform-level ban (the catalogue has `ban.lift_course` only
   for the course; `ban.manage_kosk`, `madrasah.ban` and `platform.ban_scoped` each say "ban or lift"),
   and what a Medaris nazımı holding only `platform.ban_scoped` does about a course ban, and whether
   `platform.ban_account` (a closed account) needs anything the ban tables have.
2. **Who may look people up.** `user.lookup` is tagged for the köşk and the course; a Medaris nazımı
   cannot hold it, yet needs it to appoint a köşk nazımı, and a medrese nazırı given
   `madrasah.nazir_appoint` needs it to appoint a nazır.
3. **A policy's outcome at enrolment.** A grant from above a policy lets one person switch the ability
   off, but `CourseService.enroll` still forces approval under the policy; widening a person changes
   what they may set, not what their course then does. Making it do so needs a stored override.
4. **`setting.recordings_public`** has nothing to guard until a route writes a recording's visibility.

## Needs review

- The en/ar of the two new codes (the owner kept the tr sentence of `deck.propose_kosk`, "Köşk destesi
  öner": d-1003-10).
- `course.hide` has no sentence in the canvases; it is deliberately unlisted. Whether a medrese
  nazırı given `madrasah.course_hide` should also be able to hide in a köşk-owned course is not asked.
- Open PRs that add code on the old API and need a rebase after this lands: see the PR description.

## Merge with main at 054c3e79 (4 October)

Main moved again after the note above (`#186` MDRS-220, `#187` MDRS-217, `#189` MDRS-229). One file
conflicted: `libs/common/src/authz/authz.guard.ts`, where `#186` stopped the guard from putting a
failed resolver's raw message into the response. Both changes are kept: the guard now raises
`AuthzResolverError("@Authz(<permission>) resolver failed", { permission }, { cause })`, so the
response carries the permission code and no query text, and the caller's error travels as `cause`.
`#186`'s new guard spec asserted the old `scope` key; it now asserts `permission`
(`libs/common/test/authz/authz.guard.spec.ts`, "keeps what the resolver threw out of the message and
context"). The rest of the three PRs touches the web apps and i18n only.

