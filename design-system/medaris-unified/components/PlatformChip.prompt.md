The platform behind a link: a meeting platform (Google Meet, Zoom, Jitsi Meet) or a recording provider (YouTube, Google Drive). Its name in ink on a paper tag; a meeting adds an 8px decorative dot.

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

- The chip is 24px tall with 8px inline padding, `--radius-tag` (4px), a `--background-neutral-surface` fill and a `--border-neutral-subtle` hairline. The name is 13px, 500, `--text-neutral-default`, on one line.
- The modifier is the platform id. The dot reads `--icon-platform-<id>`; an id without a token (`unknown`) gets `--icon-platform-unknown`.
- The host is `--font-mono` at 400 in `--text-neutral-subtle`, and ends in an ellipsis when the chip runs out of room.
- Labels default to `content/meeting-platforms.json` and `content/recording-providers.json`. An unknown recording host with no `host` renders nothing.

## States

- **meeting / recording** (`kind`): the dot is for a meeting only.
- **unknown**: a meeting reads "Bilinmeyen platform" and its host; a recording shows its host alone.
- **detected**: the inline link editor's live readout. `role="status"`, and ", bağlantıdan algılandı" for screen readers. Keep it mounted while the field changes, so the change is announced.
- Not interactive: no hover, focus or disabled.

## A11y contract

- The name carries the meaning: 16.60:1 by day and 13.34:1 at night on the chip. The host is 6.81 and 5.09:1 (`contrast.md`).
- The dot is `aria-hidden` decoration that repeats the printed name (`contrast.md`, "Not required"). It is never the only sign of the platform.
- The host is `dir="ltr"`, so a URL keeps its order inside Arabic text.
- In forced colours the hairline stays as the chip's edge and the dot is `CanvasText`.

## Rules

MDS-COL-06, MDS-DOM-03, MDS-DOM-04, MDS-TOK-04, MDS-TYPE-01, MDS-TYPE-07, MDS-SHAPE-01, MDS-A11Y-08, MDS-COMP-01.

- The app resolves the platform from the link's host (`resolveMeetingPlatform` in `libs/utils`). The chip never parses a URL, and nobody picks a platform by hand.
- Never a vendor colour behind text.
- "Bilinmeyen platform" is for meeting links only: a talebe reads "unknown" beside a recording as a warning.
- A chip is not a button and not a filter. A clickable choice is ChoiceChips.
