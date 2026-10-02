# MDRS-162: celse states (live, ended with recording, locked) and the recordings tab

Package stack-32, designs tedris/16, 17, 19 and 24. Built on stack-31.

## What was done

- **Migration `0041_lesson_recordings`** (first generated as `0035`; regenerated as `0041` when the package was placed on top of stack-31, whose chain ends at `0039_revoked_enrollment`, with `0040` reserved for stack-46; the journal `idx` is 39, the tag carries 0041, and the SQL is unchanged). Adds `lessons.live_stream_url` and `lesson_recordings` (one row per lesson: title, provider YOUTUBE/DRIVE/OTHER, url, duration, recorded_at, visibility PUBLIC/ENROLLED, status PROCESSING/READY). Foreign key RESTRICT like every other one under a course; `purgeCourses` deletes recordings first.
- **`GET /courses/:id/recordings`** (public, `private, no-store`): sorted by week descending then recording date descending. A caller holding `view_details` sees all; everyone else (visitor, stranger, PENDING, REVOKED) sees PUBLIC only. A PROCESSING recording is listed with a null `url`. Built from `viewDetail`, so draft, hidden and archived lessons behave as on the course page.
- **`GET /courses/:cid/sessions/:sid`** gains `liveStreamUrl` (content, only while LIVE) and `recording` (content). A locked body carries neither key.
- **tedris-web**: session page draws the live stream player and the recording player (`MediaPlayer`), "N dakikadır sürüyor" (new optional `elapsedText` on the kit's `SessionJoin`) and "Ders kayıtlarına git" to `/courses/:id?tab=kayitlar`; the course page's "Ders kayıtları" tab is now the real list (`RecordingsTab`) with a count and `?tab=` support; the locked session (tedris/19) is redrawn with the kit's join card in `access="locked"`, the course card and the locked programme. REVOKED gets the same lock with no button.
- Generated client regenerated.

## Review round 1

- tedris/24 error state: `getRecordings` returns null on failure and the tab draws a `SystemState` with "Yeniden dene" (`router.refresh()`) instead of the empty state.
- tedris/17 criterion 3: see Decisions; covered by an e2e case in `recordings.e2e.spec.ts`.
- tedris/16: the Müfredat row of a session on air reads "Sıradaki · Şu an canlı" on the session page and on the course page (`isRunning`, `ProgrammeRow.live`).
- tedris/19: "Kayıt başvurusu yap" opens the window of tedris/07 when the application waits for approval (`lesson-locked-apply.spec.ts`).
- Playwright e2e for 16/17/19/24: `apps/tedris/e2e/celse-states.e2e.ts` with its seed. Specs sign in through Keycloak and are skipped without the `E2E_*` accounts; the file was type-checked and listed but not run against Keycloak in this round.

## Decisions

- Only a link is stored. YouTube plays framed from `youtube-nocookie.com/embed/<id>` built from the video id alone; Drive is framed through `/preview` on the session page and opens at its host in the list (tedris/24 criterion 4); anything else opens in a new tab. No Google API is called, so 16/17 stay class B.
- Locked callers get no recording on the session endpoint (tedris/19), except the PUBLIC recording of a sample session (`isPreview`, tedris/17 criterion 3); PUBLIC ones are also listed by the recordings endpoint (tedris/24 criterion 5, and the revoked card promises them). An ENROLLED recording of a sample session stays hidden from a locked caller.
- Writing recordings and the stream link (müderris/nazır side) is out of scope: no write endpoint; rows are created by SQL for now.
- `AnonymousInvite` takes a narrow translator type: the tedris message catalogue is at the TS2589 wall (it already failed at the stack-31 base). Same cause as stack-34/36 notes.

## Verified

- tedrisat: `recording.spec.ts` (8), `recordings.e2e.spec.ts` (9, real Postgres; list order, visibility per caller, PROCESSING without link, archived lesson, 404s, stream only while LIVE, locked body without keys).
- tedris-web: `recordings-model`, `recordings-tab`, `session-page` (live/ended), `lesson-locked`, `course-page-states` specs; kit `SessionJoin` elapsed text.
- Real browser against a throwaway DB (:5437, API :3101, web :4100), signed in through Keycloak: 16 (frame, "15 dakikadır sürüyor"), 17 (player, link to the tab), 24 (count 5, Oynat swaps the player, Drive opens in a new tab with `noopener`, PROCESSING has no action, visitor sees one), 19 (locked body, HTML holds no meeting link, agenda or stream). Screens in `local_docs/ekranlar/_kontrol/stack-32/`.

## Not verified

- `celse-states.e2e.ts` was not executed against a live Keycloak sign-in in the review round (the `E2E_*` accounts were not set); the earlier browser checks were manual scripts.
- The recordings-read failure is covered by a component spec, not by a browser run (the failure is a server-side fetch).
- "Bağlantı bugün eklendi" on 16 (link update notice) needs a link-updated field; not built.
- Live playback inside the frame depends on the viewer's network and the provider's embed policy.
- No CSP exists in tedris-web, so no `frame-src` was needed; a future CSP must allow `youtube-nocookie.com` and `drive.google.com`.
