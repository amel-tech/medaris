# MDRS-171 — Medaris nazımları, İzin ver, İzin grupları

Screens: nizam/11 "Medaris nazımları", nizam/12 "İzin ver" (dialog), nizam/13
"İzin grupları". Base: `release/stack-40-nizam-medrese`. This is the Mac lane
(nizam/nazır packages); it is not linked to stack #130 until the tedris lane
(26, 29–36) is merged in.

## What was done

**tedrisat** (`src/assignment/admin/`)

- Migration `0033_permission_groups_course_wide` (rollback in
  `src/database/rollbacks`): a group or a grant in the scope `course` may name
  no course (= every course); köşk and medrese groups and grants must still name
  theirs; a live group name is unique (case-insensitive) among groups with no
  scope id. **Numbering:** written as 0032; when this chain was stacked on
  top of the tedris lane (`0031_kesfet`) it became 0033. Its snapshot was
  regenerated with `drizzle-kit generate`, which wrote the same SQL byte for
  byte.
- Permission catalog: 17 platform codes (`platform.*`) in the five sections of
  nizam/12, plus the 18 course codes a course-scoped group may carry.
- All of the following are the SYSTEM_ADMIN realm role's alone (403 otherwise,
  which the web app shows as nizam/06):
  `GET /nizam/permissions`; `GET/POST /nizam/medaris-nazims`,
  `PUT /nizam/medaris-nazims/:userId/grants`,
  `GET /nizam/medaris-nazims/:userId/given`, `DELETE /nizam/medaris-nazims/:userId`;
  `GET/POST /nizam/permission-groups`, `PUT/DELETE /nizam/permission-groups/:id`,
  `GET /nizam/permission-groups/:id/users`.
- Every write is one transaction with its `audit_log` row(s): `medaris_nazim.appoint`,
  `medaris_nazim.dismiss`, `permission.grant`, `permission.revoke`,
  `permission_group.create|update|delete`.
- `KeycloakAdminService.findById` names a freshly appointed person who never
  signed in (the users table has no row for them yet).
- The generated client (`libs/services`) is regenerated.

**nizam-web**

- `[locale]/medaris-nazimlari`, `[locale]/izin-gruplari` (+ `loading`), the
  dialog of nizam/12 (appoint and edit), the dismissal dialog, the group form
  and the "what becomes of the users" `AlertDialog`; i18n `NazimsPage`,
  `PermissionsDialog`, `DismissDialog`, `GroupsPage`, `UsersPolicyDialog`,
  `NazimPicker`, `PermissionCatalog`, `PermissionsPage` in tr, en and ar.

## Decisions

- Semantics the spec leaves open:
  - **End date.** One "Bitiş": appointing sets the appointment's end and the
    permissions' end; editing may only shorten the permissions' end (never past
    the appointment's); empty means "when the appointment ends". The column shows
    the earliest of them. A lapsed appointment is not listed.
  - **`usersPolicy`.** `keep`: people who held the group keep its (old)
    permissions as single permissions; `revoke`: they lose them. Either way they
    no longer hold the group row after a permissions change, so the new set
    reaches only whoever is given the group later. Asked only while somebody
    holds the group, and for a save only when the permissions change.
  - **Dismissal.** The "Devral/Düşür" rows are what the person handed on
    (roles and permissions with `granted_by` = them): Devral makes the başnazım
    the giver, Düşür revokes it. The API wants exactly one answer per item.
  - A group's scope cannot be changed after it is made.
- Sürüm kapısı: "Görevden al" is disabled on the viewer's clock until
  4 Ekim 2026 00:00 (Istanbul); the screen says nothing about why. The API
  endpoint itself is open (nothing in the API knows about the gate).
- The short labels in the "İzinler ve gruplar" column are the design's for five
  permissions; the other twelve are derived from their titles.
- Dropdown "Hazır izin grubu" lists platform groups only; a course-wide group
  is shown in the list and noted in the dialog but cannot be given from nizam/12
  (the design draws no way). "Bir ders" is drawn disabled: no page offers a
  course list for the whole platform yet. The API already accepts it.

## Verified

- tedrisat against a real Postgres (Testcontainers): `permission-admin.e2e.spec.ts`
  (24), `permission-groups-migration.e2e.spec.ts` (migration, rollback, forward
  again), `grant-plan.spec.ts` (11).
- nizam-web: vitest `permissions.spec.tsx`; Playwright
  `e2e/permissions.e2e.ts` (16 specs) against the running API, a private
  Postgres and the real Keycloak (`e2e-sistem-admin`, `e2e-medaris-nazim`,
  `e2e-kosk-nazim`; the e-mail search goes to the real realm through
  `tedrisat-admin`): list, order, ends, 403 for a Medaris nazımı, the gate (page
  clock pinned), dismissal with Devral and Düşür, the dialog's lock/unlock and
  summary, saving, end-date errors, appointing, group list/create/duplicate/
  delete/rename/change with both answers. Screens were compared with the canvas
  PNGs at 1440 px and 390 px.

## Not verified / not done

- The light/dark and Arabic (rtl) renderings were not checked in a browser.
- Course-wide grants do not show in `/me/effective-permissions` (the row has no
  course to name); nothing yet reads the platform permissions to open a
  section — the catalog and the data are here, the enforcement per screen belongs
  to the packages that build those screens.
- Giving a course-wide group to a person has no screen.
- Lesson for the next runner: `.env`'s `API__DB_PORT` decides the database, a
  process variable of that name is ignored. A run that forgot this applied
  0032 (now 0033) to another lane's database; it was rolled back with the rollback file and
  the drizzle row deleted.
