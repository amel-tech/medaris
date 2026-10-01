# 18 Celse sayfasi - iptal edildi

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/18-celse-sayfasi-iptal-edildi/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Rota 15 ile ayni. Iptal edilmis celse + telafi baglantisi.

## 2. Gosterim
- Kirinti `{Kosk} / {Ders} / {Celse}`; `HAFTA N`, celse basligi, rozet `CANLI DERS`
- Toplanti saglayicisi etiketi (`Zoom`): libs/utils/src/meeting-platform.ts:47 `resolveMeetingPlatform` mevcut
- `Celse akışı` (`Saatler İstanbul saatiyle.` + saat/adim listesi, lessons.agenda: course.schema.ts:74)
- `ÖNCEKİ CELSE` / `SONRAKİ CELSE` kartlari (ad, hafta, tarih)
- Yan: `Müderris` karti (AK, `İmam`), `Müfredat` hafta akordeonu (12 ile ayni)
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya
- Uyari: `Bu celse iptal edildi` + `Telafi celsesi: 7 Ekim Çarşamba 21:00. Telafi celsesine git`
- Durum `İptal edildi`; `Bu celse için toplantı bağlantısı yok.`
- Akis ve onceki/sonraki kartlari korunur

## 3. Durumlar
- Yukleniyor/hata: standart
- Telafi yoksa uyari yalniz `Bu celse iptal edildi`
- Yetkisiz: 19

## 4. Etkilesimler
- `Telafi celsesine git` -> telafi celse sayfasi
- Takvime ekle YOK (iptal)

## 5. API
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> celse verisi buradan alinabilir (tek celse endpoint'i YOK): celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)
- Onceki/sonraki celse, durum (`yaklaşan/canlı/sona erdi/iptal`), sure dk: **YOK - yeni** `GET /courses/:courseId/sessions/:sessionId` -> `{id,title,weekNumber,startsAt,durationMinutes,status:'SCHEDULED|LIVE|ENDED|CANCELLED',cancelReason,replacementSessionId,agenda[],resources[],meetingUrl|null,platform,recordingUrl|null,previous,next}`
- Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)
- Iptal ve telafi: `status=CANCELLED`, `replacementSessionId` alanlari **YOK** (celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)); muderris/kadro iptal endpoint'i de YOK (Nazir tarafi: dogrulanamadi)

## 6. Sinif
**B** - Iptal/telafi veri modeli yok: schema + endpoint gerekir.

## 7. Mevcut durum
- Yok: iptal durumu. apps/tedris/features/courses/components/lesson-page.tsx (364 satir) + live-status-badge.tsx + apps/tedris/app/[locale]/courses/[courseId]/lessons/[lessonId]/page.tsx iptal bilmiyor

## 8. Kabul kriterleri
1. Iptal celse `İptal edildi` rozeti ve uyari gosterir
2. Telafi varsa link telafi celsesine gider
3. Iptal celsede toplanti baglantisi/katil dugmesi/`Takvime ekle` yok
4. Iptal celse programda ve takvim feed'inde iptal olarak gorunur (21, 23)

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Durum CANCELLED -> gorunum

**Playwright e2e (gercek API):**
1. Seed: iptal celse + telafi -> uyari ve link
2. Linke tikla -> telafi sayfasi
3. Katil dugmesi yok

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
