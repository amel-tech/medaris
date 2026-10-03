# Tedris brought in line with the Tedris screens design

Date: 3 October 2026. Design source: the "Medaris Ekranları — Tedris" artifact
(58 screens), compared screen by screen and state by state against
`tedris-web` at the same width (1440 and 390 px).

## What changed

- **Shell.** At 768 px and up every page that loads the system stylesheet now
  draws the design's top bar (`components/phone-menu/desktop-bar.tsx`): the
  Medaris wordmark, Ana sayfa · Keşfet · Derslerim · Programım · Desteler, the
  bell and the person's initials; a visitor gets Ana sayfa · Keşfet, Giriş yap,
  Kayıt ol. The legacy "Online Madrasah" header and tab row are hidden at every
  width there (they were hidden only below 768). The phone AppBar now also
  reaches the course, session, account and notification pages and the
  not-found page, which still drew the legacy header on a phone. A course page
  is Derslerim's for its talebe and Keşfet's for everyone else, and its phone
  bar carries the course's (or the session's) title. The site title is
  "Medaris Tedris".
- **Live session.** Ana sayfa's "Sıradaki celse" is the kit's join card; while
  the celse is on air the greeting says "<ders> celsesi şu an canlı.", and the
  card shows "Şu an canlı", how long it has run, the platform, "Celseye katıl"
  and "Bağlantıyı göster". The course card and the session page's programme
  put the celse on air first (the course card skipped it; the programme picked
  the first week in order rather than the nearest celse in time). Programım
  marks a live row "Şu an canlı" with "Celseye katıl". No "Takvime ekle" on a
  live celse.
- **Covers** use the course's `coverHue` and print the Arabic of its
  `coverLabel` (الصرف), not the upper-cased category over an id-derived
  colour. `toneOfHue`, `TONE_HUE`, `COVER_LABELS` and `arabicOfCoverLabel`
  moved from nizam into `@medaris/ui/mds/cover-pattern`; nizam re-exports them.
- **Course page.** One müderris is drawn with initials, "Müderris <ad>" and the
  title chip. The talebe's card has the "···" menu ("Diğer işlemler") holding
  "Dersten ayrıl", whose confirmation now uses the design's words; the
  separate "Dersten ayrıl" link is gone. A completed course says "Bu dersi
  tamamladın." with the date the team confirmed it and "Celse sayfasını aç". On
  a phone the course's cards sit between its header and its tabs. "Başvurun
  bugün 10:02’de …" gains the locative.
- **Derslerim.** Each ongoing course has the same "···" menu, and courses whose
  access was withdrawn are listed under "Erişiminin kaldırıldığı dersler".
  `GET /courses/enrolled` takes `includeRevoked=true` for that (tedrisat,
  spec and client regenerated).
- **Session page.** An ended celse without a recording shows the "Ders kaydı"
  card with "Bu celsede henüz ders kaydı yok."; a cancelled celse without a
  make-up says "Müderris yeni bir zaman belirlerse onu Programım’da
  görürsün."; a locked celse waiting for approval shows the "Onay bekliyor"
  badge and "Başvurun onaylanınca bu celseye katılabilirsin." instead of a
  disabled button.
- **Hesap.** The sign-out card has its (visually hidden) "Çıkış" heading.

## Verified

- Full gate in the worktree (typecheck, lint, module-boundaries, build, test);
  the counts are in the pull request.
- Side by side in Chrome at 1440 and 390 px against the design, with the
  sample data of `local_docs/tasarim-kontrol`: Ana sayfa (live), the course
  page (talebe, live session), its phone layout.

## Not verified, and follow-ups

- "Bağlantı bugün eklendi." is not drawn: the API has no time for when a
  meeting link was set. Needs a `meetingUrlUpdatedAt` on the session.
- The medrese page's courses and the followed-köşk rows print no Arabic cover
  label: `MadrasahCourseResponse`, `FollowedKoskCourseResponse` and
  `MadrasahExploreCourseResponse` carry no `coverLabel`.
- A signed-out visitor on an unknown address is still sent to sign in, not
  shown the 404 (design Sistem404, ziyaretçi). Fixing it means the middleware
  telling unknown paths from protected ones; a hand-kept list of protected
  routes would expose any route later added without updating it, so it is
  left for a deliberate change.
- The "Aydınlatma Metni" footer (MDRS-102) is not in the design and is kept: it
  is the privacy notice every page must link.
- Hesap's "Herkese açık profil" card is marked "sonraki faz" in the design but
  links a working page (MDRS-166); it is kept until that is decided.
- Not compared for lack of sample data: the recordings tab, the preview
  (draft) page, the reader views of someone else's deck, the staff account,
  403 and the error page.
