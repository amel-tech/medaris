# 20 Derslerim

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/20-derslerim/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Mevcut rota `/[locale]/learning/my-courses` (apps/tedris/app/[locale]/learning/my-courses/page.tsx, 53 satir); oneri `/[locale]/my-courses`.

## 2. Gosterim
- Baslik `Derslerim`, aciklama `Kayıtlı olduğun dersler, bekleyen başvuruların ve tamamladığın dersler.`, `Takvim aboneliği` linki (23)
- `Devam eden dersler (3 ders)`: kart = Arapca etiket, ad, rozet `Devam ediyor`, kosk/medrese, muderrisler, `İlerlemen %N` cubuk, `Sıradaki celse · 3 Eki Cmt 21:00 · Hafta 5`
- `Başvurularım (1 başvuru onay bekliyor)`: satir = ders, kosk, muderris, `Başvurdun: 28 Eylül 2026. Onaylanınca ders, devam eden derslerine geçer.`, `Onay bekliyor`, `Başvuruyu geri çek`
- `Tamamladığın dersler (1 ders)`: `Ders kadrosu 26 Eylül 2026 tarihinde tamamladığını onayladı.`, `Tamamlandı`, `Ders kayıtlarına git`
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor: kart iskeletleri
- Bos: her bolum icin ayri bos metin (tuvalde YOK, dogrulanamadi); hic ders yoksa Keşfet'e yonlendirme
- Hata: Alert (mevcut kod hatada bos liste dondurur: actions/index.ts:89-93 -> duzeltilecek)
- Yetkisiz: oturumsuz -> giris
- Form yok

## 4. Etkilesimler
- Ders karti -> ders sayfasi (12)
- `Başvuruyu geri çek` -> 08'deki geri cekme
- `Ders kayıtlarına git` -> 24
- `Takvim aboneliği` -> 23

## 5. API
- GET /courses/enrolled: course.controller.ts:79; PENDING kayitlar HARIC: apps/tedrisat/src/course/course.repository.ts:98 -> VAR ama (a) PENDING haric, (b) `sonraki celse` yok, (c) COMPLETED ayrimi `enrollment.status` ile VAR (progress/status: course-response.dto.ts:58-77)
- `Başvurularım`: PENDING kayitlari donmuyor -> `GET /courses/enrolled?status=PENDING` veya yeni `GET /courses/enrollments` (**degisen/yeni endpoint**). Not: kosk sahibi icin `GET /kosks/:koskId/enrollments/pending` var (course.controller.ts:175) ama bu sahip icin, talebeye kapali
- Tamamlanma tarihi/`kadro onayladi`: `completedAt` alani YOK (enrollments tablosu: course.schema.ts:121-136 yalniz createdAt/updatedAt)
- Basvuru geri cek: **YOK** (bkz. 08)
- Sonraki celse: celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex)

## 6. Sinif
**B** - Kayitli dersler hazir; bekleyen/tamamlanan bolumleri, sonraki celse ve geri cekme icin degisen/yeni endpoint gerekir.

## 7. Mevcut durum
- Kismen: apps/tedris/app/[locale]/learning/my-courses/page.tsx + features/courses/components/continue-card.tsx (kayitli dersler, ilerleme karti)
- Eksik: Başvurularım, Tamamladığın dersler, sonraki celse, takvim aboneligi linki

## 8. Kabul kriterleri
1. Ders `ENROLLED` ise `Devam eden`, `PENDING` ise `Başvurularım`, `COMPLETED` ise `Tamamladığın` bolumunde gorunur
2. Sayaclar (`3 ders`, `1 başvuru onay bekliyor`) liste uzunluguyla tutarlidir
3. Ilerleme cubugu %N, erisilebilir `progressbar` etiketiyle
4. Geri cekilen basvuru listeden aninda kalkar
5. Tamamlanma metni kadro onay tarihini gosterir

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Bolum ayirma fonksiyonu (status -> bolum)
2. Sayac metinleri (tekil/cogul)

**Playwright e2e (gercek API):**
1. Seed: 3 ENROLLED, 1 PENDING, 1 COMPLETED -> uc bolum dogru
2. `Başvuruyu geri çek` -> bolum bosalir
3. Karta tikla -> 12
4. `Takvim aboneliği` -> 23

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
