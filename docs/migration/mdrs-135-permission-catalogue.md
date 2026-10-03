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
  `platform.madrasah_nazir_grant` gives a medrese nazırı its permissions, as the platform. What
  "within their own authority" caps that at is an open owner question (see "Open questions"). All three go through `MadrasahPermissionService.authorityOf`, which asks the
  engine. A medrese nazırı, a ders nazırı and a grantee of any kind cannot give.
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

### Audit (§8)

- Already written before this change: grants, revocations, group changes, policy changes (MDRS-169,
  171, 181). Unchanged.
- `course.content_read`: `CourseService.present` records a content read by anyone who is neither an
  enrolled talebe nor one of the course's müderrisler; its `details` now name the permission
  (`course.view_details`) and whether the realm bypass was used. Test:
  `authz-engine.e2e.spec.ts` › "a köşk nazımı reads a medrese course's content in their köşk, and the
  read is on the record".
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
| hide / restore a course | `ARCHIVE` | `course.hide` or `madrasah.course_hide` | |
| `PATCH|PUT /courses/:id`, lesson routes | `EDIT` | `course.edit`, `session.manage` | the lesson routes are session work |
| enrollment decide / complete / remove | `MANAGE_ENROLLMENTS` | `enrollment.decide`, `enrollment.complete`, `enrollment.remove` | the catalogue already told them apart |
| roster, stats, badge counts | `MANAGE_ENROLLMENTS` | `course.staff_read` | "ders kadrosu talebenin adını ve e-postasını varsayılan görür; bu ayrı bir izin değildir" |
| `PUT /courses/:id/progress` | `VIEW_DETAILS` | `course.view_details` | unchanged: "the enrolled and the course staff" |
| medrese list for management, create, head müderris, restore | `CREATE_MADRASAH` | `platform.madrasah_create` / `platform.madrasah_edit` / `platform.head_muderris_manage` | the başnazım by the bypass, a Medaris nazımı by grant |
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

## The review of 3 October

An independent adversarial review of this change (read-only; its report is not in the repository)
found, by its own count, 1 blocker, 4 high, 9 medium, 13 low and 10 test findings (the count is the
report's; it cannot be reproduced from this repository). What changed, by finding, and the test that
fails without it (each was checked by putting the old code back):

| Finding | Change | Test |
| --- | --- | --- |
| B1, M4: a Medaris nazımı with one platform permission appoints themselves a nazır and gives themselves every permission | `SelfGrantGuard` refuses a caller naming themselves for everyone but SYSTEM_ADMIN and writes `permission.self_grant_refused` to the audit log. The nazır, köşk-nazım, head-müderris, köşk-grant, passive-scope and köşk-manager paths refuse always; naming yourself müderris of a medrese course passes only for someone who already holds every müderris default there (a başmüderris) | `authz-engine.e2e.spec.ts` › "naming yourself into more than you hold"; `self-grant.guard.spec.ts` |
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

Decision taken here: **roster reads are not audited.** `course.content_read` is written for the course's
content (the page and the recordings); the talebe list (names and e-mails) is read through
`course.staff_read` by the people who run the course and is closed under a passive scope, but a read of
it writes no row. Written down because the issue says "every read of course content" and the talebe
list is arguably personal data (KVKK): see "Open questions".

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

## Open questions

1. **What does "within their authority" cap a Medaris nazımı at?** Read as "only what they hold
   themselves" it leaves them nothing to give: their own role default is empty and a grantee never
   hands on what was granted. Read as "any medrese or course code the catalogue lists" it lets a Medaris
   nazımı with one platform permission hand a nazır every permission of a medrese, as the platform,
   which also beats the medrese's and the köşk's policies. The self-grant guard stops the person naming
   themselves; it does not stop naming an accomplice. Until the owner says, there is no ceiling on this
   path and `authz-engine.e2e.spec.ts` carries an `it.todo` for it.
2. **Bans through the catalogue.** To read bans from the codes someone has to say: may a başmüderris ban
   in a course of their medrese (the catalogue says yes, `ban.course` is in their defaults; the route
   says no, MDRS-133)? Which code lifts a köşk-level, a medrese-level and a platform-level ban (the
   catalogue has `ban.lift_course` only for the course; `ban.manage_kosk`, `madrasah.ban` and
   `platform.ban_scoped` each say "ban or lift")? What does a Medaris nazımı holding only
   `platform.ban_scoped` do about a course ban? Does `platform.ban_account` (a closed account) need
   anything the ban tables have?
3. **Who may look people up.** `user.lookup` is tagged for the köşk and the course; a Medaris nazımı
   cannot hold it, yet needs it to appoint a köşk nazımı, and a medrese nazırı given
   `madrasah.nazir_appoint` needs it to appoint a nazır.
4. **Roster reads and the audit** (the decision above): audit them, or keep them as management views?
5. **A policy's outcome at enrolment.** A grant from above a policy lets one person switch the ability
   off, but `CourseService.enroll` still forces approval under the policy; widening a person changes
   what they may set, not what their course then does. Making it do so needs a stored override.
6. **`setting.recordings_public`** has nothing to guard until a route writes a recording's visibility.

## Needs review

- The wording of `deck.propose_kosk` ("Köşk destesi öner") and the en/ar of the two new codes.
- `course.hide` has no sentence in the canvases; it is deliberately unlisted. Whether a medrese
  nazırı given `madrasah.course_hide` should also be able to hide in a köşk-owned course is not asked.
- Open PRs that add code on the old API and need a rebase after this lands: see the PR description.
