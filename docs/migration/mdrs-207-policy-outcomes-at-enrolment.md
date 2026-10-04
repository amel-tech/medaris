# MDRS-207 — Policy outcomes at enrolment: the limit, written down

Stacked on MDRS-136 (`taha/mdrs-136-open-scopes-with-their-admins`, tip `377d4b6e`). **This change builds nothing.**
It adds this note and three tests that pin the behaviour the note describes (they pass on the unchanged
source; see "Tests"). No source code, route, migration or stored value changes. The owner chose to document the limit and leave the
behaviour as it is (decision d-1004-10, 4 October; his words: "bu ne demek ben de anlamadım, belgele
şimdilik"). Because he said he did not follow the issue, most of this note is the explanation. File and line
numbers were read off the tree at the tip above and are checked in "What was checked".

## The situation, in plain words

A policy is a rule that a köşk, a medrese or the platform switches on for everything under it. One of the
three policies is "Kayıt her zaman onaylı" (`ALWAYS_REQUIRE_APPROVAL`): every enrolment under it waits for a
person to approve it, whatever the course's own "requires approval" box says.

The role model says that a policy closes an ability for everyone below it, and that the only way to widen
one person past it is a grant made by an authority above the policy (platform above köşk and medrese; a
köşk and a medrese are not above one another). The ability a policy closes here is `setting.approval_off`,
which is what a person needs to switch a course's "requires approval" box **off**.

That widening works in one place and not in the other:

- **On a course save it works.** `assertMayChangeSettings` in `apps/tedrisat/src/course/course.service.ts`
  (starts at line 614; the question about `setting.approval_off` is at lines 646 to 657) asks the engine whether the caller
  holds `setting.approval_off` on that course. Two kinds of caller get yes under a policy, and the save goes
  through:
  - a person holding it through a grant made by the platform (under a köşk or medrese policy; under the
    platform's own policy nothing can widen anyone, because no authority is above the platform);
  - the başnazım (realm role `SYSTEM_ADMIN`), with no grant at all and under **all three** policies, the
    platform's included. `AuthzService.can` answers his questions through `adminCan`
    (`libs/common/src/authz/authz.service.ts:80` and `:211`), which says yes to every code but a private
    deck's writes. This is the engine's existing behaviour for him and is not changed here.

  Anyone else gets 409 `PLATFORM_POLICY_LOCKED`. The route in front of the save has its own guard,
  `course.edit` (`course.controller.ts:262` for PATCH, `:295` for PUT), which runs first: a refusal there is a
  plain 403 and the policy question is never reached.
- **At enrolment it does not.** `enroll` in the same file (line 1033) never asks the engine. It reads the
  three policy stores itself and forces PENDING if any is on:
  - the köşk's flag and the private-köşk flag, from `koskService.findVisibility` (line 1055);
  - the platform's switch, `platformPolicies.isOn("ALWAYS_REQUIRE_APPROVAL")` (lines 1056 to 1059);
  - the medrese's flag, `courseRepo.forcesApproval(courseId)` (line 1063; the query is at
    `course.repository.ts:1318` and joins the course's medrese to its `policy_always_approval`).

So a widened person (a platform-granted one, or the başnazım) is widened at the save, and the course then
behaves as if they had not been.

## One example, with the roles

A köşk has switched "Kayıt her zaman onaylı" on. Ayşe is a ders nazırı of one course in that köşk. The başnazım
(or a Medaris nazımı who may hand it out) gives Ayşe two grants at that course, both made at the
platform's authority: `course.edit` and `course.settings`. A ders nazırı holds no permission by default, and
`course.edit` is what the route guard asks, so `course.settings` alone gets a 403 before the policy is looked
at. With both, Ayşe holds `setting.approval_off` there (it is derived from `course.settings`) and, among the
people of the köşk, nobody else does. The başnazım is let through too, as above, but he is not part of the
köşk's people.

1. Ayşe switches the course's "requires approval" off. The save answers 200 and the course stores
   `requires_approval = false`. This is the widening, and it works.
2. A talebe, Mehmet, presses "enrol" on that course. `enroll` reads the köşk's flag, finds it on, and answers
   PENDING. The course says "no approval" and Mehmet still waits.

If the policy were switched off later, Mehmet would be ENROLLED, because the stored box says `false`. Until
then the switch Ayşe made has no effect on anyone she serves.

## What happens today

- With no policy on, nothing changes: the course's own box decides (a platform-wide test,
  `platform-admin.e2e.spec.ts:571`, shows ENROLLED once the policy is off).
- With a policy on at any of the three levels, every new enrolment is PENDING, whoever switched what on the
  course. Tests that pin this and stay as they are: platform `platform-admin.e2e.spec.ts:571`, köşk
  `kosk-admin.e2e.spec.ts:753`, medrese `madrasah-settings.e2e.spec.ts:393`.
- A seat taken before the policy came on stays; the policy only decides new enrolments
  (`madrasah-settings.e2e.spec.ts:393` shows this for the medrese).
- The widened person's save works, as above, and so does the başnazım's, under all three policies. The
  engine half is pinned for the neighbouring ability (`setting.course_open`, "closed course required") through a real PATCH in
  `authz-engine.e2e.spec.ts`, test "the medrese's 'closed course required' holds on an update, and a grant
  from the platform widens one person" (line 1722), and for `setting.approval_off` at the engine
  alone in "a köşk policy closes an ability for the müderris, and a grant from the platform keeps it for one
  person" (line 1875). The three tests this change adds make the approval PATCH under a policy and then enrol
  (see "Tests").

## What would be needed to change it

Making `enroll` take the engine's answer is not enough on its own. The person pressing "enrol" is a talebe,
whose own answer can never carry Ayşe's grant. So the course would have to remember that someone widened it:
a stored per-course exemption. Sketch, not built:

- a new table (for example `course_policy_lifts`: the course, the policy key, the level and id of the policy,
  who lifted it and under which authority; the başnazım's bypass has no grant behind it, so the row would
  have to say "realm administrator" for his saves), so no whole-row response of a course leaks it, and a migration
  with its rollback;
- the engine would have to report which policies a person's grant got past, and the loader a way to read a
  course's policies and exemptions together, in `libs/common/src/authz` and
  `apps/tedrisat/src/authz/tedrisat-authz-context.service.ts`;
- `assertMayChangeSettings`, `update` and `replace` would write or clear the exemption when approval is
  switched off or on again, with an audit row; the exemption must never come from the request body;
- `enroll` would ask whether the policy is still in force for that course, and `forcesApproval` and the two
  direct reads would go; the course purge (`course-purge.ts`) would delete the rows;
- tests at the engine, the loader, and the real database for each level, plus a migration spec.

The private-köşk rule (a course of an unlisted köşk always waits) is a separate rule and would stay as it is.

## Why it is left alone for now

The owner asked for documentation only. Nothing is broken in the sense of a refusal or a leak: the failure is
that a widening has less effect than its description says, and only for a person the platform deliberately
widened (a grant above the policy) or the başnazım (the realm bypass, which also reaches the platform's own
policy), under a policy someone switched on. No existing course changes behaviour either way. The
change would need a migration, an engine change and a new table, for a case nobody has asked for yet.

## Acceptance criteria

The issue has no checklist; its three bullets are read as follows.

| # | Bullet | Status | Why |
| --- | --- | --- | --- |
| 1 | `enroll()` reads the engine's answer, not the policy alone | **Not met, by the owner's decision** | `enroll` still reads the three stores (lines above). Documented here; not a defect found later. |
| 2 | `setting.recordings_public` has a route that guards it | **Not met here; no open work does it either** | The issue says "wire it in MDRS-119". PR #211 (MDRS-119, Bunny playback) builds no write route and does not mention `setting.recordings_public`; its body says the recording write endpoints, `POST /lessons/:id/recordings` and `PATCH /recordings/:id`, are in #202 (MDRS-247, draft). #202 guards both with `RECORDING_MANAGE` only, so as written its PATCH, which can set `visibility`, would ship without `can(..., setting.recordings_public)`. #202 is where the guard belongs: when `visibility` becomes PUBLIC it must ask the engine. Nothing writes a recording's visibility on this tree (`recording.repository.ts` only reads the table), so nothing is unguarded yet. |
| 3 | `setting.approval_off` is asked on a course save | **Already true** | `assertMayChangeSettings` (line 614), called from `update` (line 590) and `replace` (line 687). Nothing changes. |

## Behaviour changes

None. No route, response, permission, message or stored value differs from the tip this sits on.

## Decided by the owner

1. Document the limit and build nothing (d-1004-10).

## Decided by default, owner may overrule

1. The başnazım's save of "requires approval: false" under a policy answers 200 and is inert at enrolment,
   like a widened person's. It is the engine's existing realm bypass (`adminCan`), left as it is: closing it
   would make the başnazım the one caller who cannot do what `can()` says he can, and the issue does not ask
   for it. Default: documented and pinned by tests, not changed.
2. `setting.recordings_public` is handed to #202 (MDRS-247), the PR that builds the write routes, not to
   MDRS-119, which has no such route. Default: stated here; nothing is built in this change.

## Related notes not edited

`docs/migration/mdrs-135-permission-catalogue.md` still says, in "Policies (§6)", that `enroll` and
`publicRecordingsAllowed` read the settings themselves, and, in its open questions (item 3), that making a
widening count at enrolment needs a stored override. Both remain true on this tree, so they are left as they
are; that file is changed by other issues of this effort and this one points to it rather than rewriting it.

## Tests

The three tests below were added after review found the note's claims about the başnazım and about the
route guard had no test. They pin current behaviour and pass on the unchanged source. To prove they are real,
the source was changed temporarily (and restored): `enroll` made to ignore the three policy reads, and the
PATCH route guard widened to accept `course.settings` as well as `course.edit`.

| Claim | Test | Fails with the temporary change |
| --- | --- | --- |
| `course.settings` alone gets 403 `AUTHZ_FORBIDDEN` and writes nothing; with `course.edit` as well the save answers 200 and the next enrolment is PENDING | `authz-engine.e2e.spec.ts:1774`, "a ders nazırı widened past a köşk policy needs course.edit as well, and the widening is inert at enrolment" | yes, `expected 403 "Forbidden", got 200 "OK"` (guard widened) |
| the başnazım's save answers 200 under a köşk policy and under a medrese policy, a köşk nazımı gets 409 for the same save, and the enrolment is PENDING | `authz-engine.e2e.spec.ts:1827`, "the başnazım's save of 'requires approval: false' answers 200 under a köşk and a medrese policy, and the enrolment still waits" | yes, `expected 'ENROLLED' to be 'PENDING'` (enroll ignores policy) |
| the same under the platform's own policy | `platform-admin.e2e.spec.ts:610`, "lets the başnazım switch 'requires approval' off under the platform rule, and the enrolment still waits" | yes, `expected 'ENROLLED' to be 'PENDING'` |

These tests describe the limit, not a wish: whoever builds the exemption of "What would be needed to change
it" will have to change the PENDING expectations in them on purpose.

Run with the three tests in place: `authz-engine.e2e.spec.ts` and `platform-admin.e2e.spec.ts`
together, 2 files and 78 tests passed (read from the vitest summary).

## What was checked, and what was not

Checked against the tree at `377d4b6e`: every file and line named above (the line numbers of the neighbouring
notes and of the scout's dossier differ from this tree, so none were copied); that `forcesApproval` has one
caller; that `lesson_recordings` is read by `recording.repository.ts` and purged by `course-purge.ts` and
written by nothing else under `apps/tedrisat/src`; the policy-to-ability table in
`libs/common/src/authz/policies.ts` (`ALWAYS_REQUIRE_APPROVAL` closes `setting.approval_off`) and
`authorityAbove`.

Not verified:

- The older tests this note cites by name and line (`platform-admin.e2e.spec.ts:571`, `kosk-admin`,
  `madrasah-settings`, the closed-course and the engine-only approval tests) were not re-run for this note
  except those inside the two spec files named under "Tests".
- That a platform-granted person's (not the başnazım's) PATCH of `requiresApproval: false` under a köşk or
  medrese policy answers 200 is read from the code path, the same one the closed-course test exercises; the
  new tests grant both permissions and make that PATCH for a ders nazırı, but under a köşk policy only.
- PR #211 and #202 were read with `gh pr view` and `gh pr diff` (read only) on 4 October: #211 has no write
  route and no `recordings_public`; #202 guards its two write routes with `RECORDING_MANAGE`. That MDRS-119
  is assigned to Enes, and the decision id d-1004-10 with the owner's words, come from the assignment text
  (the decision box and Linear were not read).
