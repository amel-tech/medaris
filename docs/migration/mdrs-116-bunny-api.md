# MDRS-116 — Bunny Stream upload API (part A, tedrisat only)

## What was done

- **Migration `0047_bunny_stream_recordings`**: `recording_provider` gains `BUNNY`, `recording_status` gains `FAILED`; `lesson_recordings` gains `bunny_video_id` (unique) and `upload_expires_at`. CHECK `lesson_recordings_provider_columns`: a BUNNY row has a video id and an upload expiry and no `url`; any other row has neither, and a `url` unless it is PROCESSING. The enum literals are compared as text because the migrator adds and uses them in one transaction. Rollback: `src/database/rollbacks/0047_bunny_stream_recordings.down.sql`.
- **`BunnyStreamClient`** (`src/bunny-stream/`): Create Video, Get Video, TUS signing, player link. Its config (`BUNNY_STREAM_CONFIG`) and transport (`BUNNY_STREAM_FETCH`) are separate providers so tests replace them. The API key never leaves tedrisat.
- **Pure functions** (`bunny-signature.ts`): `tusUploadSignature` = `SHA256_HEX(library_id + api_key + expiration + video_id)`, `uploadExpiry` (default 24 h, refuses < 3600 s), `embedViewToken`, `embedUrl`, `encodingOutcome`.
- **`POST /lessons/:id/recordings/uploads`**: creates the video in Bunny, inserts `provider=BUNNY, status=PROCESSING`, returns `recordingId, endpoint, libraryId, videoId, authorizationExpire, authorizationSignature`. 409 `RECORDING_EXISTS` when the session already has a recording, unless it is a FAILED Bunny upload (that row is reused). Audited as `recording.upload_start`.
- **`POST /lessons/:id/recordings/uploads/:videoId/signature`**: re-signs the same video with the original expiry (Bunny never extends an upload's lifetime). 409 `RECORDING_UPLOAD_CLOSED` once not PROCESSING or expired.
- **Authorization**: both routes `@Authz(SCOPES.VIEW, byLessonCourse)` (404 for a missing lesson) plus `recording.upload` through `CourseAccessService`, as `LiveStreamController` does for `session.live_link` — müderris and köşk nazımı by default, ders nazırı by grant. The permission is checked before the 503, so a talebe gets 403 either way.
- **`RecordingEncodingPoller`**: every 60 s while the library is configured; Finished → READY (sets duration), Error/UploadFailed/404 → FAILED, Created past `upload_expires_at` → FAILED.
- **Read path**: a READY BUNNY recording's `url` is Bunny's iframe player link, with an embed token (6 h) when `TOKEN_KEY` is set; the video id is never returned.
- **Env**: `TEDRISAT__BUNNY_STREAM_LIBRARY_ID`, `TEDRISAT__BUNNY_STREAM_API_KEY`, `TEDRISAT__BUNNY_STREAM_TOKEN_KEY` in the root `.env.example` (commented placeholders) and `docker-compose.yml`. Unset: boot succeeds, upload routes answer 503, nothing is polled. Only one of id/key set, or a non-numeric id, stops the boot.
- OpenAPI and `libs/services` regenerated (`pnpm openapi:tedrisat`).

## Deviations from the task text

- `status` already existed (`PROCESSING`, `READY`, MDRS-162); only `FAILED` was added, and existing rows keep their status instead of being forced to READY: a link row in PROCESSING with a null `url` is the documented "Hazırlanıyor" state. For the same reason the CHECK lets a non-BUNNY PROCESSING row have no `url`.
- The route parameter is `:id` (as every other `/lessons/:id` route and `byLessonCourse` read it); the URL is the same as `/lessons/:lessonId/recordings/uploads`.
- `apps/tedrisat/test/e2e/__snapshots__/authz-route-inventory.txt` does not exist on main, so there was nothing to update.

## Verified

- Unit: `test/unit/bunny-stream/` — 21 tests (signature vectors computed independently with `sha256sum`, config reader, client with a fake transport).
- e2e: `test/e2e/recording-upload.e2e.spec.ts` — talebe 403 with no Bunny call, müderris 201 with the expected fields and signature, köşk nazımı 201, 409, 404, 400, 503 without a library, re-sign, expired re-sign, poll to READY with a signed player link, poll to FAILED, retry after FAILED, the CHECK constraint.
- Gate (env -u NODE_ENV, --skip-nx-cache): typecheck 17 projects green; test 12 projects green, 4750 tests, 0 failures (tedrisat 1900); build 8 projects green; lint 17 green; module-boundaries 17 green. biome ratchet at baseline; env/compose parity, OpenAPI freshness and release config assertions pass.

## Not verified

- Nothing was sent to a real Bunny library: no account/keys in this environment. Create Video's `guid`, the status codes (0 Created, 4 Finished, 5 Error, 6 UploadFailed), the TUS headers and the embed token formula are taken from Bunny's documentation, not measured.
- A 2 GB upload, resume after interruption and playback for an enrolled talebe (issue AC) need nazir-web and a live library.

## Follow-ups

- nazir-web "Bunny'ye yükle" tab with `tus-js-client` (excluded here).
- Delete orphaned Bunny videos: a FAILED video replaced by a retry, a video created when the row write then fails, and videos of a purged course (`course-purge.ts` deletes only the rows).
- The poll reads 50 rows per pass, oldest-updated first; with more than 50 waiting uploads some are not reached until others settle.
- Webhooks instead of polling, once their authentication is checked.
- YouTube upload (part B) is MDRS-204.
