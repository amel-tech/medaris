# MDRS-207 — Policy outcomes at enrolment: the limit, written down

Stacked on MDRS-136 (`taha/mdrs-136-open-scopes-with-their-admins`, tip `377d4b6e`). **This change builds nothing.**
It adds this note and no code, no migration and no test. The owner chose to document the limit and leave the
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
  holds `setting.approval_off` on that course. A person holding it through a grant made by the platform gets
  yes, even under a köşk or medrese policy, and the save goes through. Anyone else gets 409
  `PLATFORM_POLICY_LOCKED`.
- **At enrolment it does not.** `enroll` in the same file (line 1033) never asks the engine. It reads the
  three policy stores itself and forces PENDING if any is on:
  - the köşk's flag and the private-köşk flag, from `koskService.findVisibility` (line 1055);
  - the platform's switch, `platformPolicies.isOn("ALWAYS_REQUIRE_APPROVAL")` (lines 1056 to 1059);
  - the medrese's flag, `courseRepo.forcesApproval(courseId)` (line 1063; the query is at
    `course.repository.ts:1318` and joins the course's medrese to its `policy_always_approval`).

So the widened person is widened at the save, and the course then behaves as if they had not been.

## One example, with the roles

A köşk has switched "Kayıt her zaman onaylı" on. Ayşe is a ders nazırı of one course in that köşk. The başnazım
(or a Medaris nazımı who may hand it out) gives Ayşe a grant of `course.settings` at that course, made at the
platform's authority. Under the engine, Ayşe now holds `setting.approval_off` there and nobody else in the
köşk does.

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
- The widened person's save works, as above. The engine half is pinned for the neighbouring ability
  (`setting.course_open`, "closed course required") through a real PATCH in
  `authz-engine.e2e.spec.ts`, test "the medrese's 'closed course required' holds on an update, and a grant
  from the platform widens one person" (line 1722), and for `setting.approval_off` at the engine
  alone in "a köşk policy closes an ability for the müderris, and a grant from the platform keeps it for one
  person" (line 1774). No test makes the approval PATCH under a policy and then enrols.

## What would be needed to change it

Making `enroll` take the engine's answer is not enough on its own. The person pressing "enrol" is a talebe,
whose own answer can never carry Ayşe's grant. So the course would have to remember that someone widened it:
a stored per-course exemption. Sketch, not built:

- a new table (for example `course_policy_lifts`: the course, the policy key, the level and id of the policy,
  who lifted it and under which authority), so no whole-row response of a course leaks it, and a migration
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
that a grant has less effect than its description says, and only for a person who was deliberately widened
by the platform, under a policy someone switched on. No existing course changes behaviour either way. The
change would need a migration, an engine change and a new table, for a case nobody has asked for yet.

## Acceptance criteria

The issue has no checklist; its three bullets are read as follows.

| # | Bullet | Status | Why |
| --- | --- | --- | --- |
| 1 | `enroll()` reads the engine's answer, not the policy alone | **Not met, by the owner's decision** | `enroll` still reads the three stores (lines above). Documented here; not a defect found later. |
| 2 | `setting.recordings_public` has a route that guards it | **Not met here, and no work belongs here** | The issue says it becomes live with the recordings work, MDRS-119: "wire it there". MDRS-119 is assigned to Enes, and its open PR is #211 (Bunny playback). Nothing writes a recording's visibility on this tree: `recording.repository.ts` only reads the table. |
| 3 | `setting.approval_off` is asked on a course save | **Already true** | `assertMayChangeSettings` (line 614), called from `update` (line 590) and `replace` (line 687). Nothing changes. |

## Behaviour changes

None. No route, response, permission, message or stored value differs from the tip this sits on.

## Decided by the owner

1. Document the limit and build nothing (d-1004-10).

## Decided by default, owner may overrule

Nothing was decided by default; the issue was answered.

## Related notes not edited

`docs/migration/mdrs-135-permission-catalogue.md` still says, in "Policies (§6)", that `enroll` and
`publicRecordingsAllowed` read the settings themselves, and, in its open questions (item 3), that making a
widening count at enrolment needs a stored override. Both remain true on this tree, so they are left as they
are; that file is changed by other issues of this effort and this one points to it rather than rewriting it.

## What was checked, and what was not

Checked against the tree at `377d4b6e`: every file and line named above (the line numbers of the neighbouring
notes and of the scout's dossier differ from this tree, so none were copied); that `forcesApproval` has one
caller; that `lesson_recordings` is read by `recording.repository.ts` and purged by `course-purge.ts` and
written by nothing else under `apps/tedrisat/src`; the policy-to-ability table in
`libs/common/src/authz/policies.ts` (`ALWAYS_REQUIRE_APPROVAL` closes `setting.approval_off`) and
`authorityAbove`.

Not verified:

- No test was run for this note, because nothing was changed. The existing tests are cited by name and line,
  not re-run.
- That a widened person's PATCH of `requiresApproval: false` under a köşk or medrese policy answers 200 is
  read from the code path, the same one the closed-course test exercises. No test makes that PATCH.
- That Enes owns MDRS-119 and that PR #211 is its open PR comes from the assignment text; I did not check GitHub or
  Linear for it, and no file in the repository states it. The decision id d-1004-10 and the owner's words are
  also from the assignment text (the decision box was not read).
