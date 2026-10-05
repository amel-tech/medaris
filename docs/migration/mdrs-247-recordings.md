# MDRS-247 — Ders kayıtları: the recording write path, on Bunny and without the YouTube rule

The recordings half of MDRS-247 (PR #202): nazir's "Ders kayıtları" page for the course staff and its two
tedrisat routes, `POST /lessons/:id/recordings` and `PATCH /recordings/:id`, both `recording.manage` on the
lesson's course. A session holds one recording; on this page it is a pasted link, never an upload.

The routes were written before Bunny Stream (MDRS-116, #209) and signed playback (MDRS-119, #211) reached
`main`, and before the owner's decision of 3 October. This note says how they work now that all three are
in. Every count below was read off the command next to it, run in the worktree of `port/mdrs-247-recordings`.

## Decided by the owner

- **A pasted YouTube link need not be public and is not checked beyond the link reader** (3 October:
  "MDRS-119's public-only rule is dropped for now"; MDRS-114 AC4 says not to build it). The rule #202 had
  ("a YouTube recording is PUBLIC only", 400 `RECORDING_YOUTUBE_PUBLIC_ONLY`) is gone from tedrisat and from
  nazir's form, and a test shows a non-public YouTube link is accepted.

## How a link is written

Both routes read the link with `detectRecordingLink(url, bunny.libraryId)`
(`apps/tedrisat/src/course/domain/recording-link.ts`, MDRS-119) and nothing else; nothing is asked of any
host. `linkColumns` turns what it read into every column the `lesson_recordings_provider_columns` CHECK
(migration 0053) reads, so a row that moves between a Bunny video and any other link stays consistent:

| Pasted | `provider` | `url` | `bunny_video_id` | `upload_expires_at` | `status` |
| --- | --- | --- | --- | --- | --- |
| a YouTube video (`watch?v=`, `youtu.be/`, `/live/`, `/shorts/`, `/embed/`) | YOUTUBE | `https://www.youtube.com/watch?v=<id>` | null | null | READY |
| a player link of our Bunny library (`player.`/`iframe.mediadelivery.net`, `video.bunnycdn.com`, `/embed/<lib>/<vid>` or `/play/…`) | BUNNY | null | the video id, lower-cased | the time of the write | READY |
| Google Drive or Docs | DRIVE | as pasted | null | null | READY |
| any other https link | OTHER | as pasted | null | null | READY |

A pasted Bunny row is READY, so the encoding poll (PROCESSING rows only) never reads it and the re-sign
route (PROCESSING only) refuses it; its `upload_expires_at` is the write time only because the CHECK wants
one on every BUNNY row. The reads (`GET /courses/:id/recordings`, the session page) sign its player link
per caller as they do for an upload. The write's own answer signs it too, for the writer, so
`RecordingResponse.url` means the same thing on every route; the video id never appears in a response.

What is refused, all 400 `RECORDING_LINK_INVALID` with `context.reason`, nothing written:

| `reason` | when |
| --- | --- |
| `invalid` | not a link, credentials in it, empty, over 500 characters |
| `not-https` | any other scheme (field validation answers a plain `http://` first, `VALIDATION_ERROR`) |
| `youtube-no-video` | a YouTube page that names no video (a channel, a playlist) |
| `bunny-no-video` | any other host on a Bunny domain (`*.mediadelivery.net`, `*.bunnycdn.com`, `*.b-cdn.net`), or a player link with no library or video id |
| `bunny-foreign-library` | a player link of another library, or any Bunny link while this server has no library configured |
| `bunny-video-used` (new) | the video is already another recording's, a pasted one or an upload; checked in the write's transaction, before the unique index on `bunny_video_id` would answer 500 |

**One recording per session** stays: `POST` on a session that has one is 409 `RECORDING_EXISTS` naming it,
**except a Bunny upload that FAILED**, which "Kayıt ekle" replaces in the same row (same id), as
`startBunnyUpload` does for a new upload; the audit row names the video it replaced. A READY or still
PROCESSING upload is kept.

`PATCH` changes only the keys sent. A new link is read the same way and the recording becomes READY; a
title or visibility change leaves where it lives alone. A recording may be given its own video again.

Audit: `recording.add` details gain `bunnyVideoId` and `replacedVideoId`; `recording.update`'s `previous`
and `next` gain `provider` and `bunnyVideoId`, so a move between a Bunny video and a link is visible.

## nazir (Ders kayıtları)

- The form takes a YouTube link with "Herkese açık" off, and no longer locks the switch on for a public
  YouTube recording; a closed course still locks it off. `Recordings.form.youtubePublic` and
  `Recordings.errors.youtubePublicOnly` are gone from tr, en and ar.
- `providerOfLink` reads a link on a Bunny domain as BUNNY while it is typed (tedrisat's host rule; no call
  is made). The design kit has no Bunny chip: `design-system/medaris-unified/content/recording-providers.json`
  gives `bunny` no label, as Medaris's own host that plays in the page. So `chipOf("BUNNY")` is null, the form
  shows the link's host in a chip (`mds-platform-chip--bunny`, read out as detected), and the list shows a
  Bunny recording's host (`player.mediadelivery.net`), as for any host without a chip.
- A refusal of a link now carries its `reason` from the server action to the dialog (only that code, never
  the server's message), and each reason has a sentence: `Recordings.errors.linkInvalid.*` (`invalid`,
  `notHttps`, `youtubeNoVideo`, `bunnyNoVideo`, `bunnyForeignLibrary`, `bunnyVideoUsed`), one block inside
  `Recordings.errors`, tr first, en and ar for parity. A reason the page does not know reads as `invalid`.
- A PROCESSING Bunny upload is listed as "Hazırlanıyor" with "Bağlantı yok"; a READY one with its host and
  "Aç" (the signed player link). A FAILED upload is not returned to the staff by the read (MDRS-116 rule,
  unchanged), so its session offers "Kayıt ekle", which now replaces it.

## Behaviour changes callers will see

- `POST /lessons/:id/recordings` and `PATCH /recordings/:id` with a YouTube link and `ENROLLED` (or no
  visibility) answer 201/200 instead of 400 `RECORDING_YOUTUBE_PUBLIC_ONLY`, and `PATCH` of a YouTube
  recording back to `ENROLLED` is 200. The code `RECORDING_YOUTUBE_PUBLIC_ONLY` no longer exists.
- A YouTube link is stored as its watch link (`https://www.youtube.com/watch?v=<id>`): a `youtu.be`,
  `/live/`, `/shorts/` or tracked link is no longer stored as pasted.
- A YouTube page that names no video, a link with credentials, a Bunny link of another library or of a CDN
  host, and any Bunny link on a server without a library were stored (as YOUTUBE or OTHER) and are now
  400 `RECORDING_LINK_INVALID`.
- A player link of our Bunny library was stored as OTHER with its raw (unsigned or someone else's signed)
  address, handed to every enrolled talebe; it is now BUNNY and played through a signed link.
- `POST` on a session whose recording is a FAILED Bunny upload is 201 (the row is replaced) instead of 409.
- The write answers carry only `RecordingResponse`'s fields; `createdAt`, `updatedAt`, `bunnyVideoId` and
  `uploadExpiresAt` (never in the schema) are no longer sent.
- nazir: a YouTube link with the switch off is no longer stopped, the switch of a public YouTube recording
  can be turned off, a Bunny link shows its host, and a refused link is worded by its reason.

## Decided by default, owner may overrule

1. **The write answer signs a Bunny link for the writer** (instead of answering `url: null`), so the field
   means the same on every route. The writer holds `recording.manage` on the course and may see it anyway.
2. **A pasted Bunny link on a session whose upload is still PROCESSING is refused like any other**
   (409 `RECORDING_EXISTS`); only FAILED is replaced, as `startBunnyUpload` decides. `PATCH` with a link on a
   PROCESSING upload does replace it (that is the route for changing a recording); the poll then leaves it.
3. **`bunny-video-used` counts every other row**, an upload of any status included, since the unique index
   does. Two writers pasting the same video on two sessions at the same instant can still both pass the check
   and one gets a 500 from the index, with nothing written; the check is not taken under a lock.
4. **No Bunny chip** is invented outside the kit; the host is shown (above). Adding `bunny` to the kit's
   labels would make `PlatformChip` print it, with no change here beyond `chipOf`.
5. **en and ar sentences exist** for the new keys, for parity (the owner asked for Turkish only for now).

## Tests (red without the change, green with it)

Each was run against the source with the change put back; `M0` is the whole of `apps/tedrisat/src/course`
as it was before (`git checkout ea37af15 -- apps/tedrisat/src/course`, then restored).

| Criterion | Test | Red without it |
| --- | --- | --- |
| a non-public YouTube link is accepted (MDRS-114 AC4) | e2e `takes a YouTube link that is not public, and stores it as its watch link`; `moves a recording to YouTube while it stays ENROLLED…` | M0: both fail |
| the link reader decides, with its reasons | e2e `refuses a YouTube page that names no video…`, `refuses a Bunny host that is not a player…`, `refuses a new link that cannot be stored…` | M0: fail |
| a pasted Bunny link of our library is BUNNY, null url, READY, plays signed, the poll ignores it | e2e `stores a player link of our library as its video, READY with no url, and plays it signed` | M0; `uploadExpiresAt: null` in `linkColumns` (CHECK, 500); answer not signed; `detectRecordingLink(dto.url, null)` |
| another library's link | e2e `refuses a player link of another library with 400 bunny-foreign-library` | M0 |
| no library configured | e2e `refuses any Bunny link while no library is configured` | M0 |
| the same video on two sessions | e2e `refuses a video another session holds with 400 bunny-video-used, on add and on change` | M0; the check's `throw` removed (500 from the index) |
| a FAILED upload is replaced | e2e `replaces a Bunny upload that FAILED with the pasted link, in the same row`, `…with a Bunny link too, even of the same video` | M0; `if (existing)` without the FAILED exception (409) |
| a READY or PROCESSING upload is kept | e2e `keeps a Bunny upload that is READY` / `still PROCESSING` | passes on M0 too: a guard that the exception stays narrow |
| a changed link rewrites every CHECK column | e2e `moves a recording from a pasted link to a Bunny video and back, every column with it`, `replaces an upload still PROCESSING with a pasted link…` | M0; update writing only `provider` and `url` (CHECK, 500); own row not left out of the video check |
| `linkColumns` | unit `linkColumns (MDRS-247)` (2) | `uploadExpiresAt` null for Bunny; set for a link |
| nazir takes YouTube with the switch off | `recordings.spec.ts` `takes a YouTube link with the switch off or on…`, `adds a YouTube link closed…`; page `takes a YouTube link with the switch off…`, `closes a public YouTube recording…` | the YouTube rule put back in `formErrors`; the switch locked when public |
| nazir reads Bunny while typing | `recordings.spec.ts` providers (6 Bunny rows); page `shows the host of a Bunny player link as it is typed…` | the Bunny line of `providerOfLink` removed; the dialog's Bunny branch removed |
| refusals worded by reason | `recordings.spec.ts` `words a link tedrisat cannot store…` (9), `reads the reason a refusal carries…`; `course-actions.spec.ts` `hand back the code of a refusal, never its message`; page `words a link tedrisat cannot store (…) from its reason` (4); `messages.spec.ts` key presence | the `RECORDING_LINK_INVALID` case removed; the action dropping the reason; the dialog not passing it |

## Verified

```
$ cd apps/tedrisat && /home/taha/medaris-wt/.bin/e2e-slot.sh ./node_modules/.bin/vitest run test/e2e/recording-write.e2e.spec.ts
 Test Files  1 passed (1)
      Tests  59 passed (59)
$ … test/e2e/recording-upload.e2e.spec.ts test/e2e/recording-playback.e2e.spec.ts test/e2e/recordings.e2e.spec.ts
 Test Files  3 passed (3)
      Tests  46 passed (46)
$ … test/e2e/session.e2e.spec.ts test/e2e/archive.e2e.spec.ts test/e2e/authz-route-inventory.e2e.spec.ts
 Test Files  3 passed (3)
      Tests  43 passed (43)
$ M0 (the old course source) with the new recording-write spec
      Tests  13 failed | 46 passed (59)
```

The route inventory passes unchanged: no route's decision changed, so there is no snapshot update.
`pnpm run openapi:tedrisat` regenerated the descriptions only; `node tools/ci/assert-openapi-spec-fresh.mjs`:
`183 paths, identical`. `levelcheck.sh mdrs-247-sessions`: `tsc` 0 errors in tedrisat, nizam, nazir and
tedris, no unresolved name in any spec, Biome ratchet errors 0, warnings 70, infos 21; libs/common 176 tests,
tedrisat unit 80 files 1082 tests, nizam 756, nazir 50 files 1042 tests, all passed; libs/ui 164 passed with
`NODE_OPTIONS=--no-experimental-webstorage` (25 fail without it on this machine, as known).

## Not verified

- A pasted Bunny link playing in a real browser against a real library (the e2e checks the signature with a
  stubbed transport; MDRS-119's owner-side token settings still apply).
- The Playwright suites (they need a running stack).
- The race in decision 3 (two simultaneous pastes of one video) is reasoned, not tested.

## Follow-ups

- The "Bunny'ye yükle" upload tab in nazir (tus-js-client against `POST /lessons/:id/recordings/uploads`)
  is not built here.
- The staff never see a FAILED upload (the read leaves it out for everyone); a staff view of it, and of an
  upload still PROCESSING beyond "Hazırlanıyor", belongs with that upload screen. Renaming a PROCESSING
  recording in nazir needs a link in the form, as before.
