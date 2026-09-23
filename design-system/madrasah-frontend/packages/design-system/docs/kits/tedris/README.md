# Tedris UI kit

Recreation of the talebe-facing learning app. Composes the design-system components —
no primitive is re-implemented here.

## Screens

| file | screen |
|---|---|
| `Shell.jsx` | sidebar + rounded panel chrome, breadcrumb bar |
| `OgrenmeScreen.jsx` | Öğrenme home: "Kaldığın yerden devam et" cards + köşk discovery grid |
| `CourseScreen.jsx` | course detail: hero, sticky enroll card, müfredat, full-syllabus `Dialog` |
| `LiveLessonScreen.jsx` | live lesson: curriculum rail + resolved-platform join card + müzakere akışı |

`index.html` wires them into a click-through: Öğrenme → course card → "Derse devam et" →
live lesson → "Kursa dön".

## Notes

- Only **live** lessons appear, matching current project scope.
- The meeting platform is resolved from the URL by `resolvePlatform` in
  `LiveLessonScreen.jsx`; there is no platform picker on the talebe side.
- The syllabus `Dialog` uses `contained` because the panel is a fixed-size frame.
