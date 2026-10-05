# MDRS-116 — Bunny Stream upload API (part A, tedrisat only)

## What was done

- **Migration `0053_bunny_stream_recordings`**: `recording_provider` gains `BUNNY`, `recording_status` gains `FAILED`; `lesson_recordings` gains `bunny_video_id` (unique) and `upload_expires_at`. CHECK `lesson_recordings_provider_columns`: a BUNNY row has a video id and an upload expiry and no `url`; any other row has neither, and a `url` unless it is PROCESSING. The enum literals are compared as text because the migrator adds and uses them in one transaction. Rollback: `src/database/rollbacks/0053_bunny_stream_recordings.down.sql`.
- **`BunnyStreamClient`** (`src/bunny-stream/`): Create Video, Get Video, TUS signing, player link. Its config (`BUNNY_STREAM_CONFIG`) and transport (`BUNNY_STREAM_FETCH`) are separate providers so tests replace them. The API key never leaves tedrisat.
- **Pure functions** (`bunny-signature.ts`): `tusUploadSignature` = `SHA256_HEX(library_id + api_key + expiration + video_id)`, `uploadExpiry` (default 24 h, refuses < 3600 s), `embedViewToken`, `embedUrl`, `encodingOutcome`.
- **`POST /lessons/:id/recordings/uploads`**: creates the video in Bunny, inserts `provider=BUNNY, status=PROCESSING`, returns `recordingId, endpoint, libraryId, videoId, authorizationExpire, authorizationSignature`. 409 `RECORDING_EXISTS` when the session already has a recording, unless it is a FAILED Bunny upload (that row is reused). Audited as `recording.upload_start`.
- **`POST /lessons/:id/recordings/uploads/:videoId/signature`**: re-signs the same video with the original expiry (Bunny never extends an upload's lifetime). 409 `RECORDING_UPLOAD_CLOSED` once not PROCESSING or expired.
- **Authorization**: both routes `@Authz(PERMISSIONS.RECORDING_UPLOAD, byLessonCourse)` on the lesson's course: a missing lesson is 404, müderris and köşk nazımı hold the code by default, a ders nazırı by grant (the reviewed permission catalogue of MDRS-135 replaced the `SCOPES` matrix and `CourseAccessService` this PR was first written against). The service still answers 404 for a lesson the başnazım's bypass lets past the guard. The permission is checked before the 503, so a talebe gets 403 either way.
- **`RecordingEncodingPoller`**: every 60 s while the library is configured; Finished → READY (sets duration), Error/UploadFailed/404 → FAILED, Created past `upload_expires_at` → FAILED. It reads 50 rows per pass, least recently updated first, and bumps `updated_at` on every row it leaves waiting or could not read (`touchBunnyUpload`), so passes go round all waiting uploads instead of re-reading the oldest 50.
- **FAILED recordings are not listed** (`visibleRecordings`): a reader would otherwise see a failed upload as "Hazırlanıyor" for good. The müderris retries it through the upload route, which reuses the FAILED row.
- **An archived session is refused before Bunny is called** (`findOpenLessonCourseId` in `start`): 404 `LESSON_NOT_FOUND` with no empty video left in the library. Authorization still resolves the course with archived lessons included, so a talebe keeps getting 403.
- **Read path**: a READY BUNNY recording's `url` is Bunny's iframe player link, with an embed token (6 h) when `TOKEN_KEY` is set; the video id is never returned.
- **Env**: `TEDRISAT__BUNNY_STREAM_LIBRARY_ID`, `TEDRISAT__BUNNY_STREAM_API_KEY`, `TEDRISAT__BUNNY_STREAM_TOKEN_KEY` in the root `.env.example` (commented placeholders) and `docker-compose.yml`. Unset: boot succeeds, upload routes answer 503, nothing is polled. Only one of id/key set, or a non-numeric id, stops the boot.
- OpenAPI and `libs/services` regenerated (`pnpm openapi:tedrisat`).

## Deviations from the task text

- `status` already existed (`PROCESSING`, `READY`, MDRS-162); only `FAILED` was added, and existing rows keep their status instead of being forced to READY: a link row in PROCESSING with a null `url` is the documented "Hazırlanıyor" state. For the same reason the CHECK lets a non-BUNNY PROCESSING row have no `url`.
- The route parameter is `:id` (as every other `/lessons/:id` route and `byLessonCourse` read it); the URL is the same as `/lessons/:lessonId/recordings/uploads`.
- `apps/tedrisat/test/e2e/__snapshots__/authz-route-inventory.txt` does not exist on main, so there was nothing to update.

## Verified

Every count below is read off the command output named beside it, from the last run on this branch (after the review round). All commands ran as `env -u NODE_ENV pnpm nx run-many -t <target> --skip-nx-cache` unless stated.

- Unit, `test/unit/bunny-stream/` — 21 tests. Command: `npx vitest run test/unit/bunny-stream` in `apps/tedrisat`; output `bunny-stream-client.spec.ts (9 tests)` and `bunny-signature.spec.ts (12 tests)`. Signature vectors computed independently with `sha256sum`.
- e2e, `test/e2e/recording-upload.e2e.spec.ts` — 16 tests (same command on that file; output `recording-upload.e2e.spec.ts (16 tests)`): talebe 403 with no Bunny call, müderris 201 with the expected fields and signature, köşk nazımı 201, 409, 404 (missing and archived session, no Bunny call), 400, 503 without a library, re-sign, expired re-sign, poll to READY with a signed player link, poll to FAILED and the talebe no longer listed it, retry after FAILED, the poll going round waiting uploads, the CHECK constraint.
- typecheck: output `Successfully ran target typecheck for 17 projects`.
- test: output `Successfully ran target test for 12 projects`; 4753 tests, 0 failures, summed from the twelve `coverage/junit.xml` `<testsuites tests=… failures="0">` headers (tedrisat 1903).
- build: output `Successfully ran target build for 8 projects`.
- lint: output `Successfully ran target lint for 17 projects`.
- module-boundaries: output `Successfully ran target module-boundaries for 17 projects`.
- `node tools/ci/biome-ratchet.mjs`: output `no severity count exceeded its baseline` (infos 21, baseline 21). `node tools/ci/assert-openapi-spec-fresh.mjs`: output `169 paths, identical to what the exporter writes today`.

## Not verified

- Nothing was sent to a real Bunny library: no account/keys in this environment. Create Video's `guid`, the status codes (0 Created, 4 Finished, 5 Error, 6 UploadFailed), the TUS headers and the embed token formula are taken from Bunny's documentation, not measured.
- A 2 GB upload, resume after interruption and playback for an enrolled talebe (issue AC) need nazir-web and a live library.

## Follow-ups

- nazir-web "Bunny'ye yükle" tab with `tus-js-client` (excluded here).
- Delete orphaned Bunny videos: a FAILED video replaced by a retry, a video created when the row write then fails, and videos of a purged course (`course-purge.ts` deletes only the rows).
- A video Bunny keeps in an encoding state (1–3) is polled forever; there is no cut-off after which it becomes FAILED.
- A staff view of a FAILED upload (it is hidden from every reader now): the nazir-web upload tab needs it to offer a retry.
- Webhooks instead of polling, once their authentication is checked.
- YouTube upload (part B) is MDRS-204.
