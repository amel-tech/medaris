# MDRS-119 — Signed Bunny playback and pasted-link detection (tedrisat)

Follows MDRS-116 (PR #209, merged, ported to the permission catalogue of
MDRS-135). The recording table, the read endpoints, the recordings filter
(`visibleRecordings`) and the Bunny client already exist on main; this
change covers what MDRS-119 still lacked on the read side, plus the pure link
detector the write endpoints use. The write endpoints are MDRS-247's (#202);
how they store a link is in `mdrs-247-recordings.md`.

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
- **The encoding poll treats Bunny status 8 (JitPlaylistsCreated) as READY**, as Bunny's schema calls it playable
  (status 7, JitSegmenting, still waits); the dev library has no just-in-time encoding and goes 2, 3, 4.
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
  - Bunny: `player.`/`iframe.mediadelivery.net` or `video.bunnycdn.com`,
    `/embed/<lib>/<vid>` or `/play/<lib>/<vid>`. Accepted only for our own
    library id; only the video id is returned (never the URL or a foreign
    token). Any Bunny link while no library is configured is refused. Any
    other host on a Bunny domain (`*.mediadelivery.net`, `*.bunnycdn.com`,
    `*.b-cdn.net`) is refused (`bunny-no-video`), never kept as OTHER, and a
    trailing dot on the host (`player.mediadelivery.net.`) is ignored, so a
    foreign library's link cannot slip through as a pasted OTHER link.
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
- `detectRecordingLink` was not called by any endpoint in this change. The
  write endpoints of MDRS-247 (#202) call it now: `POST /lessons/:id/recordings`
  and `PATCH /recordings/:id` store what it reads, a pasted Bunny link as a
  READY BUNNY row with its upload lifetime closed at the write
  (`docs/migration/mdrs-247-recordings.md`).
- There is no `youtube_video_id` column; `youtubeVideoId` is returned to the
  caller and not stored.

## Verified

All gates ran in this worktree, and again after the second-round fix with
the same output, as
`env -u NODE_ENV pnpm nx run-many -t <target> --skip-nx-cache`:

- typecheck: `Successfully ran target typecheck for 17 projects and 2 tasks they depend on`.
- lint: `Successfully ran target lint for 17 projects`.
- module-boundaries: `Successfully ran target module-boundaries for 17 projects`.
- build: `Successfully ran target build for 8 projects and 7 tasks they depend on`.
- test: `Successfully ran target test for 12 projects and 2 tasks they depend on`
  (Docker running; tedrisat's e2e suites against Testcontainers Postgres).
  After the trailing-dot fix (second round) a run with
  `--output-style=stream` printed tedrisat
  `Test Files 134 passed (134)`, `Tests 1993 passed (1993)` (1980 before the
  13 new detector cases), and every other
  suite green (nazir-web 654, nizam-web 638, tedris-web 631,
  keycloak-theme 519, ui 126, common 92, env 57, utils 48, teskilat 30,
  tokens 29, landing-web 26 tests).
- Unit, `test/unit/course/recording-link.spec.ts`: every YouTube form, every
  Bunny form, a foreign library (including ids that only share a prefix or
  suffix with ours), no library configured, look-alike hosts, trailing-dot
  hosts (own library accepted, foreign library refused), non-player Bunny and
  CDN hosts refused, http, credentials, length limit.
- Unit, `test/unit/bunny-stream/`: the token against a vector computed
  independently with `sha256sum`, the configurable lifetime, the env bounds.
- e2e, `test/e2e/recording-playback.e2e.spec.ts`: an enrolled talebe and the
  müderris get a signed link with a future `expires` for every READY Bunny
  recording, `Cache-Control: private, no-store`, a fresh expiry on every read,
  no video id for a PROCESSING upload; a stranger, a banned talebe and a
  signed-out visitor get no ENROLLED recording's video id or link; the session
  read signs the same way; `GET /courses/:id` carries no recording data for any
  of six callers; Bunny's API is never called (stubbed transport).

## Measured on a real dev library (5 October)

A throwaway script (not in the repo) created a video in the dev library, uploaded a 3-second webm by TUS, polled it,
asked for the embed page and the CDN files in several ways, and deleted the video. No library key is in any file
of the repository. Results:

| Request | Answer |
| --- | --- |
| TUS create with the hex `SHA256(library_id + api_key + expire + video_id)` | 201, then HEAD 200 and PATCH 204; a wrong signature is 401 |
| encoding statuses | 2, 3, 4 within about 10 seconds (no just-in-time encoding on this library) |
| embed page, unsigned | 403 |
| embed page, signed and in date | 200 |
| embed page, `expires` in the past, a wrong token, another video's token | 403 each |
| playlist, a segment, `play_240p.mp4`, thumbnail, fetched with no `Referer` | 403 |
| the same with **any** `Referer` value, including `https://evil.example/`, and with no token | 200 |

So the embed token protects the player page, and only the page. The stream behind it is protected by "a Referer
header must be present", which any client can send. A viewer who has seen a video once has its id (it is in the
player link) and can keep fetching the playlist, the segments and the MP4 fallback after the link has expired,
whatever tedrisat decides later. That is what Bunny's separate **CDN Token Authentication** is for (its security page
says the embed token protects the iframe and that direct URLs, "MP4 fallbacks, HLS playlists and segments,
thumbnails and previews", need the CDN token layer).

## Owner-side setup the PR cannot do

1. Library, Security: **Embed View Token Authentication** on, its key as `TEDRISAT__BUNNY_STREAM_TOKEN_KEY`.
2. Library, Security: **CDN Token Authentication** on, and the **MP4 fallback** off.
3. Re-run the same check after the owner flips them: the direct files must answer 403 without a token, and the embed
   page must still play in a browser with the signed link (Bunny's own player is expected to sign the files it asks
   for, not tested). Until then a saved video address plays without tedrisat's say.

## Not verified

- That Bunny's player still plays with CDN token authentication on (step 3 above), and whether a video already
  playing stops at `expires`.
- The default of 6 hours was kept from MDRS-116.

## Follow-ups

- Owner-side: see "Owner-side setup the PR cannot do" above. Without the embed token key a Bunny link is unsigned
  and plays for anyone holding it.
