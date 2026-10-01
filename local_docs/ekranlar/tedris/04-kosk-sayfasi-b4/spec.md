# 04 Kosk sayfasi (B4) - girisli

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/04-kosk-sayfasi-b4/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Mevcut rota `/[locale]/kosks/[koskId]` -> apps/tedris/app/[locale]/kosks/[koskId]/page.tsx (16 satir).

## 2. Gosterim
- Kirinti `Keşfet / Nûruosmaniye Köşkü`; rozet NK, `KÖŞK`, ad, alan (`Arapça dil ilimleri`), `Başlangıç seviyesi · 3 ders`, `Takip ediliyor` dugmesi; aciklama
- `Dersler: Köşkün dersleri ve köşkte açılan medrese dersleri`: satir = Arapca etiket, ders adi, rozet `Devam ediyor` (kayitliysa), muderrisler, medrese dersiyse `Süleymaniye Medresesi dersi`, `Sonraki celse Cmt 21:00`
- `Köşk desteleri`: `Köşkün derslerine kayıtlı talebelere açık`; deste karti `Sarfın temel kelimeleri · Köşk destesi · 60 ezber kartı`, `Koleksiyonunda` rozeti
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor: iskelet
- Bos: ders yok (metin tuvalde YOK, dogrulanamadi)
- Hata: Alert; 404 -> 38
- Yetkisiz: oturumsuz -> 10
- Taslak dersler yalniz kosk sahibine gorunur (course.service.ts:36-39)

## 4. Etkilesimler
- `Takip et/ediliyor` -> follow/unfollow
- Ders satiri -> ders sayfasi
- Deste karti -> deste ayrintisi (31); `Koleksiyonunda` -> koleksiyona ekli bilgisi
- Kirinti -> 02

## 5. API
- GET /kosks/:id: apps/tedrisat/src/kosk/kosk.controller.ts:66 -> VAR (name, field, level, courseCount, isFollowing: kosk-response.dto.ts)
- GET /kosks/:koskId/courses: apps/tedrisat/src/course/course.controller.ts:50 (CourseSummaryResponse: weekCount, lessonCount, muderris, enrollment; lesson/celse listesi yok) -> VAR; `enrollment.status` ile `Devam ediyor` rozeti
- POST /kosks/:id/follow: kosk.controller.ts:125; DELETE /kosks/:id/follow: kosk.controller.ts:138 -> VAR
- `Sonraki celse` her ders icin: **YOK** -> CourseSummaryResponse'a `nextSessionAt` eklenmeli (course-response.dto.ts:111-118'te yok)
- `Süleymaniye Medresesi dersi` rozeti: **YOK** (`medrese` kavrami backend'de YOK: apps/tedrisat/src/database/schema/ altinda (course, kosk, flashcard*) medrese tablosu/alani yok; `grep -ril medrese apps/tedrisat/src` bos) -> `courses.madrasaId`/`madrasaName`
- `Köşk nazımı` (10'da): kosk modelinde ownerId var, ad yok: kosk-response.dto.ts:8 -> **YOK** `ownerName`
- Kosk desteleri (`60 ezber kartı`, `Koleksiyonunda`): kosk-deste iliskisi ve koleksiyon: apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:58 `GET /flashcard/decks/collections` var ama kosk baglantisi dogrulanamadi -> **YOK - yeni** `GET /kosks/:id/decks`

## 6. Sinif
**B** - Kosk ve ders listesi hazir; sonraki celse, medrese rozeti ve kosk desteleri icin degisen/yeni endpoint gerekir.

## 7. Mevcut durum
- Buyuk olcude kodlu: apps/tedris/features/courses/components/kosk-page.tsx (252 satir) + apps/tedris/app/[locale]/kosks/[koskId]/page.tsx; takip dugmesi, ders kartlari, seviye etiketi (labels.ts)
- Eksik: sonraki celse satiri, medrese rozeti, kosk desteleri blogu

## 8. Kabul kriterleri
1. Kosk adi/alan/seviye/ders sayisi API verisiyle birebir
2. Takip durumu degisince sayfa yenilenince korunur
3. Kayitli dersler `Devam ediyor` rozeti tasir
4. Taslak ders sahip olmayana gorunmez
5. `Köşk desteleri` yalniz kayitli talebeye acik: kayitsizda blok gizli/kilitli (urun karari: dogrulanamadi)
6. 404 id'de 38 sayfasi

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Rozet esleme (enrollment.status -> etiket)
2. Seviye etiketi `BEGINNER` -> `Başlangıç seviyesi`

**Playwright e2e (gercek API):**
1. Seed: kosk + 3 yayinli ders + 1 taslak -> `/tr/kosks/{id}` 3 ders gorunur
2. Takip et -> yenile -> kalici
3. Kayitli derste `Devam ediyor`
4. Taslak ders gorunmez (baska kullanici)

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
