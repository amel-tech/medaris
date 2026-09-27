# Design sources

The original high-fidelity design exploration this system was extracted from. Kept as
**provenance**, not as a component library — do not import from here.

Open `../index.html` to view them all on the pannable canvas.

| file | what it holds |
|---|---|
| `design-canvas.jsx` | the canvas shell (`DCSection` / `DCArtboard`) |
| `shared.jsx` | the original inline icon set, tokens and helpers, before extraction |
| `kosk-list.jsx` | Tedris: köşk discovery listing |
| `kosk.jsx` | Tedris: köşk detail with its course list |
| `course.jsx` | Tedris: course detail + full-syllabus modal |
| `lesson.jsx` | Tedris: study screens per content type, incl. the live-lesson variants |
| `new-course.jsx` | Nizam: new-course creation flow |
| `nizam.jsx` | Nizam: Desteler, Köşkler, Kursu Düzenle |
| `tedris-alt.jsx` | Tedris: sidebar layout alternative |
| `tedris-layouts.jsx` | Tedris: layout direction explorations |
| `nizam-layouts.jsx` | Nizam: layout direction explorations |

The maintained recreations live in `../ui_kits/tedris/` and `../ui_kits/nizam/` and are
built from the design-system components. Prefer those when building something new.
