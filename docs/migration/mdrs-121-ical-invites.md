# MDRS-121 — Lesson invitations by e-mail (iCalendar REQUEST / CANCEL)

Stacked on MDRS-119 (`release/stack-mdrs-119-signed-playback`), which is
stacked on MDRS-116 (`release/stack-mdrs-116-bunny-api`, PR #209): the third
layer of that stack. Nothing here depends on the Bunny work; the stack is the
order the issues were taken in.

The users table MDRS-104 asked for exists on `main`
(`apps/tedrisat/src/database/schema/user.schema.ts`, migration 0016), so the
addresses come from there.

## What was done

### tedrisat

- **Mail module** (`src/mail/`). nodemailer 10.0.13 (catalog entry
  `nodemailer: ^10.0.13`, which ships its own types), one pooled SMTP
  connection, 10 s connect / 30 s socket timeouts. `MailService.send` skips
  and returns false when no sender is configured; a configured send that
  fails throws. Neither the password, a message body nor a recipient address
  is logged.
- **Configuration** (`src/config/smtp-env.ts`), `TEDRISAT__SMTP_*` in the root
  `.env` — the realm sender's names from MDRS-98 without the `KC_`:
  `SMTP_HOST`, `SMTP_SECURITY` (`starttls` default, `ssl`, `none`),
  `SMTP_PORT` (465 with ssl, else 587), `SMTP_FROM` (bare address; also the
  invitation's ORGANIZER), `SMTP_FROM_DISPLAY_NAME` (default `Medaris`),
  `SMTP_USER` + `SMTP_PASSWORD` (together or not at all; an IP-allow-listed
  relay takes neither; never with `none`). **Unset `SMTP_HOST`: the API boots
  and e-mails nothing.** Set but inconsistent: the boot stops, as Bunny's does.
  Placeholders added to `.env.example` (commented) and passed through in
  `docker-compose.yml`. Invitations also need `TEDRISAT__TEDRIS_WEB_URL`; with
  SMTP set and that unset, a warning is logged and nothing is sent.
- **The invitation** (`src/lesson-invitation/invitation-ics.ts`): an iTIP
  message, `METHOD:REQUEST` to invite or update, `METHOD:CANCEL` +
  `STATUS:CANCELLED` to withdraw. One UID per session,
  `lesson-invite-<lessonId>@medaris.app`, and a SEQUENCE counted per
  recipient (0, then +1 per message). UTC times, ORGANIZER = `SMTP_FROM`,
  ATTENDEE = the talebe with `RSVP=FALSE`. SUMMARY / DESCRIPTION / URL are the
  "Takvime ekle" file's (MDRS-117): course — session, and "the meeting link is
  on the session page". **The meeting link is in neither the mail nor the
  event**: the sweep never reads `lessons.meeting_url`.
  - The UID is deliberately *not* the file's `lesson-<id>@medaris.app`: the
    file and the feed use the course version as SEQUENCE, and a calendar that
    imported the file at SEQUENCE 7 would drop an invitation at SEQUENCE 0.
- **The mail** (`invitation-mail.ts`): subject, plain text and HTML in tr, en
  and ar (Arabic `dir="rtl"`), per kind (new / update / cancel). The time is
  written in the talebe's own zone, else the course's, with the offset named;
  the language is the talebe's `locale`, else Turkish. The footer links Hesap,
  where invitations are turned off. Titles are HTML-escaped; the subject is
  kept on one line.
- **State** (migration `0048_lesson_invitations`, rollback in
  `rollbacks/0048_lesson_invitations.down.sql`):
  - `lesson_invitations` (PK lesson_id + user_id; FK to lessons RESTRICT):
    the SEQUENCE and what the last message said (start, length, both titles),
    `cancelled_at` once a CANCEL went out. `course/course-purge.ts` and the
    archive hard-deletes of a week or a session remove these rows first.
  - `users.lesson_invitation_emails boolean not null default true`.
- **The sweep** (`LessonInvitationService` + `LessonInvitationRepository`).
  It reconciles instead of reacting event by event: one SQL rule decides
  whether a (session, talebe) pair should be in the calendar —
  session ahead, timed, not cancelled, session and week not hidden; course
  PUBLISHED, not hidden, köşk not hidden, not passive (neither
  `passive_since` nor "had a müderris post and none is held now", the
  Pasif kapsamlar rule, so a post that simply lapses counts); seat ENROLLED;
  no open ban on the course, köşk or medrese. Each round:
  - **CANCEL** every standing invitation for a time not yet come whose pair
    no longer passes (cancelled, moved into the past, hidden, passive,
    removed / left / completed seat, banned);
  - **REQUEST** every pair that passes and whose last message is missing,
    was a CANCEL, or differs in start, length or a title. A *first*
    invitation waits until the session is within **30 days**; an update to
    one already sent goes out whenever it is due.
  - Only to a **verified** address, with invitations not turned off, that is
    one bare address (an address list or a `:`/`;` would add recipients or
    break ATTENDEE). **Opting out stops everything**, cancellations included.
  - Write-then-send: the row is claimed with a conditional write on its
    SEQUENCE (two instances never send the same message), then sent. A
    server that cannot take mail undoes the claim and stops the round (retried
    next round); a 5xx recipient refusal (`EENVELOPE`) keeps the claim, so a
    dead address is not retried every five minutes.
  - Triggers: `CourseService` kicks a round after every write that can change
    what is owed — approve, enroll, set status, remove, leave, lesson
    create / update / cancel / hide, session batch, whole-course save, course
    update / hide / restore, müderris list. A timer runs a round every
    5 minutes for what no write announces (a post lapsing, a session entering
    the horizon, a ban, medrese-side changes) and for retries. Batches of 100
    per query; a full batch goes round again, at most 20 rounds per kick.
  - Off without a sender or without `TEDRIS_WEB_URL`: no timer, no query.
- **Opt-out API**: `MeResponse.lessonInvitationEmails` (required boolean) and
  `UpdateMeDto.lessonInvitationEmails` (optional boolean; `null` is a 400,
  the column has no null). `libs/services` regenerated with
  `pnpm openapi:tedrisat` (3 files: `MeResponse.ts`, `UpdateMeDto.ts`,
  `swagger-docs/tedrisat.json`).

### tedris-web (B13, Hesap)

No design draws the switch. It sits in the existing calendar card under the
calendar-feed row, built like the public-profile switches: `Switch` from
`@medaris/ui/mds`, saved the moment it changes, rolled back with an error
toast when the save fails, success toast otherwise. Texts in
`libs/i18n/src/locales/{tr,en,ar}/tedris-account.json`
(`invitationsLabel`, `invitationsHelp`, `invitationsOn`, `invitationsOff`,
`invitationsFailed`).

### landing-web

`test/privacy-notice.spec.ts` requires every `users` column to be listed in
the privacy notice draft, so `lesson_invitation_emails` is listed; a purpose
line and a recipient line ("E-posta gönderim hizmeti (Google Gmail)") were
added and `LAST_UPDATED` moved to 4 Ekim 2026. The notice is still a draft
(`IS_DRAFT = true`); the wording is the owner's to approve.

## What was verified

All five gates green on this branch, run with `env -u NODE_ENV`:

| Gate | Result |
| -- | -- |
| typecheck | 17 projects + 2 dependent tasks, green |
| test | 12 projects + 2 dependent tasks, green; tedrisat 2038 tests in 139 files, 0 failures (junit) |
| build | 8 projects + 7 dependent tasks, green |
| lint | 17 projects, green |
| module-boundaries | 17 projects, green |

New specs (SMTP stubbed throughout — the tedrisat suite may not reach the
network):

- `test/e2e/lesson-invitations.e2e.spec.ts` (13 tests, real routes, real
  Postgres, stub transport through `MAIL_CONFIG` / `MAIL_TRANSPORT`):
  approval invites only the upcoming session within the horizon, only to the
  approved verified talebe, with no meeting link anywhere in the message;
  a move sends SEQUENCE 1 with the same UID and nothing more on a quiet round;
  a cancellation sends CANCEL; removal, a lapsed müderris post (passive) and
  hiding the course cancel; a passive course invites nobody new; opting out
  (GET/PATCH `/me`) stops updates and cancellations, and before approval
  stops the invitation; `null` is refused; a failed send is retried next
  round with the same SEQUENCE; a 5xx refusal and an address list are not
  retried.
- Unit: `invitation-ics.spec.ts` (7), `invitation-mail.spec.ts` (6),
  `smtp-env.spec.ts` (13), `mail-service.spec.ts` (6 — including the real
  MIME from nodemailer's stream transport: `multipart/alternative` with a
  `text/calendar; charset=utf-8; method=REQUEST` part).
- tedris-web `test/account-profile.spec.ts`: 3 new tests for the switch.
- `drizzle-kit generate` after the migration: "No schema changes".
- `node tools/ci/assert-openapi-spec-fresh.mjs`: 169 paths, identical.

## What was not verified

- **How Gmail and Apple Mail show the messages** — that the REQUEST is
  rendered as an invitation with "add to calendar", that the update moves the
  existing event and that the CANCEL removes it, in both clients. No real
  SMTP server or mailbox was used. This is the issue's acceptance criteria
  1 and 2 and needs a manual check with the real relay.
- A REQUEST after a CANCEL for the same UID (a session cancelled, then
  un-cancelled; a seat removed, then approved back) — RFC 5546 allows it with a
  higher SEQUENCE; whether both clients restore the event was not checked.
- The Gmail relay's own behaviour: its sending limits, whether it needs AUTH
  or an IP allow-list for the production host, and the sender domain's
  SPF/DKIM. None of it is in this repository.
- Whether the production realm verifies e-mail addresses. Invitations go only
  to `email_verified` addresses; a realm that does not verify sends nobody
  anything.
- The tedris-web switch in a browser (only the component spec ran).
- CI did not run: GitHub Actions is locked by a billing issue on amel-tech;
  the gates above are local.

## Follow-ups

- Manual check in Gmail and Apple Mail (above) once `TEDRISAT__SMTP_*` is set
  on an environment.
- Deploying with SMTP set sends, on the first round, invitations for every
  session within 30 days to every enrolled, verified, opted-in talebe —
  including enrolments that predate this change. Expected, but worth knowing
  before the first deploy.
- An address change in Keycloak sends later messages to the new address; the
  old mailbox's calendar keeps its event.
- Ban, medrese-side course writes and role revocations do not kick a round;
  the 5-minute timer catches them. A kick from those services would make
  them immediate.
- The privacy notice wording (purpose and the Gmail recipient line) needs the
  owner's legal review.
