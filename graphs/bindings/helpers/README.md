# Helpers for bindings

Node scripts (no dependencies) that a binding's `setup`, `teardown`, `events` and `effects` run as `run: [node, helpers/<x>.mjs, ...]`. The replay runs them with `graphs/bindings/` as the working directory, with no shell and no stdin, and an `expect` is a substring of what they print to stdout. Each one exits 0 and prints one short line (or JSON, for `api`, `sql`, `mail`) on success, and exits non-zero with one line on stderr on failure.

`ACCOUNT` is a role key of `graphs/.local/accounts.env` (`TALEBE_MALE`, `APPLICANT_A`) or the account name a binding gives (`talebeMale`, `applicantA`); `basmuderris` is `MEDRESE_BASMUDERRIS`. Nothing secret is ever printed or put on a command line. A person signs in with the real authorization-code flow and PKCE against `tedris-local`; the token is cached in `graphs/.local/tokens/` (git-ignored) and renewed on its own.

| Helper | What it does | Example `run:` line |
| -- | -- | -- |
| `api.mjs` | One call to tedrisat as an account; prints the JSON answer. A non-2xx answer fails the step; `--any` makes it print `HTTP <status> <body>` and exit 0 for a step that expects a refusal. Body is JSON or `@file`. | `[node, helpers/api.mjs, talebe, GET, '/courses/{course}']`, `expect: '"status":"PUBLISHED"'` |
| `sql.mjs` | SQL on tedrisat's database inside the stack's Postgres container, one JSON line per row (`{"rows":n}` for a write, `{"ok":true}` for DDL); several statements run in one transaction. For `effects` and for data no API can make. | `[node, helpers/sql.mjs, "select status from enrollments where course_id = '{course}'"]`, `expect: '"status":"PENDING"'` |
| `mail.mjs` | Mailpit: `search <query>` prints a JSON line per message (`--text` adds the body, `--wait <s>` waits for a mail and fails if none comes), `clear [query]` deletes. Mailpit's query syntax: `to:`, `from:`, `subject:`, words; no `OR`. | `[node, helpers/mail.mjs, search, 'to:{address} subject:Davet', --wait, '10']` |
| `apply.mjs` | `<ACCOUNT> <courseId>`: the account applies; the answer is the seat, `PENDING` (approval course) or `ENROLLED`. Applying twice changes nothing. | `[node, helpers/apply.mjs, applicantA, '{seed.courses.approval}']` |
| `leave.mjs` | `<ACCOUNT> <courseId>`: leaves, or takes the waiting application back; `none` (not a failure) when there is no row. A `REVOKED` row (the team removed the person) is refused with 409: clear it with `sql.mjs`. | `[node, helpers/leave.mjs, applicantA, '{seed.courses.approval}']` |
| `seat.mjs` | `<ACCOUNT> <courseId>`: prints `seat <ACCOUNT> <courseId> ENROLLED\|PENDING\|...\|none`, for an `effects` check. | `[node, helpers/seat.mjs, applicantA, '{course}']`, `expect: PENDING` |
| `seat-hoca.mjs` | `<courseId> <ACCOUNT>`: makes the account a müderris of the course beside the existing ones (the imam stays); `already` if it is one. Medrese course or köşk course, the right route is chosen. | `[node, helpers/seat-hoca.mjs, '{seed.courses.open}', basmuderris]` |
| `unseat-hoca.mjs` | `<courseId> <ACCOUNT>`: the way back; the last müderris cannot be taken out. | `[node, helpers/unseat-hoca.mjs, '{seed.courses.open}', basmuderris]` |
| `course-nazir-grants.mjs` | `--course <id> --nazir <ACCOUNT> --codes <code,code\|none\|seed> [--as <ACCOUNT>]`: sets the ders nazırı post's whole set of codes as the hoca (`MUDERRIS`) does, with `PATCH /courses/{id}/nazirs/{postId}`; appoints first if there is no post. `seed` is the seeded set. | `[node, helpers/course-nazir-grants.mjs, --course, '{seed.courses.open}', --nazir, dersNazir, --codes, none]` |
| `remove-kosk.mjs` | `<handle>`: deletes every köşk with that short name, as the başnazım; none is fine. | `[node, helpers/remove-kosk.mjs, '{handle}']` |
| `notify.mjs` | A notification for a person. tedrisat has no route that writes one, so: `<ACCOUNT> approved\|rejected --course <id>` (the course team answers the account's application: ENROLLMENT_APPROVED / ENROLLMENT_REJECTED), `<ACCOUNT> raw <TYPE> [--target-type T --target-id <uuid>] [--params <json>] [--read]` (a row written with SQL, any type), `<ACCOUNT> clear` (every notification of the account). | `[node, helpers/notify.mjs, applicantA, approved, --course, '{seed.courses.approval}']` |

`lib.mjs` and `db.mjs` are what the others share; they are not commands.

Things to know when a walk uses them:

- Applying or leaving a course with a seat makes tedrisat's invitation sweep mail the account the session invitations and cancellations (Mailpit). `mail.mjs clear 'to:<address>'` in `setup` or `teardown` gives the next walk a clean mailbox.
- `approved` leaves the account `ENROLLED`; end the walk with `leave.mjs`. `rejected` leaves no row. Both need a course that asks for approval (`seed.courses.approval`); on a course that takes anyone they refuse before they change anything.
- `APPLICANT_A` and `APPLICANT_B` start with no enrolment and no notification; give them back that way.
- The seed's `seed.json` carries ids and the texts to match by: `courses.*`, `kosk`, `kosk2`, `madrasah`, `sessions.open.{next,later,past}`, `decks.{own,course}`, `titles.*` and the question, note, homework and hand-in texts in `sessions.open.*`.
