The platform behind a link: a meeting platform (Google Meet, Zoom, Jitsi Meet) or a recording provider (YouTube, Google Drive). Its name in neutral text; a meeting adds an 8px decorative dot.

```jsx
<PlatformChip platform="zoom" />
<PlatformChip platform="unknown" host="toplanti.ornek.org" />
<PlatformChip platform="youtube" kind="recording" />
<PlatformChip platform={resolveMeetingPlatform(link).id} detected />
```

## Anatomy (HTML)

```html
<span class="mds-platform-chip mds-platform-chip--zoom"><span class="mds-platform-chip__dot" aria-hidden="true"></span>Zoom</span>
<span class="mds-platform-chip mds-platform-chip--unknown"><span class="mds-platform-chip__dot" aria-hidden="true"></span>Bilinmeyen platform<span class="mds-platform-chip__host" dir="ltr">toplanti.ornek.org</span></span>
<span class="mds-platform-chip mds-platform-chip--youtube">YouTube</span>
<span class="mds-platform-chip mds-platform-chip--unknown"><span class="mds-platform-chip__host" dir="ltr">video.ornek.org</span></span>
<span class="mds-platform-chip mds-platform-chip--jitsi" role="status"><span class="mds-platform-chip__dot" aria-hidden="true"></span>Jitsi Meet<span class="mds-visually-hidden">, bağlantıdan algılandı</span></span>
```

The modifier is the platform id; the dot reads `--icon-platform-<id>`, or `--icon-neutral-disabled` for an id without a token. Labels default to `content/meeting-platforms.json` and `content/recording-providers.json`. An unknown recording host with no `host` renders nothing.

## States

- **meeting / recording** (`kind`) — the dot for a meeting only.
- **unknown** — a meeting reads "Bilinmeyen platform" and its host; a recording shows its host alone.
- **detected** — the inline link editor's live readout: `role="status"` and ", bağlantıdan algılandı" for screen readers. Keep it mounted while the field changes, so the change is announced.
- Not interactive: no hover, focus or disabled.

## A11y contract

- The name carries the meaning (16.19:1 on its ground); the dot is `aria-hidden` decoration (meet 4.58, zoom 3.36, jitsi 5.42:1 on the chip).
- The host is `dir="ltr"` in mono (6.90:1).
- In forced colours the transparent border draws the chip and the dot stays, in `CanvasText`.

## Rules

MDS-COL-06, MDS-DOM-03, MDS-DOM-04, MDS-TOK-04, MDS-TYPE-01, MDS-TYPE-07, MDS-SHAPE-01, MDS-A11Y-08, MDS-COMP-01.

- The app resolves the platform from the link's host (`resolveMeetingPlatform` in `libs/utils`); the chip never parses a URL, and nobody picks a platform by hand.
- Never a vendor colour behind text. What the brief's "branded" chips mean is SPEC-D3-18; this is its default.
- "Bilinmeyen platform" is for meeting links only: a talebe reads "unknown" beside a recording as a warning.
- A chip is not a button and not a filter: a clickable choice is ChoiceChips.

## From #95

No #95 component: the kits drew the platform inline (`docs/kits/tedris/LiveLessonScreen.jsx`). Its colours map at `pr95-migration/pr95-map.json#tokens.--platform-meet`, `--platform-zoom` and `--platform-jitsi`.
