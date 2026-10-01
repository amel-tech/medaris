# 17 Celse sayfasi - sona erdi, ders kaydi var

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/17-celse-sayfasi-sona-erdi-ders-kaydi-var/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota 15 ile ayni. Bitmis celse + kayit videosu.

## 2. Gosterim
- Kirinti `{Kosk} / {Ders} / {Celse}`; `HAFTA N`, celse basligi, rozet `CANLI DERS`
- Toplanti saglayicisi etiketi (`Zoom`): libs/utils/src/meeting-platform.ts:47 `resolveMeetingPlatform` mevcut
- `Celse akışı` (`Saatler İstanbul saatiyle.` + saat/adim listesi, lessons.agenda: course.schema.ts:74)
- `ÖNCEKİ CELSE` / `SONRAKİ CELSE` kartlari (ad, hafta, tarih)
- Yan: `Müderris` karti (AK, `İmam`), `Müfredat` hafta akordeonu (12 ile ayni)
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya
- Oynatici `Ders kaydı burada oynar`: baslik `{celse}: celse kaydı`, `Ders kaydı · 26 Eylül 2026 Cumartesi · 58 dk`
- Durum `Sona erdi`, `26 Eylül Cumartesi 21:00 · 60 dk`, `Ders kayıtlarına git` linki (24)
- Akordeonda biten celse satirlarinda `, sona erdi`

## 3. Durumlar
- Yukleniyor/hata: standart
- Kayit yok: oynatici gizli, `Ders kayıtlarına git` yok (tuvalde yok, dogrulanamadi)
- Yetkisiz: kayitsiz -> 19 (kayit yalniz kayitlilara; isPreview haric)

## 4. Etkilesimler
- Oynatici: oynat/duraklat (saglayici dogrulanamadi)
- `Ders kayıtlarına git` -> 24
- Onceki/sonraki celse kartlari

## 5. API
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> celse verisi buradan alinabilir (tek celse endpoint'i YOK): celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)
- Onceki/sonraki celse, durum (`yaklaşan/canlı/sona erdi/iptal`), sure dk: **YOK - yeni** `GET /courses/:courseId/sessions/:sessionId` -> `{id,title,weekNumber,startsAt,durationMinutes,status:'SCHEDULED|LIVE|ENDED|CANCELLED',cancelReason,replacementSessionId,agenda[],resources[],meetingUrl|null,platform,recordingUrl|null,previous,next}`
- Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)
- Ders kaydi: `recordingUrl/recordingDuration/recordedAt` alani YOK (celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)); kaydin nereye yuklenecegi (kendi depolama mi, YouTube mu) dogrulanamadi

## 6. Sinif
**B** - Kayit alani + maskeleme icin yeni/degisen endpoint. Kayit barindirma saglayicisi YouTube/Google API ise o kisim C olur; dogrulanamadi.

## 7. Mevcut durum
- Kismen: apps/tedris/features/courses/components/lesson-page.tsx (364 satir) + live-status-badge.tsx + apps/tedris/app/[locale]/courses/[courseId]/lessons/[lessonId]/page.tsx (VIDEO/DOCUMENT turleri ve LessonTypeIcon: syllabus.tsx)
- Eksik: ders kaydi oynatici ve kayit meta verisi

## 8. Kabul kriterleri
1. Biten celse `Sona erdi` gosterir
2. Kayit varsa oynatici ve `{tarih} · {dk}` meta gorunur
3. Kayit yalniz kayitli talebeye (veya isPreview) acilir
4. `Ders kayıtlarına git` 24'e gider

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Durum: biten celse
2. Kayit meta bicimi

**Playwright e2e (gercek API):**
1. Seed: bitmis celse + recordingUrl -> oynatici gorunur
2. Kayitsiz kullanici -> kayit gorunmez
3. Link -> 24

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
