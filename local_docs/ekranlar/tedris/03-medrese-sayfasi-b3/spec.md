# 03 Medrese sayfasi (B3) - girisli

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/03-medrese-sayfasi-b3/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Bir medresenin ozeti, dersleri (acildiklari koskle) ve baskan muderris. Mevcut rota yok; oneri `/[locale]/madrasas/[madrasaId]`.

## 2. Gosterim
- Kirinti: `Keşfet / Süleymaniye Medresesi`; rozet SM, `MEDRESE` etiketi, ad, `2 ders · Başmüderris {ad}`
- Aciklama + bilgi: `Her dersin kendi müderrisleri vardır. Medresenin derslerine kayıt onaylıdır: başvurduğunda, dersin kadrosu onaylayınca kaydın kesinleşir.`
- Dersler: Arapca etiket (`الصرف`), ders adi, kayit durumu rozeti (`Devam ediyor`/`Onay bekliyor`), muderrisler, `{Kosk} · Sonraki celse Paz 21:00`
- Yan kart `Başmüderris`: avatar (MI), ad, `Bu medresenin iki dersinde müderris`; yan kart `Köşkler`: derslerini actigi koskler
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor: iskelet
- Bos: ders yok -> `Bu medrese henüz ders açmadı.` (02'den)
- Hata/404: medrese yok -> 38 `Sayfa bulunamadı`
- Yetkisiz: oturumsuz -> 11'in gorunumu
- Form yok

## 4. Etkilesimler
- Ders satiri -> ders sayfasi (05/06/08/12)
- Kosk satiri -> 04
- Kirinti `Keşfet` -> 02
- Baskan muderris -> acik profil (35) - hedef dogrulanamadi

## 5. API
- `medrese` kavrami backend'de YOK: apps/tedrisat/src/database/schema/ altinda (course, kosk, flashcard*) medrese tablosu/alani yok; `grep -ril medrese apps/tedrisat/src` bos -> **YOK - yeni** `GET /madrasas/:id` -> `{id,name,description,headMuderris:{id,name,title},courses:[{id,title,category,koskId,koskName,muderris[],enrollment:{status}|null,nextSessionAt}],kosks:[...]}`
- Ders basina kayit durumu: `enrollment` alani CourseSummaryResponse'ta var (GET /kosks/:koskId/courses: apps/tedrisat/src/course/course.controller.ts:50 (CourseSummaryResponse: weekCount, lessonCount, muderris, enrollment; lesson/celse listesi yok))
- Sonraki celse tarihi: ders listesinde YOK (celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex))

## 6. Sinif
**B** - Medrese varligi hic yok: yeni schema (migration), endpoint ve ekran. Ucuncu parti gerekmez.

## 7. Mevcut durum
- Yok. Kullanilabilir parcalar: cover.tsx (HueAvatar/kapak), syllabus.tsx, kosk-page.tsx ders satiri deseni

## 8. Kabul kriterleri
1. `/madrasas/{id}` medrese adini, baskan muderrisi ve derslerini gosterir
2. Her ders satirinda kullanicinin kayit durumuna gore `Devam ediyor`/`Onay bekliyor`/rozetsiz gorunur
3. Dersin sonraki celse tarihi `Paz 21:00` bicimindedir (Europe/Istanbul)
4. Olmayan id -> 38 sayfasi
5. Kosk listesi yalniz medresenin ders actigi koskleri gosterir

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Medrese sayfasi: ders durumu rozet eslemesi
2. Tarih bicimleyici: `Paz 21:00`

**Playwright e2e (gercek API):**
1. Seed: medrese + 2 ders (biri PENDING enrollment) -> sayfada `Onay bekliyor` rozeti
2. Ders satirina tikla -> ders sayfasi
3. `/madrasas/<olmayan-uuid>` -> 404 sayfasi

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
