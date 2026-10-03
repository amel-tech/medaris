# 16 Celse sayfasi - su an canli

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/16-celse-sayfasi-su-an-canli/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota 15 ile ayni. Celse suan yayinda.

## 2. Gosterim
- Kirinti `{Kosk} / {Ders} / {Celse}`; `HAFTA N`, celse basligi, rozet `CANLI DERS`
- Toplanti saglayicisi etiketi (`Zoom`): libs/utils/src/meeting-platform.ts:47 `resolveMeetingPlatform` mevcut
- `Celse akışı` (`Saatler İstanbul saatiyle.` + saat/adim listesi, lessons.agenda: course.schema.ts:74)
- `ÖNCEKİ CELSE` / `SONRAKİ CELSE` kartlari (ad, hafta, tarih)
- Yan: `Müderris` karti (AK, `İmam`), `Müfredat` hafta akordeonu (12 ile ayni)
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya
- Durum: `Şu an canlı`, `60 dk · 14 dakikadır sürüyor`; `Celseye katıl` etkin
- `Canlı yayın burada oynar` / `Canlı yayın`: `Yayını buradan izleyebilirsin. Soru sormak ve konuşmaya katılmak için celseye katıl.` (gomulu oynatici)
- Müfredatta `Sıradaki · Şu an canlı` rozeti

## 3. Durumlar
- Yukleniyor/hata: 15 ile ayni
- Yayin URL'i yok: oynatici yerine bilgi (tuvalde yok, dogrulanamadi)
- Sure asildiysa (60 dk + tolerans) durum `sona erdi`ye duser (tolerans dogrulanamadi)

## 4. Etkilesimler
- `Celseye katıl` -> toplanti baglantisi yeni sekme
- Oynatici: gomulu yayin (saglayici dogrulanamadi)
- Rozet her dakika guncellenir (polling/zamanlayici)

## 5. API
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> celse verisi buradan alinabilir (tek celse endpoint'i YOK): celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)
- Onceki/sonraki celse, durum (`yaklaşan/canlı/sona erdi/iptal`), sure dk: **YOK - yeni** `GET /courses/:courseId/sessions/:sessionId` -> `{id,title,weekNumber,startsAt,durationMinutes,status:'SCHEDULED|LIVE|ENDED|CANCELLED',cancelReason,replacementSessionId,agenda[],resources[],meetingUrl|null,platform,recordingUrl|null,previous,next}`
- Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)
- Gomulu canli yayin URL'i/saglayicisi: apps/tedrisat altinda alan YOK -> `liveStreamUrl` eklenecek; saglayici belirtilmemis (YouTube Live gerekiyorsa Google API anahtari = C'ye kayar, dogrulanamadi)

## 6. Sinif
**B** - Canli durum zamandan turetilir; yayin URL alani eklenir. Saglayici YouTube/Google API istiyorsa yayin kismi C olur; bu belgede dogrulanamadi.

## 7. Mevcut durum
- Kismen: apps/tedris/features/courses/components/lesson-page.tsx (364 satir) + live-status-badge.tsx + apps/tedris/app/[locale]/courses/[courseId]/lessons/[lessonId]/page.tsx (live-status-badge.tsx durum rozeti; `statusLive` tedris.json:265)
- Eksik: gomulu oynatici, sure sayaci

## 8. Kabul kriterleri
1. scheduledAt <= simdi < scheduledAt+sure iken rozet `Şu an canlı` ve `N dakikadır sürüyor` dogru
2. Oynatici yalniz yayin URL'i varsa gorunur
3. Kayitsiz kullanici bu sayfada baglanti/yayin gormez (19)
4. Sayfa acikken dakika sayaci guncellenir

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Canli durum hesabi (sinirlar)
2. Sure metni `14 dakikadır sürüyor`

**Playwright e2e (gercek API):**
1. Seed: baslangic = simdi-14 dk -> `Şu an canlı`
2. `Celseye katıl` tikla -> yeni sekme URL'i
3. Kayitsiz kullanici -> 19

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
