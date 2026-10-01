# 21 Programim (B12)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/21-programim-b12/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Mevcut rota yok; oneri `/[locale]/schedule`. Kayitli derslerin onumuzdeki 7 gunluk celseleri.

## 2. Gosterim
- Baslik `Programım`, `Kayıtlı olduğun derslerin önümüzdeki yedi gündeki celseleri.`, `Saatler İstanbul saatiyle. Saat dilimini değiştir`, `Takvim aboneliği` linki (23)
- Gun gruplari: `3 Ekim Cumartesi` + goreli (`Öbür gün`), her celse: saat, sure, `Ders · Hafta N`, celse adi, platform (`Zoom`), durum (`Planlandı`/`İptal edildi`), baglanti yok notu, `Bu celse iptal edildi.`
- `Sonraki yedi günü göster` (sonraki 7 gun)
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor: iskelet
- Bos: 7 gunde celse yok -> metin tuvalde YOK (dogrulanamadi)
- Hata: Alert
- Yetkisiz: oturumsuz -> giris
- Saat dilimi degistirme: `Saat dilimini değiştir` baglantisi/menusu tuvalde davranissiz (dogrulanamadi)

## 4. Etkilesimler
- Celse satiri -> celse sayfasi (15/16/18)
- `Sonraki yedi günü göster` -> pencere kayar (`?from=` ile)
- `Saat dilimini değiştir` -> saat dilimi secici (hedef dogrulanamadi)
- `Takvim aboneliği` -> 23

## 5. API
- **YOK - yeni** `GET /sessions?from=&to=` (kullanicinin ENROLLED derslerinin celseleri; PENDING/REVOKED haric). Kanit: celse (lesson) icin bagimsiz endpoint YOK: tek yol GET /courses/:id icindeki weeks[].lessons[] (course.controller.ts:92). Iptal/telafi/durum alani YOK: apps/tedrisat/src/database/schema/course.schema.ts:61-80 (lessons: title,type,duration,kaynak,scheduledAt,meetingUrl,agenda,isPreview,orderIndex); GET /courses/enrolled: course.controller.ts:79; PENDING kayitlar HARIC: apps/tedrisat/src/course/course.repository.ts:98
- Gecici istemci cozumu: GET /courses/enrolled + her ders icin GET /courses/:id (N+1) -> onerilmez
- `Planlandı/İptal edildi` durum alani YOK (bkz. 18)

## 6. Sinif
**B** - Celseler kullanici bazinda toplu sorgulanamiyor; yeni endpoint ve durum alani gerekir.

## 7. Mevcut durum
- Yok (sayfa/bilesen yok): apps/tedris/app altinda `schedule` rotasi bulunmuyor

## 8. Kabul kriterleri
1. Yalniz kullanicinin ENROLLED derslerinin celseleri listelenir
2. Pencere bugunden 7 gun; `Sonraki yedi günü göster` bir sonraki 7 gunu getirir
3. Celseler tarih-saat sirali ve gun basliklari altinda gruplu
4. Iptal celse `İptal edildi` rozeti ve aciklamasiyla listelenir
5. Saatler Europe/Istanbul

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Gun gruplama ve goreli etiket
2. Iptal rozeti eslemesi

**Playwright e2e (gercek API):**
1. Seed: 2 ders, 5 celse (1 iptal) -> liste dogru gruplanir
2. `Sonraki yedi günü göster` -> sonraki pencere
3. Satira tikla -> celse sayfasi
4. PENDING ders celseleri listede yok

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
