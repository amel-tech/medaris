# MDRS-114 — Bunny recordings play in tedris (part B3)

The API side is on main: MDRS-116 (#209) uploads to Bunny Stream and MDRS-119 (#211) signs playback.
A READY recording with `provider: "BUNNY"` comes back from `GET /courses/:id/recordings` and from the
session read (`GET /courses/:courseId/sessions/:sessionId`) with `url` set to a player link signed for
this response and this viewer:
`https://player.mediadelivery.net/embed/<libraryId>/<videoId>?token=<sha256 hex>&expires=<unix seconds>`.
Until this change tedris did not play it: `recordingAction` answered "play" for YouTube only, so a Bunny
recording was a link-out card to the bare player page in a new tab. This note covers the tedris side
only; the nazir form (C9, C10) and the API are not touched. Commands run from the repository root
unless a `cd` says otherwise.

## What changed

| Piece | Where |
| --- | --- |
| `bunnyPlayerUrlOf(url)`: the signed link exactly as the API returned it, or null | `apps/tedris/features/courses/recordings-model.ts` |
| `embedUrlOf("BUNNY", url)` returns that link; `recordingAction` answers "play" for a framable Bunny recording | same file |
| Bunny's frame: `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"`, `allowFullScreen`, `referrerPolicy="strict-origin-when-cross-origin"`, `loading="lazy"`, the same 16:9 box, no sandbox; a new `frameTitle` prop | `apps/tedris/features/courses/components/media-player.tsx` |
| the frame title "Ders kaydı oynatıcısı: {title}" for a Bunny recording, and the "Bunny Stream" chip in the list | `recordings-tab.tsx`, `session-page.tsx`, `lesson-locked.tsx` |
| `bunnyFrameTitle` in `tedris.SessionPage` and `tedrisLearn.RecordingsTab`, tr, en, ar | `libs/i18n/src/locales/{tr,en,ar}/tedris.json`, `tedris-learn.json` |
| the two reads that carry recordings ask fetch for `cache: "no-store"` | `apps/tedris/features/courses/public-reads.ts` |
| the hosts a future Content Security Policy must allow in `frame-src` | the header comment of `recordings-model.ts` |

### What the model accepts

`bunnyPlayerUrlOf` never rebuilds the address (the token in it is this viewer's); it checks it and hands
back the very string. It accepts only:

- `https:` (the module's existing `parse` refuses anything else);
- origin exactly `https://player.mediadelivery.net`: no other host, no port, no trailing dot;
- no user name, no password, no `#` anywhere;
- path `/embed/<digits>/<GUID>`, the GUID in either case (a pasted link may carry capitals, and the API's
  own detector accepts them);
- query exactly `?token=<64 lower-case hex>&expires=<digits>`, or the two the other way round, and
  nothing else (no third key, no repeated key, no trailing `&`);
- a string the URL parser writes back unchanged (`new URL(url).href === url`), so leading white space, a
  host in capitals, `:443` written out or a `..` in the path are refused: what is checked is exactly what
  is framed.

Anything else is not framed: on the session page and the locked page the card shows "Ders kaydı burada
oynar" with "Ders kaydını aç" to the stored link in a new tab, and in the recordings tab the row offers
"Ders kaydını aç" instead of "Oynat", as for any recording that cannot be framed. A Bunny-looking link
stored under another provider (YOUTUBE, DRIVE, OTHER) is never framed as Bunny's.

### Where it plays

Wherever a YouTube recording already played in the page's own player:

- the course's "Ders kayıtları" tab: the player starts on the newest recording that plays in it, which
  can now be a Bunny one, and "Oynat" loads a Bunny recording into it;
- the session page of a finished celse with a READY recording;
- the locked session page (tedris/19), for the PUBLIC recording of a sample session that the API sends
  to a locked reader. This was not in the task's list; it frames YouTube the same way, so Bunny plays there
  too rather than linking out to the bare player.

The private-notes panel (MDRS-150) is unchanged and still mounted beside the player in the tab and under
it on the session page. Its frame id goes to the panel only for a YouTube frame, so beside a Bunny
recording it shows its typed time field, as it already did for Drive.

### Not cached

The pages read the viewer's token through `getAccessToken()`, so they render per request, and the API
answers both reads with `Cache-Control: private, no-store` (MDRS-119). The reads themselves now say so
too: `getRecordings` and `getSession` pass `{ cache: "no-store" }` to the generated client, which hands
it to `fetch`, so Next never keeps a signed link in its data cache for another request.
`getSession` is still wrapped in React's `cache()`, which shares the answer between the segment layout
and the page of the same request only. `test/public-reads.spec.ts` pins both calls.

## Behaviour the owner will notice

| | Before | Now |
| --- | --- | --- |
| a READY Bunny recording in the "Ders kayıtları" tab | a row with "Ders kaydını aç", opening the bare player page in a new tab; never in the player above | a row with "Oynat" and a "Bunny Stream" chip; plays in the page's player, and the player starts on it when it is the newest playable one |
| a READY Bunny recording on the session page | the placeholder card with a link out | Bunny's player in the card, on the signed link of this render |
| a PUBLIC Bunny recording of a sample session on the locked page | the placeholder card with a link out | Bunny's player |
| a Bunny link the model refuses (unsigned, another host, extra query) | link out | link out (unchanged) |
| the frame's accessible name for a Bunny recording | (no frame) | "Ders kaydı oynatıcısı: <title>" |
| YouTube, Drive and other recordings, the live stream, PROCESSING, empty and locked states | | unchanged: same addresses, same attributes, same sandbox, same title |

No API call, route, DTO or permission changes, so nothing answers differently: the screens only frame
what the API already sends to a caller allowed to see it.

## Decided by default, owner may overrule

1. **An unsigned Bunny player link is not framed.** When tedrisat has no token key it returns the bare
   `https://player.mediadelivery.net/embed/<lib>/<video>`. The issue says the iframe is on the *signed*
   URL, so the model asks for `token` and `expires`, and an unsigned link stays a link-out card (it opens
   the same page in a new tab). Alternative: frame it too; one line in `BUNNY_SIGNED_QUERY`.
2. **Bunny's frame has no sandbox.** Bunny's own embed code has none and that is how the player was
   measured playing on a real library; a sandbox that has not been tried in a browser could break
   playback, full screen or DRM. The YouTube and Drive frames keep `sandbox="allow-scripts
   allow-same-origin allow-presentation allow-popups"`. Alternative: give Bunny the same sandbox once it
   is checked in a browser.
3. **The frame title is only Bunny's.** "Ders kaydı oynatıcısı: {title}" names Bunny's frame; the YouTube
   and Drive frames keep the recording's title as their name, so they are exactly as before.
4. **The chip says "Bunny Stream"** (one entry in `PROVIDER_NAMES`, as YouTube and Google Drive). It can
   be dropped if the owner prefers talebe not to see the host's name.
5. **The locked page plays Bunny too** (see "Where it plays").
6. **The query keys may come in either order; the token must be lower-case hex**, which is what tedrisat
   writes (`createHash(...).digest("hex")`).

## Where the task text was off

- "PROCESSING keeps 'Kayıt hazırlanıyor' (exists)": no such string exists. The tab shows "Hazırlanıyor"
  and "Hazır olunca burada oynar" for a recording being prepared, and the session page draws no player
  for it and links the tab. Both are unchanged.
- "a short comment or constant naming the two frame hosts": tedris frames four hosts today, not two. The
  comment names the issue's two (`player.mediadelivery.net`, `www.youtube-nocookie.com`) and also
  `drive.google.com` (a Drive recording on the session page) and `www.youtube.com` (the live chat,
  MDRS-229), so a CSP written from it does not break those.

## Tests

```
$ cd apps/tedris && NODE_OPTIONS=--no-experimental-webstorage ./node_modules/.bin/vitest run    # before
 Test Files  78 passed (78)
      Tests  740 passed (740)
$ cd apps/tedris && NODE_OPTIONS=--no-experimental-webstorage ./node_modules/.bin/vitest run    # after
 Test Files  80 passed (80)
      Tests  802 passed (802)
```

62 new tests: `recordings-model.spec.ts` 31 → 75, `session-page.spec.ts` 28 → 33,
`session-notes.spec.ts` 9 → 10, `recordings-tab.spec.ts` 9 → 14, `recordings-tab-notes.spec.ts` 4 → 5,
`lesson-locked.spec.ts` 16 → 17, and two new files, `recordings-tab-frame.spec.ts` (3, the tab rendered
with the real player card, which `recordings-tab.spec.ts` stubs for happy-dom) and `public-reads.spec.ts`
(2). The eight files together: `Test Files 8 passed (8)`, `Tests 159 passed (159)`.

Other gates, in this worktree:

- `cd apps/tedris && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`: exit 0.
- `./node_modules/.bin/biome check` on every touched file: no errors; 3 warnings, all
  `suppressions/unused` on lines of `session-page.tsx` this change does not touch.
- `node tools/ci/biome-ratchet.mjs`: errors 0 (baseline 0), warnings 70 (baseline 70), infos 21
  (baseline 21).

`NODE_OPTIONS=--no-experimental-webstorage` is needed on this machine's Node 26, where
`window.localStorage.clear` is undefined; without it 12 tedris specs fail that are not this change's.

### Red then green

Each row: the source change put back, the eight spec files run (for the credential, fragment, path
and `href` checks the model spec alone, 75 tests), the change restored.

| Criterion | Test(s) | Fails without the change |
| --- | --- | --- |
| a Bunny recording plays, on the very string the API returned | model: "frames the form tedrisat signs…", "frames the two keys the other way round…", "frames a video GUID in capitals…"; "plays a ready Bunny recording in the page's player"; "starts it on a Bunny recording when that is the newest"; tab: "plays the newest one in the player, on the very link the API signed", "offers Oynat on its row…"; session page: "plays a Bunny recording in Bunny's player…"; locked page: "plays a public Bunny recording…"; notes: "stays beside a Bunny recording…", "asks for a typed time on a Bunny recording…" | yes. With `embedUrlOf`'s BUNNY line and `recordingAction`'s BUNNY term removed: 13 failed, 146 passed. With every source file at `HEAD`: 48 failed, 111 passed |
| any other host or port is refused | "does not frame another host", "…Bunny's older iframe host", "…Bunny's direct-play host", "…a look-alike subdomain", "…a host ending in the player's name", "…the host with a trailing dot", "…another port"; session page "opens a Bunny link it will not frame at its host: Bunny's older iframe host"; tab "opens a Bunny link it will not frame in a new tab instead of playing it" | yes, with the origin check replaced by `true`: 9 failed, 150 passed |
| credentials are refused | "does not frame a user name and password", "…a user name" | yes, with the user name and password checks removed: 2 failed |
| a fragment is refused | "does not frame a fragment", "…an empty fragment" | yes, with the `#` check removed: 2 failed |
| only `token` and `expires` | "…an extra query key", "…a second token", "…a trailing ampersand", "…no signature", "…a token with no expiry", "…an expiry with no token", "…a token that is not a SHA-256 hex", "…a token in capitals", "…an expiry that is not a number", "opens a Bunny link it will not frame instead of playing it"; session page "opens a Bunny link it will not frame at its host: an extra query key", "…: an unsigned player link" | yes, with the query check replaced by `true`: 12 failed, 147 passed |
| only `/embed/<digits>/<GUID>` | "…the play path", "…a path below the video", "…a library that is not a number", "…a video that is not a GUID", "…no video" | yes, with the path check removed: 5 failed |
| the string checked is the string framed | "…a path the parser rewrites", "…leading white space", "…the default port written out", "…the host in capitals" | yes, with the `href === url` check replaced by `false`: 4 failed |
| `http:` is refused | "does not frame http" | by the module's existing `parse` (https only); failed with every source file at `HEAD` (no Bunny function at all) |
| Bunny's frame attributes | session page "plays a Bunny recording in Bunny's player…", tab frame "is Bunny's player on the very link the API signed", locked page "plays a public Bunny recording…" | yes, with `media-player.tsx` at `HEAD`: 3 failed |
| the YouTube frame is unchanged | session page "keeps the YouTube frame as it was…", tab frame "is YouTube's as it was for a YouTube recording" | yes, with every frame given Bunny's attributes: 2 failed |
| the frame title and the chip in the tab | "plays the newest one in the player…", "offers Oynat on its row, with the platform chip…", "is Bunny's player on the very link the API signed" | yes, with `recordings-tab.tsx` at `HEAD`: 3 failed |
| the frame title on the session page | "plays a Bunny recording in Bunny's player…" | yes, with `session-page.tsx` at `HEAD`: 1 failed |
| the frame title on the locked page | "plays a public Bunny recording…" | yes, with `lesson-locked.tsx` at `HEAD`: 1 failed |
| the reads are not cached | "asks for a course's recordings with no-store", "asks for a session, and its recording, with no-store" | yes, with `public-reads.ts` at `HEAD`: 2 failed |
| the new key exists in every locale | "recordings tab strings › has every key in every locale" (new; `SessionPage` already had one) | yes, with `bunnyFrameTitle` removed from `en/tedris-learn.json`: 1 failed |

Guards that also pass at `HEAD`, on purpose: a refused Bunny link falls back to the link
(`session-page.spec.ts` "opens a Bunny link it will not frame at its host" ×3, `recordings-tab.spec.ts`
"opens a Bunny link it will not frame in a new tab…", `recordings-tab-frame.spec.ts` "is not drawn for a
Bunny link the tab will not frame"), a Bunny-looking link of another provider is not framed, and a Bunny
upload still encoding offers nothing. They held before this change, when no Bunny link was framed; four
of them fail when the origin or the query check is loosened (rows above).

## Not verified

- **A real browser.** Playwright needs the dev stack, and the dev Keycloak realm is not accepting the
  test accounts right now, so no Playwright spec was run and the frame was not seen playing. What is
  known about Bunny's player comes from the measurement on the dev library recorded in
  `docs/migration/mdrs-119-signed-playback.md` (the embed page answers 200 for a signed, in-date link and
  403 for an unsigned, expired or wrong-token one) and from the coordinator's note that the frame needs
  no sandbox attributes to play.
- **"A Bunny player URL copied out of the page stops playing after its `expires`"** (an acceptance
  criterion of the issue): tedris frames the link it is given and keeps no copy; the expiry is Bunny's
  and the API's (MDRS-119), and whether a video already playing stops at `expires` was not verified
  there either.
- **"The page source contains no URL and no Bunny video id of any enrolled-only recording"** for a
  non-enrolled visitor: that is what the API sends (`recording-playback.e2e.spec.ts`, MDRS-119); tedris
  renders only what it receives and was not re-checked in a running stack.
- That Next answers the two pages with a non-cacheable `Cache-Control`: not observed in a running
  server; the pages are per request because they read the viewer's token.
- The Content Security Policy: tedris sends none, and none was added.
