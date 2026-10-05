# MDRS-114 — "Bunny’ye yükle" on Ders kayıtları (nazar-web, C9)

The API half is on main: MDRS-116 part A (#209) gives tedrisat `POST /lessons/:id/recordings/uploads`
(creates the video in the Bunny Stream library, records the session's recording as `provider: BUNNY`,
`status: PROCESSING`, and signs a TUS upload for 24 hours), `POST
/lessons/:id/recordings/uploads/:videoId/signature` (signs the same video again, with the original
expiry) and the encoding poll that moves a PROCESSING upload to READY or FAILED. Until this change no
screen used them: nazar's "Kayıt ekle" (`/ders/<id>/kayitlar`) took a title, a pasted https link and
"Herkese açık", and the page said "Burada yükleme yoktur". Now a müderris picks a video file and the
browser sends it to Bunny itself, over TUS; the file never passes through tedrisat or nazar's server,
and the library's API key never reaches the browser. Only `apps/nazar`, `libs/i18n` and the dependency
catalogue change; tedrisat is untouched.

## What changed

| Piece | Where |
| --- | --- |
| `tus-js-client` 4.3.1, in the catalogue first (the workspace file says a bare version in a `package.json` is a bug), then `catalog:` in nazar-web; lockfile | `pnpm-workspace.yaml`, `apps/nazar/package.json`, `pnpm-lock.yaml` |
| the TUS module: `BunnyUpload` (`run()`, `abort()`), `tusHeaders`, `fileProblem`, `videoTypeOf`, `uploadFingerprint`, `tusFailureCode`, the chunk size, the retry delays and the size limit | `apps/nazar/features/recordings/bunny-upload.ts` (new) |
| two server actions, `startRecordingUpload` and `resignRecordingUpload`; each hands the browser what TUS needs (`endpoint`, `libraryId`, `videoId`, `authorizationExpire`, `authorizationSignature`) and keeps the recording's id | `apps/nazar/features/recordings/actions.ts` |
| the rules: `bunnyPending`, `anyBunnyPending`, `uploadBody`, `formatBytes`, `uploadErrorKey`, `uploadMoved`, `uploadContinues` | `apps/nazar/features/recordings/recordings.ts` |
| `useRefreshWhile`: one interval while something is pending, none otherwise | `apps/nazar/features/recordings/use-refresh-while.ts` (new) |
| the dialog: two tabs for adding, the upload panel (file, name and size, progress, İptal, Devam et, the error), "Devam et" for an upload left halfway | `apps/nazar/features/recordings/components/recording-dialog.tsx` |
| the table: buttons by permission, "Devam et" on a Bunny upload still PROCESSING, the page read again while one is | `apps/nazar/features/recordings/components/recordings-table.tsx` |
| the page: opens for `recording.manage` or `recording.upload`, hands the table what the caller holds, the upload note | `apps/nazar/features/recordings/components/recordings-page.tsx`, `apps/nazar/features/account/course-permissions.ts` |
| one contiguous block `Recordings.upload` (37 lines), tr first, en and ar for parity | `libs/i18n/src/locales/{tr,en,ar}/nazar.json` |

Nothing was added to the design kit: the tabs are `Tabs`/`TabsPanel` from `@medaris/ui/mds/tabs` as the
Talebeler tabs use them, the bar is `Progress` (`mds/progress`, as the roster's), the file control is
the kit's `Input` with `type="file"` (the kit already styles `.mds-input[type="file"]`), the error is an
`Alert`.

### One upload, step by step

1. The file input takes `video/*`. A file the browser gives a video type to is taken; one it gives no type
   to is taken by its extension (`mkv`, `mp4`, `m4v`, `mov`, `webm`, `avi`, `wmv`, `flv`, `ts`, `mpg`,
   `mpeg`, `3gp`: Windows hands a Matroska file over with no type); an empty file and one over 10 GB are
   refused. The problem is shown under the field and the kit's form is not submitted while it is, so
   nothing is asked of tedrisat. The chosen file is named under the field with its size ("celse-3.mp4 ·
   4 kB").
2. "Yükle" calls `startRecordingUpload(lessonId, { title, visibility, recordedAt })`: the title and
   "Herkese açık" are the ones the paste tab shares, `recordedAt` is the session's time (what tedrisat
   sets for a pasted link).
3. tus-js-client is loaded then, not with the page, and gets: the endpoint tedrisat named, the metadata
   `filetype` and `title`, chunks of 50 MiB, retries after 0, 1, 3, 5, 10, 20, 30 and 60 seconds (tus
   starts the delays over once a chunk got through; a 4xx from Bunny, its answer to a signature it does
   not take, is not retried), and `onBeforeRequest`, which sets `AuthorizationSignature`,
   `AuthorizationExpire`, `VideoId` and `LibraryId` on every request from the grant held in memory.
4. The bar shows the percent and the bytes ("%50", "2 kB / 4 kB"). While the bytes go the footer holds
   only "İptal", the file, the title, the switch and the tabs cannot change, the dialog does not close on
   Esc, and the browser asks before the page is left (`beforeunload`). Leaving the page inside the app
   stops the upload; Bunny keeps what it received.
5. When Bunny has the whole file: a toast "Video yüklendi", the dialog closes, the page is read again. The
   session shows "Hazırlanıyor", and the page reads itself again every 10 seconds while any Bunny upload
   is PROCESSING, until tedrisat's poll has made it READY (or FAILED, which the read leaves out).

### How resume works

There are two ways back to an upload that stopped (İptal, a dropped connection tus gave up on, a
closed tab).

- **In the same dialog.** "Devam et" calls `run()` again on the same `BunnyUpload`: it asks tedrisat to
  sign the same video again (`resignRecordingUpload(lessonId, videoId)`), keeps the answer in memory,
  and starts the same tus upload again, which asks Bunny for the offset (`HEAD`) and sends the rest. No
  second video is made.
- **After a reload, another day, in the same browser.** tus keeps an upload's address in the browser's
  `localStorage` under a key made of the session and the file (`medaris-bunny-<lessonId>-<name>-<type>-
  <size>-<lastModified>`); the module adds the Bunny video's id to that entry. A session whose Bunny
  upload is still PROCESSING offers "Devam et" to a holder of `recording.upload`; it opens the upload
  alone ("Yüklemeye devam et"). The same file picked again finds the entry, the video is signed again,
  and tus continues from Bunny's offset (`resumeFromPreviousUpload`). Another file, or another browser,
  finds nothing: the dialog says so and starts nothing. If tedrisat will not sign the video again
  (`RECORDING_UPLOAD_CLOSED`: READY, FAILED or past its 24 hours; `RECORDING_UPLOAD_NOT_FOUND`) the
  entry is forgotten and the reason is shown. Adding a recording with a file whose earlier upload is
  still stored for that session continues it when tedrisat still signs it, and otherwise starts a new
  one.

What the browser keeps: the upload's address, size, creation time, metadata (`filetype`, `title`) and
the video's id. Never the signature or its expiry: those live in the `BunnyUpload` object only, are set
on each request, are never in tus's options (which tus stores), and are never logged (the server actions
log only the API's message on a refusal; `course-actions.spec.ts` pins that no logged argument holds the
signature).

### Content Security Policy

nazar sends none: `next.config.js` has no `headers()`, `middleware.ts` only checks the sign-in, and no
deployment file sets one. Nothing was added. When one is written it needs `connect-src
https://video.bunnycdn.com` for the TUS requests.

## Behaviour the owner will notice

| | Before | Now |
| --- | --- | --- |
| "Kayıt ekle" for the müderris or the köşk nazımı (they hold both codes) | title, link, "Herkese açık" | two tabs, "Bunny’ye yükle" first and open; "Bağlantı yapıştır" is the old form; the title and "Herkese açık" stay above and below the tabs for both |
| a ders nazırı given `recording.upload` only | "Bu sayfaya izniniz yok" | the page opens; "Kayıt ekle" shows the upload alone; no "Düzenle" |
| a ders nazırı given `recording.manage` only | the paste form | the same form, no tabs, the same "Burada yükleme yoktur" note |
| the note under the title, for a holder of `recording.upload` | "Burada yükleme yoktur: …" | "Bir celsenin videosunu buradan Medaris’in video kütüphanesine (Bunny) yükleyin; …" |
| a Bunny upload still PROCESSING | "Düzenle" | "Devam et" (for `recording.upload`) beside "Düzenle" (for `recording.manage`) |
| the page while a Bunny upload is PROCESSING | read once | read again every 10 seconds, not while the tab is hidden, until none is |
| a refusal while uploading | — | worded in the dialog: 503 "Video kütüphanesi ayarlı değil. …", 409 "Bu celsenin zaten bir kaydı var; …", 403 "Bunu yapma izniniz yok.", and the others below |

No API call, route, DTO or permission changes; every write is still decided by tedrisat. A button the
screen does not draw has its refusal in tedrisat: both upload routes are `@Authz(recording.upload,
byLessonCourse)` (pinned in `apps/tedrisat/test/e2e/__snapshots__/authz-route-inventory.txt`, talebe and
stranger refused with 403 in `recording-upload.e2e.spec.ts`), the paste and edit routes
`recording.manage` (`recording-write.e2e.spec.ts`).

The sentences of a stopped upload, by code (`uploadErrorKey`): `AUTHZ_FORBIDDEN` "Bunu yapma izniniz
yok.", `RECORDING_EXISTS` "Bu celsenin zaten bir kaydı var; onu düzenleyin. Sayfa yenileniyor.",
`LESSON_NOT_FOUND` the existing "artık yok", `BUNNY_STREAM_NOT_CONFIGURED` "Video kütüphanesi ayarlı
değil. Şimdilik kaydın bağlantısını yapıştırın.", `BUNNY_STREAM_UNAVAILABLE` "Bunny şu an yanıt
vermiyor. …", `RECORDING_UPLOAD_CLOSED` "Yüklemenin 24 saatlik süresi doldu; …" (reason `expired`) or
"Bu yükleme artık sürdürülemez. …", `RECORDING_UPLOAD_NOT_FOUND` the latter, `VALIDATION_ERROR`
"Başlığı denetleyip yeniden deneyin.", and the browser's own: no stored upload for the file ("Bu
dosyanın yarım kalan yüklemesi bu tarayıcıda bulunamadı. …"), the connection ("Bağlantı koptu. …"),
Bunny's 401 or 403 ("Bunny yüklemeyi kabul etmedi. …"), anything else ("Video gönderilemedi. …"). A
code this page does not know is "Bir şeyler ters gitti. …". When the code means the session changed
under the dialog (`RECORDING_EXISTS`, `LESSON_NOT_FOUND`, the two re-sign refusals) the page is read
again behind it.

## Decided by default, owner may overrule

1. **The size limit is 10 GB** (`MAX_UPLOAD_BYTES`, decimal, shown as "10 GB"). Two hours recorded at a
   high bitrate (about 10 Mbit/s) is about 9 GB, so a larger file is most likely not a session's
   recording or one to compress first, and the upload has to finish within the signature's 24 hours.
   Bunny takes larger files; the limit is one constant.
2. **Chunks of 50 MiB, retries for about two minutes.** A dropped connection sends at most one chunk
   again, and each request stays under the 100 MB body that proxies in front of an upload endpoint
   commonly refuse. The delays are one array.
3. **The page opens for `recording.upload` alone too** (`PAGE_CODES.recordings` is now both codes).
   Without it a ders nazırı given only the upload could not reach the tab. Such a caller reads every
   recording of the course, as tedrisat already lists them to anyone who holds a content code.
4. **The page is read again only for a Bunny upload that is PROCESSING**, every 10 seconds, skipped while
   the tab is hidden, with no cut-off. A pasted link that is PROCESSING never moves on its own, so it
   does not keep the page polling. An upload left halfway stays PROCESSING until its 24 hours pass and
   tedrisat's poll fails it, so a page left open on it reads itself every 10 seconds until then.
5. **The upload sends the session's time as `recordedAt`**, as tedrisat does for a pasted link.
6. **Once a video exists the dialog stays with it**: the file, the title, "Herkese açık" and the tab
   cannot change, because the session's recording is that video and tedrisat refuses a second one
   (409). To put something else there: "Düzenle" replaces it with a pasted link, or it fails after 24
   hours and "Kayıt ekle" comes back. Deleting a Bunny video is not in the API (MDRS-116 follow-up).
7. **Errors of the upload are shown in the dialog**, not as a toast (the paste tab keeps its toasts),
   and the dialog stays open so the sentence can be read; a code that means the session changed reads
   the page again behind it.
8. **Resume across a reload works in the browser that started the upload**, from tus's `localStorage`
   entry and the video id added to it. Another browser cannot continue it: the read never returns the
   video id, and nothing asks tedrisat for it.
9. **"Devam et" is offered on every Bunny upload still PROCESSING**, also one whose bytes all arrived and
   that Bunny is encoding: the read cannot tell the two apart. The dialog says so ("Yükleme bittiyse
   video Bunny’de işleniyordur; bir şey yapmanız gerekmez.").
10. **The note stays "Burada yükleme yoktur" for a holder of `recording.manage` alone**: for them it is
    still true.
11. **İptal does not delete what Bunny received** (`abort(false)`), so "Devam et" can continue it.
12. **The extension list for a file with no type** (point 1 of "One upload") is twelve common
    containers; Bunny accepts more.

## Where the task text was off

- "generated client: `getRecordingUploadsApi`-style names": the two operations are on `LessonsApi`,
  `startRecordingUpload` and `resignRecordingUpload`.
- "If the permission code is not in the per-course read, find out why": it is there. `GET
  /courses/:id/my-permissions` answers the engine's effective codes; the müderris, the köşk nazımı and
  the medrese başmüderrisi hold every course code by role default (`codesWith(...)` in
  `libs/common/src/authz/permissions.ts`, which includes `recording.upload`), a ders nazırı by a grant. tedrisat's
  `course-my-permissions.e2e.spec.ts` does not name `recording.upload` in its `arrayContaining` lists,
  so no test pins it there; the catalogue golden spec pins the code itself.
- No tedrisat test names a holder of `recording.manage` alone being refused the upload routes; the
  route's decision is pinned by the route inventory and the talebe and stranger refusals.
- Found while editing, not touched: `nazar.json` has two `Curriculum` objects in every locale; `JSON.parse`
  keeps the second, so the first is dead text, and any tool that rewrites the file through a JSON
  round trip drops it. The new block was inserted as text for that reason.

## Tests

```
$ cd apps/nazar && ./node_modules/.bin/vitest run       # before, at origin/main
 Test Files  50 passed (50)
      Tests  1076 passed (1076)
$ cd apps/nazar && ./node_modules/.bin/vitest run       # after
 Test Files  52 passed (52)
      Tests  1144 passed (1144)
```

68 new tests: `bunny-upload.spec.ts` 21 (new: the TUS module with tus-js-client's `Upload` and its
storage stubbed), `recordings-upload.spec.tsx` 23 (new, happy-dom: who sees what, the tabs, the file,
the progress, the success, the refusals, İptal and Devam et, leaving the page, the resume after a
reload, the page read again, the hook), `recordings.spec.ts` 61 → 81, `course-actions.spec.ts` 27 → 31. `messages.spec.ts`
(6) and `course-permissions.spec.ts` (8) keep their counts with new assertions: every key the upload
builds at run time in all three languages, every new message formatted in all three, and the page
codes of Ders kayıtları. `recordings-page.spec.tsx` (39, the paste form for a holder of
`recording.manage`) is unchanged and green.

Other gates, in this worktree:

- `cd apps/nazar && ./node_modules/.bin/tsc --noEmit`: exit 0, no output.
- the specs type-checked too (a temporary `tsconfig.speccheck.json` without the spec exclusion): one
  error, the known `vitest.config.ts` TS2307.
- `./node_modules/.bin/biome check` on every touched file: no fixes, no errors (the locale files are
  outside Biome's includes).
- `node tools/ci/biome-ratchet.mjs`: errors 0 (baseline 0), warnings 70 (baseline 70), infos 21 (baseline
  21).
- `nx run nazar-web:typecheck --skip-nx-cache`: "Successfully ran target typecheck for project
  nazar-web and 8 tasks it depends on"; `nx run nazar-web:lint --skip-nx-cache`: "Successfully ran
  target lint for project nazar-web".

### Red then green

Each row: one source line changed (or the file put back), the named specs run, the line restored. "UI"
is `recordings-upload.spec.tsx`, "module" `bunny-upload.spec.ts`.

| Criterion | Test(s) | Fails without the change |
| --- | --- | --- |
| all of it | the six changed or new spec files and `recordings-page.spec.tsx` with every source file at `HEAD` (the two new modules removed) | yes: the two new files fail to load, 27 failed, 138 passed in the other five |
| Devam et signs the SAME video again and continues the same tus upload | module "continues the same tus upload after a stop…", "ends a run tus gave up on…, and Devam et signs it again"; UI "İptal stops it, and Devam et continues the same video signed again…" | yes, with the re-sign replaced by a new start: 3 failed |
| a resume after a reload continues the stored upload | module "finds the earlier upload of the same file…"; UI "continues the upload this browser stored for that file…" | yes, without `resumeFromPreviousUpload`: 2 failed |
| the stored entry names its video, never the signature | module "stores the upload's address with its video…", and the three resume tests that need it | yes, without the video id in `addUpload`: 4 failed |
| the signature goes on each request, not in tus's options | module "sends the signature on each request…", and the two that read the re-signed header | yes, without the `setHeader` in `onBeforeRequest`: 3 failed |
| İptal keeps what Bunny received | module "stops tus without deleting what Bunny received…"; UI "İptal stops it…" | yes, with `abort(true)`: 2 failed |
| a dropped connection is named as such | module "is a refusal for Bunny's 401 and 403, the connection…", "ends a run tus gave up on…"; UI "words a dropped connection and offers to continue" | yes, without the network branch of `tusFailureCode`: 3 failed |
| "Bunny’ye yükle" is the default tab | UI "opens Kayıt ekle on 'Bunny’ye yükle'…" and every upload test that opens the dialog | yes, with the tab starting on the link: 14 failed |
| the page opens for `recording.upload` | `course-permissions.spec.ts` "opens when the caller holds any code of the page", "names the codes each page asks…"; UI "opens the page for a holder of recording.upload alone…", "shows the upload alone to a holder of recording.upload alone…" | yes, with `PAGE_CODES.recordings` back to `recording.manage`: 4 failed |
| the upload tab is drawn for `recording.upload`, the paste form for `recording.manage` | UI "who sees what" and the paste tests of `recordings-page.spec.tsx` | yes, with `can.upload` read from `recording.manage`: 20 failed |
| "Devam et" on the row only for `recording.upload` | UI "offers Devam et on a Bunny upload still processing…" | yes, without `can.upload` in the condition: 1 failed |
| success closes and reads the page again | UI "closes, says so and reads the page again once Bunny has the whole file" | yes, without `onDone()` there: 1 failed |
| the browser asks before a page with an upload running is left | the same test | yes, with the `beforeunload` handler doing nothing: 1 failed |
| Esc does not close a running upload | UI "starts the upload with the title, …" | yes, with `busy` out of the close condition: 1 failed |
| leaving the page inside the app stops the upload and keeps what Bunny got | UI "stops the upload, keeping what Bunny got, when the page is left inside the app" | yes, without the abort on unmount: 1 failed |
| closing after a stop reads the page again | UI "reads the page again when closed after a stop…" | yes, without it in `close()`: 1 failed |
| a refusal is worded in Turkish from its code | `recordings.spec.ts` "words a stopped upload's BUNNY_STREAM_NOT_CONFIGURED…"; UI "words a refused start (BUNNY_STREAM_NOT_CONFIGURED)…" | yes, with that code mapped to the generic sentence: 2 failed |
| a 409 reads the page again behind the dialog | UI "words a refused start (RECORDING_EXISTS)…" | yes, without `uploadMoved`'s read: 1 failed |
| the tabs stay once a video exists | UI "keeps to the upload once a video exists…" | yes, without the lock: 1 failed |
| a non-video is refused before anything is asked | UI "names the chosen file and its size, and refuses what is not a video…" | yes, without the check when the file is chosen: 1 failed |
| the page is read again while a Bunny upload is PROCESSING | UI "is read again every 10 seconds while a Bunny upload is processing" | yes, without `useRefreshWhile` in the table: 1 failed |
| …and only for a Bunny one | `recordings.spec.ts` "waits only on a Bunny upload that is not READY…"; UI "is not read again when no Bunny upload is processing…" | yes, with any PROCESSING recording counted: 2 failed |
| the timer stops, and a hidden tab is skipped | UI "starts only while active, stops as soon as it is not, and skips a hidden tab" | yes, without `clearInterval`: 1 failed; without the hidden check: 1 failed |
| the actions hand back only what TUS needs, and the session's time as a date | `course-actions.spec.ts` "starts an upload with the title, who may watch and when…", "signs the same video again" | yes, with the recording's id passed through: 2 failed; with `recordedAt` sent as text: 1 failed |

One check is not in the table: `upload()` first had its own `fileProblem` check, and the run without it
stayed green, because the kit's `Form` (Base UI) does not call `onSubmit` while a field is invalid. It
was removed; the check when a file is chosen is what refuses (row above).

### One real upload, to the dev library

The coordinator allowed one. `scratchpad/merge/V/real-upload.mjs` (outside the repository) loads this
module's `bunny-upload.ts` with Node 26's type stripping and tus-js-client's Node build, stands in for
tedrisat's two routes (Bunny's Create Video with the library key from the 600 file outside git, and
tedrisat's signature formula), stops the upload once at its first PATCH and continues it with `run()`,
waits for Bunny to encode, then deletes the video. It prints no key, signature or library id (a check
afterwards found none of the secret values in its output).

```
start: Bunny Create Video                      200 guid=9ec248b7…
run 1 (stopped at its first PATCH)             {"status":"aborted","videoId":"9ec248b7"}
run 2 (Devam et)                               {"status":"done","videoId":"9ec248b7"}
re-signs asked                                 1
progress events                                2, last 40098/40098
  request                                      POST signature=tedrisat's video=ours
  request                                        -> 201
  request                                      PATCH signature=tedrisat's video=ours
  request                                      HEAD signature=tedrisat's video=ours
  request                                        -> 200 offset=40098
Bunny encoding statuses seen                   2 -> 3 -> 4
Bunny's video                                  title=medaris-nazar-upload-check length=4s storageSize=359232
delete the test video                          200; get after delete 404
```

So against the real library: the headers set in `onBeforeRequest` are accepted on create, PATCH and
HEAD; a second `run()` signs the same video again and asks Bunny for the offset; the metadata title
arrives; Bunny encodes the file to Finished (4). The 40 KB file had reached Bunny whole before the stop
took effect (offset 40098 of 40098), so a continuation from a partial offset was not exercised here.

## Not verified

- **A real browser.** No Playwright, no Docker (another agent's run uses them): the dialog was not seen
  in a browser, so Base UI's tabs, the file chooser, XHR's upload progress, `beforeunload` and the
  `localStorage` entry surviving a reload are tested in happy-dom with stubs only.
- **A continuation from a partial offset** against Bunny (above): tus's own behaviour, exercised here
  only with the stub.
- **The whole path through tedrisat**: the real upload stood in for tedrisat's two routes; the routes
  themselves are MDRS-116's, tested there (`recording-upload.e2e.spec.ts`, not run here, as nothing in
  tedrisat changed).
- **A large file** (several GB) and the 24-hour expiry in practice.
- **A Content Security Policy**: there is none to check.
