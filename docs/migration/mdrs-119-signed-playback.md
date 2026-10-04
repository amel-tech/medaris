# MDRS-119 — Signed Bunny playback and pasted-link detection (tedrisat)

Stacked on MDRS-116 (`release/stack-mdrs-116-bunny-api`, PR #209). The
recording table, the read endpoints, the `ACCESS_RECORDING` filter
(`visibleRecordings`) and the Bunny client already exist on that base; this
change covers what MDRS-119 still lacked on the read side, plus the pure link
detector the write endpoints need. The write endpoints themselves are in
Taha's open PR #202 and are not rewritten here.

## What was done

- **Sign only what the caller may see.** `CourseService.playable` used to build
  a Bunny player link for every stored recording *before* the access filter
  ran, so a link was minted (then dropped) even for a recording the caller
  could not see. It is split into `withoutVideoIds` (strip the video id, keep
  it aside by recording id) and `signPlayback` (sign only the rows
  `visibleRecordings` kept). Both read paths use it:
  `GET /courses/:id/recordings` and the session's own recording on
  `GET /courses/:courseId/sessions/:sessionId`. Both already answered
  `Cache-Control: private, no-store`; the e2e suite now asserts it.
- **Player link form.** `embedUrl` builds
  `https://player.mediadelivery.net/embed/<libraryId>/<videoId>?token=<t>&expires=<unix>`
  with `t = SHA256_HEX(token_key + video_id + expires)`. MDRS-116 used the
  `iframe.mediadelivery.net` host; the issue names `player.mediadelivery.net`.
- **Configurable expiry.** `TEDRISAT__BUNNY_STREAM_EMBED_TTL_SECONDS`
  (`BUNNY_STREAM_EMBED_TTL_SECONDS` inside the app): 21600 s (6 h) when unset,
  a whole number from 60 to 604800 otherwise; anything else stops the boot.
  Added to `.env.example` (commented) and `docker-compose.yml`.
- **`detectRecordingLink(url, ownLibraryId)`** (`src/course/domain/recording-link.ts`),
  pure, throwing `RecordingLinkInvalidError` (400 `RECORDING_LINK_INVALID`,
  with a `reason`):
  - YouTube: `watch?v=`, `youtu.be/`, `/live/`, `/shorts/`, `/embed/`, on
    `youtube.com`, `youtube-nocookie.com`, `youtu.be` and their subdomains.
    Returns the canonical watch link and the video id. A YouTube page naming
    no video is refused. **No visibility rule**: the owner dropped "YouTube is
    PUBLIC only" on 3 October, and main never had it.
  - Bunny: `player.`/`iframe.mediadelivery.net`, `/embed/<lib>/<vid>` or
    `/play/<lib>/<vid>`. Accepted only for our own library id; only the video
    id is returned (never the URL or a foreign token). Any Bunny link while no
    library is configured is refused.
  - Google Drive/Docs: DRIVE. Any other https link: OTHER, as pasted.
  - Not https, credentials in the URL, empty, or over 500 characters: refused.
- `BunnyStreamClient.libraryId` exposes the configured library id (or null) so
  a write endpoint can pass it to the detector.
- OpenAPI descriptions updated (what a signed link protects and what a pasted
  link does not); `libs/services` regenerated with `pnpm openapi:tedrisat`.

## Deviations from the task text

- There is no `GET /lessons/:lessonId/recordings` on this base. A lesson has
  at most one recording, and it is read through
  `GET /courses/:courseId/sessions/:sessionId`; that is the lesson read that is
  signed and tested. Adding a separate route was left out to avoid colliding
  with #202, which owns the `/lessons/:id/recordings` routes.
- `detectRecordingLink` is not called by any endpoint yet: the write endpoints
  live in #202. See "Follow-ups".
- There is no `youtube_video_id` column; `youtubeVideoId` is returned to the
  caller and not stored.

## Verified

All gates ran in this worktree as
`env -u NODE_ENV pnpm nx run-many -t <target> --skip-nx-cache`:

- typecheck: `Successfully ran target typecheck for 17 projects and 2 tasks they depend on`.
- lint: `Successfully ran target lint for 17 projects`.
- module-boundaries: `Successfully ran target module-boundaries for 17 projects`.
- build: `Successfully ran target build for 8 projects and 7 tasks they depend on`.
- test: `Successfully ran target test for 12 projects and 2 tasks they depend on`
  (Docker running; tedrisat's e2e suites against Testcontainers Postgres).
  A second run with `--output-style=stream` printed tedrisat
  `Test Files 134 passed (134)`, `Tests 1980 passed (1980)`, and every other
  suite green (nazir-web 654, nizam-web 638, tedris-web 631,
  keycloak-theme 519, ui 126, common 92, env 57, utils 48, teskilat 30,
  tokens 29, landing-web 26 tests).
- Unit, `test/unit/course/recording-link.spec.ts`: every YouTube form, every
  Bunny form, a foreign library (including ids that only share a prefix or
  suffix with ours), no library configured, look-alike hosts, http, credentials,
  length limit.
- Unit, `test/unit/bunny-stream/`: the token against a vector computed
  independently with `sha256sum`, the configurable lifetime, the env bounds.
- e2e, `test/e2e/recording-playback.e2e.spec.ts`: an enrolled talebe and the
  müderris get a signed link with a future `expires` for every READY Bunny
  recording, `Cache-Control: private, no-store`, a fresh expiry on every read,
  no video id for a PROCESSING upload; a stranger, a banned talebe and a
  signed-out visitor get no ENROLLED recording's video id or link; the session
  read signs the same way; `GET /courses/:id` carries no recording data for any
  of six callers; Bunny's API is never called (stubbed transport).

## Not verified

- **On the real Bunny library**: that an unsigned player URL answers 403 and
  that a signed one stops after `expires` (and whether a video already playing
  stops). No library or token key is available to this work; it is the
  issue's manual acceptance criterion and an owner-side step.
- The default of 6 hours was kept from MDRS-116; it was not tested against
  Bunny's behaviour on expiry.
- Remote CI did not run: GitHub Actions is locked by a billing issue on the
  organisation. The local gates above are the evidence.

## Follow-ups

- **#202 (MDRS-247)**: its write endpoints (`POST /lessons/:id/recordings`,
  `PATCH /recordings/:id`) should call
  `detectRecordingLink(url, bunny.libraryId)` instead of `providerOfUrl(url)`,
  and store `provider` plus `url` (or `bunny_video_id` for BUNNY). For a pasted
  Bunny link the row must also fill `upload_expires_at`
  (`lesson_recordings_provider_columns` CHECK) and be READY.
- **#202 still enforces "a YouTube recording is PUBLIC only"**
  (`RecordingYoutubePublicOnlyError`). That contradicts the owner's
  3 October decision and should be removed there.
- Owner-side: turn on embed token authentication on the library and set
  `TEDRISAT__BUNNY_STREAM_TOKEN_KEY`; without it a Bunny link is unsigned and
  plays for anyone holding it.
