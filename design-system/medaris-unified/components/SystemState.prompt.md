A page that is only a state: not found, forbidden, an error, no role, or the device restriction. A list with nothing in it is an `EmptyState`.

```jsx
<SystemState
  kind="not-found"
  title="Sayfa bulunamadı"
  action={<Button href="/" variant="secondary">Ana sayfaya dön</Button>}
>
  Aradığın sayfa taşınmış ya da kaldırılmış olabilir.
</SystemState>

<SystemState kind="restricted" title="Erişim kısıtlandı" logo={<Logo size="lg" />}>
  Bu bilgisayar erişim kısıtlamasına alınmıştır. Lütfen sistem yöneticisiyle görüşün.
</SystemState>

<SystemState kind="no-role" shell title="Yönetim yetkiniz yok">
  Bir rol için köşk yöneticinize ya da sistem yöneticisine yazın.
</SystemState>
```

## Anatomy (HTML)

```html
<!-- no app chrome: it is the page's main -->
<main class="mds-system-state mds-system-state--page" aria-labelledby="ss-t">
  <span class="mds-logo mds-logo--lg" role="img" aria-label="Medaris">…</span> <!-- logo -->
  <h1 class="mds-h4" id="ss-t">Erişim kısıtlandı</h1>
  <p class="mds-system-state__text">Bu bilgisayar erişim kısıtlamasına alınmıştır. Lütfen sistem yöneticisiyle görüşün.</p>
</main>

<!-- shell: inside the app shell, which owns <main>; here under the page's h1 -->
<section class="mds-system-state" aria-labelledby="ss-t">
  <h2 class="mds-h5" id="ss-t">Bu sayfaya erişiminiz yok</h2>
  <p class="mds-system-state__text">Bu köşkü yalnızca köşk yöneticileri ve medrese nazırları yönetebilir.</p>
  <a class="mds-btn mds-btn--regular mds-btn--secondary" href="/koskler">Köşklerime dön</a>
</section>
```

- A centred column on the prose measure; `--page` also centres it in the viewport's height.
- The heading is `.mds-h4` at level 1, where it is the page's title, and `.mds-h5` at levels 2 and 3.

## States

- `not-found`, `forbidden`, `error`: B14's 404, 403 and generic error. The 403 inside Nizam (C11) keeps the shell.
- `no-role`: C0, a signed-in user with no role. The Nizam shell stays; its sentence is a draft.
- `restricted`: B15. It renders `<main>` even with `shell`, and no action even when one is passed.

## A11y contract

- One `<main>` per page: without `shell` the state is the main landmark, labelled by its heading; with `shell` it is a labelled section.
- `headingLevel` keeps the outline whole: 1 when the state is the page, 2 under the shell's own page title.
- No live role: the page loads as the state, and nothing is announced over it.

## Rules

MDS-MOD-02, MDS-VOICE-04, MDS-VOICE-01, MDS-VOICE-05, MDS-VOICE-07, MDS-TYPE-03, MDS-A11Y-07, MDS-LAY-03, MDS-COMP-06.

- `restricted` uses the owner's two sentences verbatim and never shows the device mark or the reason; calm, with no chrome and no action. The brief gives no title: "Erişim kısıtlandı" is a draft.
- Refusing one course, köşk or medrese is the inline variant: a neutral `Alert`, not a SystemState.
- An error says what happened and what to do in at most two sentences.
- 404, 403 and error each offer one way back, and only one this viewer can take.

## From #95

None: #95 has no system pages. B14, B15, C0 and C11 come from the launch brief.
