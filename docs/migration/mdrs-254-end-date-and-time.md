# MDRS-254: end dates take a date and a time, and the screen compares the instant the server compares

Built on `taha/mdrs-136-open-scopes-with-their-admins` (tip `377d4b6e`). No server change, no migration, no
route or DTO change: the OpenAPI spec and the route inventory are untouched
(`node tools/ci/assert-openapi-spec-fresh.mjs`: "169 paths, identical to what the exporter writes today").

## The bug

An end of a role or a permission is a `timestamptz` and the API compares instants
(`checkGrantExpiry`, `apps/tedrisat/src/assignment/admin/grant-plan.ts`: `expiresAt <= now` is "past",
`expiresAt > assignmentExpiresAt` is "after the appointment"). The nizam dialogs asked for a calendar day
(`<input type="date">`), turned it into the last second of that day in the screen's zone (`endOfDayIso`) and
checked it by calendar day (`endError`). An appointment that ends at `2026-12-31T20:59:59Z` (the end of a Turkish
day) opened west of Turkey prefilled "2026-12-31", sent the last second of that day in the viewer's zone, and the
server answered 400 `GRANT_EXPIRY_INVALID` without the screen having warned. Measured on the code at the base,
with the appointment ending at `2026-12-31T20:59:59.000Z` and nothing touched:

| Zone | Prefill | Sent | Screen said | Server says |
| --- | --- | --- | --- | --- |
| Europe/Berlin (UTC+1) | 2026-12-31 | 2026-12-31T22:59:59Z | nothing | after-assignment (400) |
| Europe/Athens (UTC+2) | 2026-12-31 | 2026-12-31T21:59:59Z | nothing | after-assignment (400) |
| Europe/Istanbul (UTC+3) | 2026-12-31 | 2026-12-31T20:59:59Z | nothing | ok |
| America/Los_Angeles (UTC-8) | 2026-12-31 | 2027-01-01T07:59:59Z | nothing | after-assignment (400) |

(A throwaway spec ran the base's `dayInputValue`, `endOfDayIso` and `endError`; it was deleted afterwards.)

## What changed

One shared pure module, `libs/utils/src/end-instant.ts` (exported from `@medaris/utils`, which nizam and nazir
already depend on; no new package, so no Dockerfile `COPY` line):

- `zonedLocalToIso(value, zone)`: the instant a `YYYY-MM-DDTHH:mm` (seconds allowed) means on a clock in `zone`,
  as an ISO string; null for anything that is not a real date and time.
- `isoToZonedLocal(iso, zone)`: the value the picker shows; "" for a missing or invalid instant.
- `endProblem({ instant, now, assignmentEnd })`: "past" when `instant <= now`, "afterAssignment" when
  `instant > assignmentEnd`; the server's operators, nothing by calendar day.
- `resolveEnd({ value, held, timeZone, now, assignmentEnd, unfinished })`: what a form does with its field. "" is no
  end, unless `unfinished` says the field is half typed (below), which is the problem "unfinished"; a value equal to
  the prefill of the stored end goes back as the stored instant, untouched; anything else is read in the zone and
  checked with `endProblem`. A non-empty value that is no moment is "past" (a `datetime-local` field never produces
  one; failing closed keeps garbage from becoming "no end").
- `isUnfinishedEnd(field)`: true when the field's value is "" and its `validity.badInput` is set. A `datetime-local`
  input keeps "" until every segment is filled, so a date typed without its time looks like a cleared field to the
  value alone; the browser tells them apart only through `badInput`.

### A half-typed end

Found by review after the first cut: a person who types or picks a date and not the time left the value at "", which
`resolveEnd` read as "no end", and Kaydet stayed on. The server then stored the appointment's end (grants and the
nazır editor) or no end at all (köşk nazımı, head and inactive-scope dialogs): more access, for longer, than the
date they began to type implied. The old `type="date"` field had the same hole; `datetime-local` has more segments
to leave half filled. Now each of the six forms reads `validity.badInput` in three places: on change (the
valid-to-partial case, when a segment is cleared), on blur (so Kaydet goes off before the click lands) and on
submit (an empty field that was never left sends no event at all, and Enter submits without a blur). A half-typed
field shows "Bitiş tarihini ve saatini tamamlayın." under the field; nizam's Kaydet is off, nazır's refuses on
Kaydet like its other problems. Typing the missing part, or emptying the field completely, lifts it: an end that is
empty on purpose still means no end.

It builds on `timeZoneOffsetMinutes` and `toZonedDatetimeLocal` already in `libs/utils/src/time-zone.ts`. It does not
reuse `fromZonedDatetimeLocal` because that one resolves a repeated wall time to its second occurrence (MDRS-110's
measured choice for session times) and this issue's policy is the first.

### Daylight-saving policy

- A wall time the change skips (Berlin, 02:30 on 29 March 2026) moves forward by the gap, to 03:30.
- A wall time the change repeats (Berlin, 02:30 on 25 October 2026) is its first occurrence, 00:30Z, still in summer
  time. Both occurrences read back as the same wall time, so a stored second occurrence prefills as it was and is
  sent untouched.

### The fields (every end of a role or a grant in nizam and nazir)

Found by grepping `type="date"` together with `expiresAt|endsAt|endDay|endOfDayIso|dayInputValue|endError`, then
every component that sends one of those to the API. Each became `<input type="datetime-local">` through the design
system's `Input`, minute precision, prefilled in `useTimeZone()` (the zone `formatMoment` uses).

| App | Dialog | File | Stored end it prefills | Appointment limit |
| --- | --- | --- | --- | --- |
| nizam | İzinleri düzenle / Medaris nazımı ata | `features/permissions/components/permissions-dialog.tsx` | `nazim.expiresAt` | `nazim.assignmentExpiresAt` |
| nizam | Ders nazırı ata / İzinleri düzenle (köşk) | `features/grants/components/grant-dialog.tsx` | `grant.endsAt` | none |
| nizam | Başmüderris ata / değiştir | `features/madrasahs/components/assign-head-dialog.tsx` | none (new) | none |
| nizam | Pasif kapsamlar: ata | `features/inactive-scopes/components/assign-scope-dialog.tsx` | none (new) | none |
| nizam | Köşk nazımı ekle | `features/kosks/components/add-nazim-dialog.tsx` | none (new) | none |
| nazir | İzinleri düzenle (medrese nazırı) | `features/nazirs/components/permission-editor.tsx`, `permissions.ts` | `held.expiresAt` | `nazir.assignmentEnd` |

Not ends of a role or a grant, so left as they are: course session dates and curriculum dates
(`sessions-view`, `session-plan-form`, `curriculum-editor`, `course-create-form`) and the audit log's date filters
(`audit-view`). `nazir` has no other date field.

Removed because nothing uses them any more: `endOfDayIso`, `endError`, `EndError`, `dayInputValue` and the private
`zoneOffset` in nizam's `permissions/present.ts`; `isoDay`, `isPastDay`, `endsAtOf` and `zoneOffsetMs` in
`kosks/admin-present.ts`; `dayOf`, `endOfDay` in nazir's `permissions.ts`. `dayIn` stays: `daysLeft` (the Bitiş
column's "N gün kaldı") still counts display days with it; that is a label, not a validation.

Copy (tr, en, ar, same keys): the labels say "ve saati", the errors say the true rule ("Bitiş zamanı şu andan sonra
olmalı." since an end at or before now is refused, "Bitiş zamanı atamanın bitişinden ({moment}) sonra olamaz." with
the appointment's end printed with its time). `endHelpAssignment` and `endAfterAssignment` take `{moment}` instead of
`{date}`. Nazım stays in nizam's sentences and nazır in nazir's.

## Behaviour changes the owner will notice

1. Every end field asks for a date and a time. The old date-only fields meant "the last second of that day"; a person
   who wants that types 23:59.
2. An end is refused when it is not after now to the minute, not only when its day is not after today: a moment
   earlier today is now refused (the old screens either allowed or refused the whole of today, and they disagreed
   with each other: `isPastDay` allowed today, `endError` refused it).
3. An untouched prefilled end saves in every zone (the bug), and is sent back as the stored instant, seconds
   included, so opening and saving never moves an end by up to 59 seconds.
4. The nazır editor lost its tolerance for the appointment's own last day ("the permission ends with it"): an end
   after the appointment's end is refused, an end at or before it is sent as typed. Leaving the field as it was is
   unchanged.
5. The köşk nazımı dialog lost the `min` attribute of the date input: `min` on a form field would make the browser
   refuse before the screen's own sentence.
6. The input `name` attributes changed (`endDay` to `end`, `expiresOn` to `expiresAt`); nothing reads them but the
   Playwright specs, which use the labels.
7. A date typed without its time is no longer saved as "no end": the form says to complete it and does not send
   (the old date field saved it as no end).

## Decided by default, owner may overrule

- **The picker has minute precision**, with no seconds step. Default: the issue says datetime picker and the server
  stores instants; seconds on a screen would not be understood. The untouched case keeps the stored seconds.
- **A repeated wall time is its first occurrence, a skipped one moves forward** (above). Default: the owner gave no
  rule; this is the rule the planner's cut set.
- **A non-empty value that is no moment is "past"** rather than "no end".
- **A half-typed picker is refused, not read as "no end"** (above). Default: saving it would grant longer than the
  date the person began to type; clearing the field entirely is still how to say "no end". The sentence is new copy
  (tr, en, ar) under `endUnfinished` in the five nizam dialogs' namespaces and `Editor.expiresProblems.unfinished`
  in nazir.
- **The Playwright specs pin the browser to `Europe/Istanbul`** (`test.use({ timezoneId })`) rather than computing the
  expectations per run. Default: the specs' literals ("2026-12-31T23:59", "15 Aralık 2026") were already written for
  Istanbul; the screen's zone is the account's profile zone, else the browser's, so pinning the browser makes the
  fallback deterministic. The unit and component tests cover the other zones.

## Tests, with red then green

Commands run from the project directory with `./node_modules/.bin/vitest run`.

| Criterion | Test | Fails without the change |
| --- | --- | --- |
| Conversion and comparison across zones (UTC-8, UTC+1, UTC+3, UTC+9) and daylight saving | `libs/utils/test/end-instant.spec.ts` (48 tests): "zonedLocalToIso and isoToZonedLocal", "daylight saving (Europe/Berlin)", "endProblem" | Mutations of the module, each run and restored: `<=` to `<` in "past" fails "is past when the instant is not after now"; `>` to `>=` fails "is after the assignment only when it is later than its end" and the five untouched-prefill cases; dropping the untouched shortcut fails the five untouched-prefill cases; first occurrence to last fails the autumn tests (2); forward to backward fails the spring tests (2) |
| Untouched prefill saves in any zone (appointment ending `2026-12-31T20:59:59Z`, UTC+1, UTC+2, UTC+3, UTC-8; UTC+9 in the unit spec) | unit: `resolveEnd, the failing case of MDRS-254` "the untouched prefill saves and goes back as the stored instant" (5 zones); component: `apps/nizam/test/end-datetime.spec.tsx` "Medaris nazımı: İzinleri düzenle" "shows the stored end in a date-and-time picker and saves it untouched" (4 zones) and the same for "Ders nazırı"; nazir: `apps/nazir/test/permissions.spec.ts` "saves an untouched end that ends the appointment's own Turkish day in %s" (4 zones) and `permission-editor.spec.tsx` "sends an end left as it was back as the instant the API holds, seconds and all" | nizam: the base dialog put back, 10 of 19 tests in `end-datetime.spec.tsx` failed for the permissions dialog and 5 for the grant dialog (the old `type="date"` field and a missing helper). The base code's wrong answer itself is the table above. The nazir untouched-prefill cases are a regression guard: the base nazir code already kept an untouched day (it failed elsewhere, see next rows), so those 4 cases pass on the base too |
| A moment after the appointment's end, or not after now, is refused on the screen before sending | unit: "one minute after the end is refused before sending" (5 zones), "a past moment is refused" (5 zones), "refuses a moment of today that has gone"; component: "refuses the minute after the appointment's end, before sending" (4 zones, asserts the sentence, a disabled Kaydet and that `setNazimGrants` was not called), "refuses a moment that is not after now, accepts a minute later, and sends the typed instant"; one such test per other dialog; nazir: "cannot be in the past or now, as the server counts", "cannot be after the appointment ends, to the minute", "refuses a moment a minute after the appointment ends, before sending" | nizam: each dialog's base file put back, `permissions-dialog` 10 failed, `grant-dialog` 5, `assign-head-dialog` 2, `assign-scope-dialog` 1, `add-nazim-dialog` 1 (of 19 each run). nazir: base `permissions.ts` and `permission-editor.tsx` put back, 11 of 49 tests failed across `permissions.spec.ts` and `permission-editor.spec.tsx` |
| The dialogs show a date-and-time picker | every component test asserts `input[type=datetime-local]` and that the field is not the old date input; nazir `permission-editor.spec.tsx` "asks for a date and a time ..." | same runs |
| The payload carries the right instant | component tests read the arguments of the mocked actions: `setNazimGrants` `expiresAt`, `updateGrant` `endsAt`, `setHeadMuderris` `endsAt`, `assignScope`'s fourth argument, `addKoskNazims`'s third argument, `saveNazirPermissions` `expiresAt` | same runs |
| A half-typed end is refused, not saved as no end | unit: `an end left half typed` (`end-instant.spec.ts`, 9 cases: the flag makes "" "unfinished", a complete value is not hidden by it, `isUnfinishedEnd` on six shapes); nizam `end-datetime.spec.tsx` `an end left half typed: <dialog>` x 5 dialogs, 4 cases each (refused on leaving the field with Kaydet off, refused on sending without ever leaving it, allowed again once the time is typed, an empty field on purpose still sends no end); nazir `permission-editor.spec.tsx` `an end left half typed` (4 cases) and `permissions.spec.ts` "is refused while the field is half typed" | Tests written first, run on the code before the fix: utils 7 of 48 failed (the "unfinished" answer and the six `isUnfinishedEnd` shapes); nizam 10 of 39 failed (the two refusals in each of the 5 dialogs; the two "allowed" cases pass on the old code on purpose, they guard the other direction); nazir 3 failed (the unit case and the two refusals in the editor). Mutations after the fix, each restored: dropping the submit-time read in the grant dialog fails "is refused on sending, even when the field was never left"; dropping its `onBlur` fails "is refused when the field is left, and Kaydet is off" |
| The Playwright specs that fill the old date field use the new one | edited, not run | not run |

The green runs, after the last change: `libs/utils` 4 files / 96 tests, `apps/nizam` 41 files / 712 tests,
`apps/nazir` 37 files / 705 tests; `tsc -b` in `apps/nizam`, `apps/nazir` and `libs/utils` printed no errors; `biome check` on
the touched trees reports no errors and `node tools/ci/biome-ratchet.mjs` shows warnings 70 (baseline 70), infos 21
(baseline 21); `eslint` on the touched folders is silent (module boundaries hold).

## Playwright specs

Edited to the new field and value format, **not run** (they need the running stack, a seeded database and real
Keycloak sign-ins): `apps/nizam/e2e/{permissions,grants,head-change,inactive,kosks}.e2e.ts` and
`apps/nazir/e2e/permissions.e2e.ts`. Each fills `YYYY-MM-DDTHH:mm`, uses the new labels and sentences, and pins the
browser zone with `test.use({ timezoneId: "Europe/Istanbul" })`.

The note named `permissions.e2e.ts:330` as failing outside `Europe/Istanbul`. At this base the assertions that
hard-code the Istanbul day of the seeded end `2026-12-31T20:59:59Z` are nizam's `permissions.e2e.ts`
(`toHaveValue("2026-12-31")`), `grants.e2e.ts` (the same literal) and nazir's `permissions.e2e.ts` (a day formatted
in Istanbul); I did not find an assertion at line 330 of either file and did not run any of them, so which one the
note meant is not established. What is established by reading: the screen shows a stored instant in the zone
`syncViewerTimeZone` picks (the account's profile zone, else the browser's), the old prefill was the calendar day of
the instant in that zone, and `2026-12-31T20:59:59Z` is 2026-12-31 only up to UTC+3; from UTC+4 eastward the day is
2027-01-01, so a browser outside the Istanbul offset failed those literals. The new expectations are the minute in
Istanbul (`2026-12-31T23:59`; nazir's spec computes it from the seeded instant) and the browser is pinned to
Istanbul, so the literal and the screen's zone agree on any machine. The screen's own behaviour in the other zones
is what the component tests pin; a pinned browser does not prove it.

## Not verified

- The Playwright specs (above).
- The browser's own `datetime-local` widget: happy-dom takes a typed value as a string, so the tests prove what the
  screen does with a value, not how Chrome, Firefox or Safari draw or validate the control, nor how a keyboard
  fills it in. In particular the half-typed fix reads `validity.badInput`, which happy-dom does not model: the specs
  set it on the field by hand, so they prove what the screen does when the browser reports it, not that Chrome,
  Firefox and Safari report it the way the code expects (the HTML standard says `badInput` is set when the user
  agent cannot convert what the person entered into a value) nor when each fires `input` or `blur`. The submit-time
  read exists because of that doubt.
- Zones in which the offset has a seconds part or two changes fall within a day of each other; `zonedLocalToIso`
  samples the offset a day either side of the wall time.
- A real server round trip with the changed payload: the server is unchanged and reads the same ISO strings as
  before, but no tedrisat spec was run (nothing in `apps/tedrisat` changed).
