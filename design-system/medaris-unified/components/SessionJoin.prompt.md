The talebe's card for one oturum (B7, B8): its state, its time in both zones, the platform, and the primary "Derse katıl", with the meeting link behind a disclosure. Every session state has its drawing, and a viewer who may not join sees why and their one action.

```jsx
<SessionJoin state="live" title="Mehmûz fiiller: kara’e ve emr-i hâzır" startsAt="2026-10-03T21:00:00+03:00"
  durationMinutes={60} courseTimeZone="Europe/Istanbul" platform="zoom" href={session.meetingUrl}
  linkUpdatedAt={session.linkUpdatedAt} />
<SessionJoin state="upcoming" startsAt="2026-10-10T21:00:00+03:00" durationMinutes={60}
  courseTimeZone="Europe/Istanbul" platform="google-meet" href={session.meetingUrl} actions={calendarMenu} />
<SessionJoin state="ended" startsAt="2026-09-26T21:00:00+03:00" recordingsHref="/kurs/emsile-ve-bina/kayitlar" />
<SessionJoin state="live" startsAt="2026-10-03T21:00:00+03:00" access="locked"
  action={<Button href="/kurs/emsile-ve-bina/kaydol" size="large" fullWidth>Kursa kaydol</Button>} />
```

## Anatomy (HTML)

```html
<section class="mds-join" aria-labelledby="j1-h j1-at">
  <header class="mds-join__header">
    <p class="mds-eyebrow" id="j1-t">Canlı ders</p>
    <span class="mds-badge mds-badge--live"><span class="mds-badge__dot" aria-hidden="true"></span>Şu an canlı</span>
    <div class="mds-join__actions"><!-- actions: only when passed; the calendar menu goes on an upcoming session --></div>
  </header>
  <h2 class="mds-join__title" id="j1-h" dir="auto">Mehmûz fiiller: kara’e ve emr-i hâzır</h2>
  <p class="mds-join__time"><time id="j1-at" datetime="2026-10-03T21:00:00+03:00">3 Ekim Cumartesi 21:00 İstanbul</time><span><span class="mds-join__zone">20:00 senin saatinle</span><span class="mds-sep" aria-hidden="true">·</span></span><time class="mds-join__zone" datetime="PT60M">60&nbsp;dk</time></p>
  <span class="mds-platform-chip mds-platform-chip--zoom"><span class="mds-platform-chip__dot" aria-hidden="true"></span>Zoom</span>
  <div class="mds-join__action">
    <a class="mds-btn mds-btn--primary mds-btn--large mds-btn--full mds-join__link" href="https://zoom.us/j/81234567890" target="_blank" rel="noopener noreferrer">Derse katıl<span class="mds-visually-hidden"> (yeni sekmede açılır)</span></a>
    <details class="mds-join__reveal"><summary>Bağlantıyı göster</summary><p class="mds-join__url" dir="ltr">https://zoom.us/j/81234567890</p></details>
  </div>
  <p class="mds-join__notice">Bağlantı bugün güncellendi.</p>
</section>
<!-- no button: a neutral line stands in its place -->
<p class="mds-join__status">Bağlantı henüz eklenmedi.</p>
<!-- locked: the reason, then the action slot -->
<div class="mds-join__action"><p class="mds-join__status mds-join__status--locked">Bu oturumun bağlantısı kayıtlı talebelere açıktır.</p><!-- action --></div>
```

- **Card.** `--background-neutral-surface`, a `--border-neutral-subtle` hairline, `--radius-surface` (10px), padding `--space-inset-card` (24; 16 in a compact region and on a phone), 16px between parts. No shadow.
- **Header.** The eyebrow, then the state badge at the inline end, then `actions` right after the badge. On a narrow card the actions wrap to a second line.
- **Title** (optional). `h2.mds-join__title` in Literata 20/600, `dir="auto"`. `headingLevel` sets its level. Leave it out on the session's own page, where the page title already names the session.
- **Time.** 14px with tabular figures. The first `<time>` is 600 on its own line; the viewer's zone and the duration follow in `--text-neutral-muted`. After the first `<time>`, each part but the last shares a `<span>` with the `.mds-sep` after it, so a wrapped line ends on the dot and never starts with it.
- **Action.** "Derse katıl" is a `large`, `full` primary button: the one ink button in the column. `.mds-join__link::after` is the `externalLink` mask.
- **Disclosure.** The summary is 13/500 `--text-neutral-muted` with a chevron, and underlines on hover. The link inside is mono 13 on a `--background-neutral-sunken` box with `--radius-tag`.
- **Status line.** Where no button stands: at least 48px tall, sunken, `--radius-control`, 14px in ink. `.mds-join__status--locked::before` is the `lock` mask.
- **Notice.** 13px `--text-neutral-subtle`.
- The card renders the badge, chip and button markup itself (MDS-COMP-06). Without a fixed `now` it re-renders every 30 seconds, so the countdown and the join window move on an open page.

## States

- **upcoming**: a `secondary` badge holding the countdown in `<time>`, from `Intl.RelativeTimeFormat` ("14 dakika sonra", "2 saat sonra", "Yarın", "7 gün sonra"), its first letter upper-cased in the page's locale (MDS-VOICE-02). The chip shows. The button and the link appear `joinWindowMinutes` (10, a draft rule) before the start; until then the status line says when.
- **live**: the `live` badge with its dot; chip, button, disclosure.
- **no link yet**: upcoming or live without `href`. "Bağlantı henüz eklenmedi." stands in place of the button, and there is no chip.
- **link changed**: within 24 hours of `linkUpdatedAt`, "Bağlantı dün güncellendi." or "bugün", under the button.
- **ended**: the `ghost` badge "Sona erdi". No chip or button. A large secondary "Ders kayıtlarına git" when `recordingsHref` is set.
- **cancelled**: the `outline` badge "İptal edildi" and the line "Bu oturum iptal edildi.". No chip, button or link.
- **locked** (`access`): the state and the time stay. Then `lockedReason` with the lock, and `action`: "Başvurmak için giriş yap", "Kayıt başvurusu yap" or "Kursa kaydol" from the status map, and none while pending. No platform, host or link.
- The button's hover, focus and busy states are Button's. The disclosure's summary takes the one focus ring.

## A11y contract

- A `section` named by its title (or, without one, its eyebrow) and its start: "Mehmûz fiiller: kara’e ve emr-i hâzır 3 Ekim Cumartesi 21:00 İstanbul". Two cards on one page are two distinct regions.
- The join link opens a new tab and says so to screen readers ("yeni sekmede açılır").
- The meeting link is text in a native `details` (`summary` "Bağlantıyı göster"), `dir="ltr"`, in mono. There is no copy button.
- The start is a `<time datetime>` in the course's zone with its city, then the viewer's time. The countdown sits in its own `<time>`. The live badge's dot is `aria-hidden`: the words carry the state.
- The status line is a plain paragraph, not a disabled button: a viewer who cannot act sees why (MDS-A11Y-07). Its text is 14.48:1 by day and 15.25 at night on the sunken ground (`contrast.md`).
- In forced colours the status line gains a `CanvasText` border, the lock and chevron are `CanvasText`, and the external-link glyph is `LinkText`.

## Rules

MDS-DOM-02, MDS-DOM-03, MDS-DOM-04, MDS-DOM-05, MDS-COL-01, MDS-COL-03, MDS-COL-06, MDS-COMP-03, MDS-COMP-06, MDS-STAT-01, MDS-NUM-01, MDS-TYPE-03, MDS-TYPE-07, MDS-VOICE-01, MDS-VOICE-04, MDS-VOICE-05, MDS-A11Y-01, MDS-A11Y-07, MDS-A11Y-08.

- The join action is the primary "Derse katıl", never platform-coloured. Named, it is "{Platform} ile katıl" through `joinLabel`.
- Calendar actions ("Takvime ekle") in `actions` belong to an upcoming session, not a live or ended one. They point at the session page, never at the meeting link.
- The link belongs to the oturum: pass this session's link, never a course-level one.
- A banned talebe does not get this card; the page says "Bu kursa erişimin kaldırıldı." instead.
- Both zones print when the course's differs from the viewer's. Nizam passes `localTimeLabel="sizin saatinizle"`.
