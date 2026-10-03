# 15 Celse sayfasi - yaklasan (B7)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/15-celse-sayfasi-yaklasan-b7/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Mevcut rota `/[locale]/courses/[courseId]/lessons/[lessonId]` (apps/tedris/app/[locale]/courses/[courseId]/lessons/[lessonId]/page.tsx, 20 satir). Kayitli talebe, celse henuz baslamadi.

## 2. Gosterim
- Kirinti `{Kosk} / {Ders} / {Celse}`; `HAFTA N`, celse basligi, rozet `CANLI DERS`
- Toplanti saglayicisi etiketi (`Zoom`): libs/utils/src/meeting-platform.ts:47 `resolveMeetingPlatform` mevcut
- `Celse akışı` (`Saatler İstanbul saatiyle.` + saat/adim listesi, lessons.agenda: course.schema.ts:74)
- `ÖNCEKİ CELSE` / `SONRAKİ CELSE` kartlari (ad, hafta, tarih)
- Yan: `Müderris` karti (AK, `İmam`), `Müfredat` hafta akordeonu (12 ile ayni)
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya
- Durum bandi: `8 dakika sonra`, `Takvime ekle`; tarih `3 Ekim Cumartesi 21:00`, `60 dk`
- Katilim: `Zoom` + `Celseye katıl` (yeni sekmede acilir) + `Bağlantıyı göster` (baglanti metni acilir) + `Bağlantı bugün eklendi.`; baglanti yoksa `Toplantı bağlantısı henüz eklenmedi.`
- Katilim kurali: `Katılım, celse başlamadan 10 dakika önce açılır.` (22 ekraninda yazili) - dugme o ana dek disabled

## 3. Durumlar
- Yukleniyor: iskelet
- Yetkisiz: kayit yoksa 19
- Hata/404: 38
- Baglanti yok: bilgi kutusu, katil dugmesi yok
- Katilim penceresi acik degil: dugme disabled + aciklama

## 4. Etkilesimler
- `Takvime ekle` -> 22 menusu
- `Celseye katıl` -> meetingUrl yeni sekmede (rel=noopener)
- `Bağlantıyı göster` -> baglantiyi gosterir/kopyalar (mevcut kod: lesson-page.tsx Copy ikonu)
- Onceki/Sonraki celse kartlari -> ilgili celse

## 5. API
- GET /courses/:id: course.controller.ts:92 (CourseDetailResponse: weeks[].lessons[] icinde scheduledAt, meetingUrl, agenda, isPreview, duration, kaynak; apps/tedrisat/src/course/dto/course-response.dto.ts:8-45) -> celse verisi buradan alinabilir (tek celse endpoint'i YOK): celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)
- Onceki/sonraki celse, durum (`yaklaşan/canlı/sona erdi/iptal`), sure dk: **YOK - yeni** `GET /courses/:courseId/sessions/:sessionId` -> `{id,title,weekNumber,startsAt,durationMinutes,status:'SCHEDULED|LIVE|ENDED|CANCELLED',cancelReason,replacementSessionId,agenda[],resources[],meetingUrl|null,platform,recordingUrl|null,previous,next}`
- Sunucu tarafi kilit: kayitsiz/PENDING/erisimi kaldirilmis kullaniciya meetingUrl, agenda, kaynak ve ders-kaydi URL'leri DONMEMELI (bugun donuyor: meetingUrl maskelenmeden doner: apps/tedrisat/src/course/course.repository.ts:190 ve :359 (kayitsiz/PENDING kullaniciya da); celse kilidi sunucuda YOK)

## 6. Sinif
**B** - Celse verisi detay icinde var ama durum, onceki/sonraki, katilim penceresi ve maskeleme icin yeni/degisen endpoint gerekir.

## 7. Mevcut durum
- Kismen: apps/tedris/features/courses/components/lesson-page.tsx (364 satir) + live-status-badge.tsx + apps/tedris/app/[locale]/courses/[courseId]/lessons/[lessonId]/page.tsx (toplanti baglantisi kopyalama, platform cozumleme, LiveStatusBadge)
- Eksik: onceki/sonraki kartlari, 10 dk katilim kurali, takvim menusu

## 8. Kabul kriterleri
1. Kayitli kullanici celse sayfasinda tarih, sure, akis ve (varsa) baglantiyi gorur
2. Celse baslamadan 10 dakikadan once `Celseye katıl` etkin degildir
3. Goreli zaman rozeti dakika/gun olarak dogru hesaplanir
4. Onceki/sonraki karti dogru celseleri gosterir (iptaller dahil)
5. Baglanti yoksa katil dugmesi yok, bilgi metni var

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Goreli zaman: 8 dk, 3 gun
2. Katilim penceresi: T-11 dk disabled, T-10 dk enabled
3. Platform etiketi (zoom/meet/diger)

**Playwright e2e (gercek API):**
1. Seed: 8 dk sonrasi celse + Zoom URL -> sayfada `Zoom`, buton disabled/enabled saat sinirinda
2. `Bağlantıyı göster` -> URL gorunur
3. Onceki kart -> onceki celse sayfasi
4. Kayitsiz kullanici -> 19

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
