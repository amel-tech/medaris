# MDRS-108 — nizam lists the köşks you manage, and shows only the buttons you may press

Linear could not be read from the session that did this work (no Linear MCP
tool); the scope below is the task note the launch-wave-3 chain was given,
checked against the code and the earlier migration notes (MDRS-103, -105,
-106, -126).

## What changed

### tedrisat

- **`GET /kosks?managedBy=me`.** The list, and its `total`, narrow to the
  köşks the caller is in `kosk_managers` for. Same pagination contract as the
  plain list (`page`, `limit` capped at 50, `{ items, total, page, limit }`).
  `me` is the only accepted value (`ParseEnumPipe`, enum `KoskManagedBy`);
  anything else is a 400, so the route never answers "which köşks does user X
  manage". The route stays `@AuthzExempt()` — the filter only ever narrows to
  the caller's own rows. A non-UUID `sub` matches nothing (`sql\`false\``)
  instead of failing in Postgres with 22P02, the same rule as `isManager`.
  The list order gained `id` as a last tie-breaker so two köşks created in the
  same instant cannot swap places between pages.
- **Köşk DTO validation** (`apps/tedrisat/src/kosk/dto/kosk-field-rules.ts`,
  shared by create and update):
  - `level` is one of `ALL | BEGINNER | INTERMEDIATE | ADVANCED` (the four
    tedris already labels), published as the `KoskLevel` enum. It was free
    text before.
  - `tags`: at most 10, distinct, none blank, each at most 40 characters. It
    was unbounded before.
  - `field` keeps its 60-character cap; `coverHue` keeps 0–360.
  - NOT NULL columns (`name`, `coverHue`, `isPrivate`, `tags`) refuse `null`
    with 400. Before, `@IsOptional()` (and `PartialType`'s) let `null`
    through and Postgres answered 500. `UpdateKoskDto` now uses
    `PartialType(..., { skipNullProperties: false })`.
  - Nullable columns (`handle`, `description`, `field`, `level`) accept `null`
    and it clears them; the generated client types them `string | null`.
- **No migration.** `field`, `level`, `tags` and `cover_hue` have been on
  `kosks` since `0008`/`0009`; nothing about the table changed, so there is
  nothing to roll back. Existing rows with a `level` outside the four are not
  rewritten; they are only refused on the next write of that field, and nizam
  and tedris show such a value as stored.
- OpenAPI spec and the generated client regenerated with
  `pnpm run openapi:tedrisat`. Files whose only difference was the
  `The version of the OpenAPI document` header were left out of the commit.

### nizam

- The köşk list calls `getAllKosks({ managedBy: "me" })`
  (`getManagedKosks`). Cards now show the cover hue, field, level and the
  first three tags.
- **Every button is tied to `/me`'s roles** through
  `apps/nizam/features/kosks/kosk-abilities.ts`:

  | Button | Routes it calls | Shown to |
  | -- | -- | -- |
  | Yeni Köşk | `POST /kosks` (exempt) | everyone signed in |
  | Köşkü Düzenle | `PATCH /kosks/:id` — kosk `EDIT` | köşk manager, nazır of its medrese |
  | Yeni Ders Aç | `POST /kosks/:id/courses` — kosk `MANAGE_COURSES`; session batch — course `EDIT` | köşk manager |
  | Bekleyen talepler | pending list — kosk `MANAGE_COURSES`; approve/reject — course `MANAGE_ENROLLMENTS` | köşk manager |
  | course card → editor | `PUT /courses/:id`, sessions, lessons — course `EDIT` | köşk manager, that course's müderris |
  | Kayıtlar (roster) | enrollments — course `MANAGE_ENROLLMENTS` | köşk manager, that course's müderris |
  | müderris picker | `ASSIGN_MUDERRIS` inside the save | köşk manager (`mayAssignMuderris`, MDRS-105) |

  SYSTEM_ADMIN sees all of them (realm bypass). A nazır gets only "Köşkü
  Düzenle": the matrix gives `MADRASAH_NAZIR` `MANAGE_COURSES` on a köşk but
  nothing on its courses, so "Yeni Ders Aç" and the pending-requests panel
  would 403 half-way for them.
- The new-course and course-editor pages answer 404 to a caller the table
  does not show the button to (typed-in URL); the köşk page fetches pending
  requests only for those who see the panel.
- **The table is pinned by two specs.** nizam cannot import the matrix
  (`platform:web` → `platform:node`), so:
  `apps/tedrisat/test/unit/authz/nizam-kosk-buttons.spec.ts` reads each
  route's `@Authz` scope from its decorator metadata and checks every role in
  `shownTo` holds it in `MATRIX`; `apps/nizam/test/kosk-abilities.spec.ts`
  checks the gating functions show each button to exactly those roles.
- **"Verdiğiniz dersler".** `managedBy=me` drops the köşks a müderris only
  teaches in; without a way back they could no longer reach their own course
  in nizam. The list now ends with the courses from `/me`'s `teaches` in
  köşks the caller does not manage, each linking to its editor.
- **"Bu işler nazir'de".** Shown only as the empty state of the list, only to
  a caller who manages no köşk and has medrese roles (`roles.nazirOf`). A köşk
  manager is never sent to nazir. `nazirOf` is always empty today
  (`UserService.getMe`), so the state is prepared text, not reachable yet; it
  links nowhere because nazir is still a stub.
- **The köşk form** gained `field`, `level` (select, with "not set"), `tags`
  (Enter or comma adds, Backspace removes the last, a chip's × removes it)
  and `coverHue` (0–360 slider with a live preview of the cover). On edit an
  emptied text field or "not set" is sent as `null`, which is what clears it;
  before, emptying the description and saving changed nothing. Limits mirror
  tedrisat's in `apps/nizam/features/kosks/kosk-form.ts`.
- **i18n.** The list, the köşk page and the form read every string from
  `nizam.KosksPage`, `nizam.KoskDetail`, `nizam.KoskForm` (tr/en/ar). The
  `KosksPage` namespace's old keys were unused and are replaced. `Levels`
  gained `ALL`, and its en/ar values — Turkish copies until now — are
  translated. A spec checks the four namespaces have the same keys, all
  filled, in the three locales.
- Design source: the committed `design-system/` mirror (no DesignSync call was
  made). The screens follow nizam's existing shadcn components from
  `libs/ui`; the cover is the same OKLCH hue gradient the course cards and
  tedris's köşk cards already draw.

## What was verified

All with `env -u NODE_ENV -u DB_PORT -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD -u DATABASE_URL`
in front, `--skip-nx-cache`:

- `typecheck` — 17 projects green (see the note below on a fresh worktree).
- `test` — 9 projects green; 1440 tests, 0 failures, read from the junit
  reports: tedrisat 749, keycloak-theme 405, common 86, env 57, nizam 42,
  tedris 37, teskilat 30, landing 26, utils 8.
- `build` — 8 projects green.
- `lint`, `module-boundaries` — 17 projects green.
- `node tools/ci/biome-ratchet.mjs` — errors 0 / warnings 75 / infos 24,
  equal to the baseline.
- `node tools/ci/assert-openapi-spec-fresh.mjs` — 55 paths, identical.
- New e2e cases in `test/e2e/kosk.e2e.spec.ts`: `managedBy=me` lists and
  counts only the caller's köşks, includes a köşk they were added to as a
  second manager, pages through them, returns an empty page to someone who
  manages nothing, refuses any value but `me`; the form fields update and
  clear; an invalid `level`, eleven tags, a 41-character tag, duplicate or
  blank tags and a 61-character field are 400; a `null` `name`, `coverHue`,
  `tags`, `isPrivate` on update and a `null` `coverHue` on create are 400,
  not 500.

## What was not verified

- **nizam was not exercised in a browser.** The screens typecheck, build and
  their gating functions are unit-tested; no one has clicked through them
  signed in as a manager, a müderris and a talebe.
- The "Bu işler nazir'de" state cannot be reached until `/me` fills
  `nazirOf`; it was checked only through `koskListEmptyState`.
- A non-UUID `sub` against `managedBy=me` is covered by reading the code, not
  by a test: the e2e harness signs every request in as a UUID user.
- **Fresh-worktree typecheck.** In a worktree where `next build` has never
  run, `nizam-web:typecheck` fails on `app/[locale]/page.tsx`
  (`"welcome"` is not assignable to `never`) — on the unchanged branch tip
  too, so it is not this change. It goes green once `-t build` has produced
  `next-env.d.ts` / `.next/types`. The gate above was run in that order the
  second time.

## Follow-ups

- **Role model v2 (MDRS-134/135/142) is the switch point.**
  `kosk-abilities.ts` derives every button from `/me`'s roles because that
  is all today's model offers. When `/me` returns effective permissions,
  those functions read them instead, and the two pinning specs collapse into
  one check against the permission catalogue. The same change fills
  `nazirOf` (and brings the ders nazırı role), which is what makes "Bu işler
  nazir'de" reachable; decide then whether it links to nazir.
- The API accepts a tag with surrounding spaces and treats `Tefsir` and
  `tefsir` as two tags; nizam trims and de-duplicates without case before it
  sends. Normalising on the server needs `@Transform`, which only runs where
  the validation pipe transforms — left for whoever next touches the pipe.
- A `/me` that fails makes the course editor answer 404 (no role known, so
  no button and no page); tedrisat being down breaks the page anyway, so this
  was kept rather than falling back to showing buttons that may 403.
- `PendingRequests` and the course editor still carry hard-coded Turkish;
  only the list, the köşk page and the form moved to i18n here.
- `kosks.is_private` is still not applied to `GET /kosks` (noted on the
  route since MDRS-43); `managedBy=me` does not change that.
- `CLAUDE.md` gives tedrisat 45 suites, 23 of them e2e; the tree has 48 and
  24 (47/24 before this change). Not edited here.
- The fresh-worktree `typecheck` ordering above is worth a line in
  `CLAUDE.md`'s gate section, or a `dependsOn` that generates
  `next-env.d.ts` first; not done here.
