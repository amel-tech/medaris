The talebe's card for one oturum (B7, B8): its state, its time in both zones, the platform, and the primary "Derse katıl", with the meeting link behind a disclosure. Every session state has its drawing, and a viewer who may not join sees why and their one action.

```jsx
<SessionJoin state="upcoming" startsAt="2026-10-10T21:00:00+03:00" durationMinutes={60}
  courseTimeZone="Europe/Istanbul" platform="google-meet" href={session.meetingUrl} actions={calendarMenu} />
<SessionJoin state="live" startsAt="2026-10-10T21:00:00+03:00" durationMinutes={60}
  courseTimeZone="Europe/Istanbul" platform="zoom" href={session.meetingUrl}
  linkUpdatedAt={session.linkUpdatedAt} />
<SessionJoin state="ended" startsAt="2026-10-03T21:00:00+03:00" recordingsHref="/kurs/bina-ve-izhar-serhi/kayitlar" />
<SessionJoin state="live" startsAt="2026-10-10T21:00:00+03:00" access="locked"
  action={<Button href="/kurs/bina-ve-izhar-serhi/kaydol" size="large" fullWidth>Kursa kaydol</Button>} />
```

## Anatomy (HTML)

```html
<section class="mds-join" aria-labelledby="j1-t j1-at">
  <header class="mds-join__header">
    <p class="mds-eyebrow" id="j1-t">Canlı ders</p>
    <span class="mds-badge mds-badge--live"><span class="mds-badge__dot" aria-hidden="true"></span>Şu an canlı</span>
    <div class="mds-join__actions"><!-- actions: rendered only when passed; the calendar menu goes on an upcoming session --></div>
  </header>
  <p class="mds-join__time"><time id="j1-at" datetime="2026-10-10T21:00:00+03:00">10 Ekim Cumartesi 21:00 İstanbul</time><span><span class="mds-sep" aria-hidden="true">·</span><span class="mds-join__zone">20:00 senin saatinle</span></span><span><span class="mds-sep" aria-hidden="true">·</span><time class="mds-join__zone" datetime="PT60M">60&nbsp;dk</time></span></p>
  <span class="mds-platform-chip mds-platform-chip--zoom"><span class="mds-platform-chip__dot" aria-hidden="true"></span>Zoom</span>
  <div class="mds-join__action">
    <a class="mds-btn mds-btn--primary mds-btn--large mds-btn--full mds-join__link" href="https://zoom.us/j/81234567890" target="_blank" rel="noopener noreferrer">Derse katıl<span class="mds-visually-hidden"> (yeni sekmede açılır)</span></a>
    <details class="mds-join__reveal"><summary>Bağlantıyı göster</summary><p class="mds-join__url" dir="ltr">https://zoom.us/j/81234567890</p></details>
  </div>
  <p class="mds-join__notice">Bağlantı dün güncellendi.</p>
</section>
<!-- no button: a neutral line stands in its place -->
<p class="mds-join__status">Bağlantı henüz eklenmedi.</p>
<!-- locked: the reason, then the action slot -->
<div class="mds-join__action"><p class="mds-join__status mds-join__status--locked">Bu oturumun bağlantısı kayıtlı talebelere açıktır.</p><!-- action --></div>
```

In the time line each `.mds-sep` shares a `<span>` with the part after it, so a wrapped line never ends on a dot. The card renders the badge, chip and button markup itself (MDS-COMP-06); `.mds-join__link::after` is the `externalLink` mask and `.mds-join__status--locked::before` the `lock` mask. Without a fixed `now` it re-renders every 30 seconds, so the countdown and the join window move on an open page.

## States

- **upcoming** — a `secondary` badge holding the countdown in `<time>`, from `Intl.RelativeTimeFormat` ("14 dakika sonra", "2 saat sonra", "yarın", "7 gün sonra"). The chip shows; the button and the link appear `joinWindowMinutes` (10, a draft rule) before the start, and until then the status line says when.
- **live** — the `live` badge with its dot; chip, button, disclosure.
- **no link yet** — upcoming or live without `href`: "Bağlantı henüz eklenmedi." in place of the button, and no chip.
- **link changed** — within 24 hours of `linkUpdatedAt`: "Bağlantı dün güncellendi." or "bugün", under the button.
- **ended** — the `ghost` badge "Sona erdi"; no chip or button; a secondary "Ders kayıtlarına git" when `recordingsHref` is set.
- **cancelled** — the `outline` badge "İptal edildi" and the line "Bu oturum iptal edildi."; no chip, button or link.
- **locked** (`access`) — the state and the time stay; `lockedReason` with the lock, then `action`: "Başvurmak için giriş yap", "Kayıt başvurusu yap" or "Kursa kaydol" from the status map, none while pending. No platform, host or link.
- The button's hover, focus and busy states are Button's; the disclosure's focus is `--ring-focus`.

## A11y contract

- A `section` named by its eyebrow and its start ("Canlı ders 10 Ekim Cumartesi 21:00 İstanbul"), so two cards on one page are two distinct regions. The join link opens a new tab and says so to screen readers ("yeni sekmede açılır").
- The meeting link is text in a native `details` (`summary` "Bağlantıyı göster"), `dir="ltr"`, in mono; there is no copy button.
- The start is a `<time datetime>` in the course's zone with its city, then the viewer's time; the countdown sits in its own `<time>`. The live badge's dot is `aria-hidden`: the words carry the state.
- The status line is a plain paragraph (16.19:1), not a disabled button: a viewer who cannot act sees why (MDS-A11Y-07).
- In forced colours the status line gains a border and the glyphs take system colours. The ring's colour is OPEN-1.

## Rules

MDS-DOM-02, MDS-DOM-03, MDS-DOM-04, MDS-DOM-05, MDS-COL-01, MDS-COL-03, MDS-COL-06, MDS-COMP-03, MDS-COMP-06, MDS-STAT-01, MDS-NUM-01, MDS-TYPE-07, MDS-VOICE-01, MDS-VOICE-04, MDS-VOICE-05, MDS-A11Y-06, MDS-A11Y-07, MDS-A11Y-08.

- The join action is the primary "Derse katıl", never platform-coloured; named, it is "{Platform} ile katıl" through `joinLabel`.
- Calendar actions ("Takvime ekle") in `actions` belong to an upcoming session, not a live or ended one, and point at the session page, never at the meeting link.
- The link belongs to the oturum: pass this session's link, never a course-level one.
- A banned talebe does not get this card; the page says "Bu kursa erişimin kaldırıldı." instead.
- Both zones print when the course's differs from the viewer's; Nizam passes `localTimeLabel="sizin saatinizle"`.

## From #95

No #95 component: the join card of `docs/kits/tedris/LiveLessonScreen.jsx`, whose platform-coloured button becomes the primary "Derse katıl" (`pr95-migration/pr95-map.json#tokens.--platform-meet`, `--platform-zoom`, `--platform-jitsi`).
