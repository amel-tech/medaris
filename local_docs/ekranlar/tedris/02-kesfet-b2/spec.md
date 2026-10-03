# 02 Keşfet (B2) - girisli

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/02-kesfet-b2/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Giris yapmis kullanici icin kosk ve medrese listesi. Mevcut rota `/[locale]/learning` (apps/tedris/app/[locale]/learning/page.tsx, 70 satir); oneri: rota `/[locale]/discover`, eskisi yonlendirilir (dogrulanamadi - urun karari).

## 2. Gosterim
- Baslik `Keşfet`, aciklama `Köşkler bir ilmin derslerini bir araya getirir; medreseler derslerini bu köşklerde açar.`
- Filtre satiri: seviye Select (`Bütün seviyeler/Başlangıç/Orta/İleri`), medrese Select (`Bütün medreseler` + medrese adlari), `Alan` ChoiceChips (`Tümü`, `Arapça dil ilimleri`, `Fıkıh`, `Hadis`); sonuc sayaci `3 köşk ve 2 medrese`
- Köşkler: kart = kisaltma rozeti (NK/FK/BK), ad, alan, aciklama, `Başlangıç seviyesi · 3 ders`, takip dugmesi (`Takip ediliyor`/`Takip et`)
- Medreseler: kart = rozet, ad, `Başmüderris {ad}`, ders adlari, `2 ders`; ders olmayan medrese: `Bu medrese henüz ders açmadı.`
- Alt blok: `Bir ilim için köşk açılmasını istiyorsan başvurabilirsin; başvurunu Medaris yönetimi değerlendirir.` + `Köşk açma başvurusu` linki -> 37
- Ust cubuk: Medaris logosu, Ana sayfa, Kesfet, Derslerim, Programim, Desteler, zil, avatar menusu (Hesabim). Telefon (390 px) menu cekmecesi `_kurallar.md` madde 18
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor: kart iskeletleri
- Bos: filtre sonucu yok -> `0 köşk ve 0 medrese` + filtreyi temizle (metin tuvalde YOK, dogrulanamadi); mevcut `LearningPage.empty` = `Henüz köşk bulunmuyor.` (tedris.json)
- Hata: Alert + yeniden dene (mevcut kod hatada bos liste dondurur: actions/index.ts:21-26, yani hata gorunmez - duzeltilecek)
- Yetkisiz: middleware oturumsuz kullaniciyi giris'e atar (middleware.ts:28-31); bu ekran girisli, girissiz karsiligi 09
- Takip dugmesi istegi: bekleyen durumda disabled; hata -> toast

## 4. Etkilesimler
- Seviye/medrese Select ve alan chip'i -> liste ve sayac filtrelenir (URL sorgu parametresi, paylasilabilir)
- Takip et / Takip ediliyor -> POST/DELETE follow, iyimser guncelleme + hata toast
- Kosk karti -> 04; medrese karti -> 03; medrese icindeki ders adi -> ders sayfasi
- `Köşk açma başvurusu` -> 37
- Sayfalama (12/sayfa): mevcut Pagination bileseni learning/page.tsx

## 5. API
- GET /kosks: apps/tedrisat/src/kosk/kosk.controller.ts:49 (page, limit; filtre parametresi yok) -> VAR; sayfalama var, `seviye/alan/medrese` filtreleri YOK
- Kosk karti alanlari: name, field (alan), level, description, courseCount, isFollowing: apps/tedrisat/src/kosk/dto/kosk-response.dto.ts (field :26, level :29, courseCount :50, isFollowing :62). Kosk basina `Başlangıç seviyesi` + `3 ders` = level + courseCount; tuvaldeki `Orta seviye` metni `level` degerinden turetilir (ALL/BEGINNER/INTERMEDIATE/ADVANCED, kosk.schema.ts:25)
- POST /kosks/:id/follow: kosk.controller.ts:125; DELETE /kosks/:id/follow: kosk.controller.ts:138 -> `Takip et` / `Takip ediliyor` icin VAR
- Filtre (seviye, alan, medrese): **YOK - yeni** `GET /kosks?level=&field=&madrasaId=` sorgu parametreleri (alternatif: ekranda <=12 kosk oldugundan istemci tarafi filtre; sayfalama ile celisir, urun karari dogrulanamadi)
- Medreseler bolumu (`Süleymaniye Medresesi`, baskan muderris, ders listesi, `2 ders`): `medrese` kavrami backend'de YOK: apps/tedrisat/src/database/schema/ altinda (course, kosk, flashcard*) medrese tablosu/alani yok; `grep -ril medrese apps/tedrisat/src` bos -> **YOK - yeni** `GET /madrasas` -> `{id,name,headMuderrisName,courseCount,courses:[{id,title}]}[]`; yeni `madrasas` tablosu + `courses.madrasa_id`

## 6. Sinif
**B** - Kosk listesi ve takip hazir ama medrese varligi ve filtreler backend'de yok; yeni tablo + endpoint gerekir.

## 7. Mevcut durum
- Kosk listesi + takip + sayfalama kismen kodlu: apps/tedris/features/courses/components/kosk-list-page.tsx (388 satir) + apps/tedris/app/[locale]/learning/page.tsx
- Eksik: medrese bolumu, seviye/alan/medrese filtreleri, sayac, `Köşk açma başvurusu` blogu

## 8. Kabul kriterleri
1. `/discover` giris yapmis kullanicida kosk kartlarini ve medrese kartlarini ayri basliklarla listeler
2. Seviye `Orta` secilince yalniz level=INTERMEDIATE koskler kalir; sayac `N köşk ve M medrese` guncellenir
3. Alan chip'i `Fıkıh` -> yalniz field='Fıkıh' koskler
4. Takip et tiklaninca rozet `Takip ediliyor` olur ve sayfa yenilenince korunur
5. Dersi olmayan medrese `Bu medrese henüz ders açmadı.` gosterir
6. Filtre durumu URL'de saklanir, geri tusu onceki filtreyi getirir
7. Hata durumu bos liste gibi gorunmez (Alert)

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Filtre fonksiyonu: seviye+alan kombinasyonlari, sayac
2. Kosk karti: takip dugmesi iyimser guncelleme ve geri alma
3. Seviye etiketi eslemesi (labels.ts levelLabel)

**Playwright e2e (gercek API):**
1. Seed: 3 kosk (2'si takipte degil), 2 medrese -> `/tr/discover` sayac `3 köşk ve 2 medrese`
2. `Orta` seviyeyi sec -> yalniz Fatih Köşkü
3. `Takip et` tikla -> sayfayi yenile -> `Takip ediliyor`
4. Medrese kartina tikla -> 03
5. Sayfa 2 (limit=1 test ortami) -> Pagination calisir

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
