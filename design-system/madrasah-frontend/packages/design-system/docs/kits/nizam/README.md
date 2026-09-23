# Nizam UI kit

Recreation of the müderris-facing management app, from the team's screenshots of the live
product. Composes the design-system components — no primitive is re-implemented here.

## Screens

| file | screen |
|---|---|
| `Shell.jsx` | sidebar (İçerik nav, user card, Türkçe) + rounded panel with breadcrumb bar; also `NzHead` |
| `DecksScreen.jsx` | Desteler list (`DataTable` + `Toast`) and Deste detail (Ön/Arka yüz, Arabic in Amiri) |
| `KosksScreen.jsx` | Köşkler grid, and Köşk detail with course cards + Yayında/Taslak badges |
| `CourseEditScreen.jsx` | Kursu Düzenle: form sections, live-lesson curriculum, right-hand preview + settings |

`index.html` wires them into a click-through: Köşkler → köşk → course card →
Kursu Düzenle; Desteler → deste detail.

## Notes

- **Only live lessons** are authorable, matching current project scope — the curriculum
  editor offers "Canlı ders ekle" and nothing else.
- `LiveLessonEditor` (inside `CourseEditScreen.jsx`) is the inline editor that opens on
  "Canlı ders ekle": title, gün/saat/süre, meeting URL, and the **müzakere akışı** agenda rows.
- There is **no platform picker**. `resolvePlatform` derives Meet/Zoom/Jitsi from the URL
  and shows it as a confirmation chip. Adding a platform = one entry in that map.
- Green (`variant="create"`) is used only for "Yeni Ders Aç" and "Canlı dersi kaydet".
