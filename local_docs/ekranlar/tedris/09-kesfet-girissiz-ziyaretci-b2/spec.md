# 09 Keşfet - girissiz ziyaretci (B2)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/09-kesfet-girissiz-ziyaretci-b2/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Hesapsiz ziyaretci icin ayni Keşfet listesi: takip dugmesi yok, alt blokta giris/kayit daveti. Mevcut rota yok; `/learning` bugun girisli (apps/tedris/middleware.ts:28-31). Oneri: `/[locale]/discover` herkese acik; middleware `publicPages`'e eklenir.

## 2. Gosterim
- 02 ile ayni baslik/filtre/kart yapisi; ust cubukta nav yerine giris/kayit dugmeleri (tuvalde ust cubuk metni yok: dogrulanamadi)
- Kosk kartlarinda `Takip` dugmesi YOK; medrese yalniz Süleymaniye (ders acmis olanlar): sayac `3 köşk ve 1 medrese` (bos medrese gizlenir - ekran 02'de bos medrese vardi, burada yok)
- Alt metin: `Bir derse başvurmak için giriş yap ya da kayıt ol. Köşklere, medreselere ve derslerin tanıtımına hesap açmadan da göz atabilirsin.` (`giriş yap`/`kayıt ol` link)
- Metin kaynagi: libs/i18n/src/locales/tr/tedris.json (ad alanlari CoursePage.*, KoskPage.*, KoskListPage.*, LessonPage.*, MyCoursesPage.*, LearningPage.*). Ekrandaki cogu metin icin anahtar YOK (ornek: `Onay bekliyor`, `Takvime ekle`, `Celseye katil`, `Basvuruyu geri cek`, `Programim`, `Takvim aboneligi` tedris.json/common.json'da 0 eslesme) -> eklenecek, tr/en/ar uc dosyaya

## 3. Durumlar
- Yukleniyor/bos/hata: 02 ile ayni
- Yetkisiz: bu ekran oturum ISTEMEZ; API 401 degil 200 donmeli (bugun 401: apps/tedrisat/src/course/course.controller.ts:39 ve apps/tedrisat/src/kosk/kosk.controller.ts:37 (`@UseGuards(AuthGuard)` iki controller'in tamaminda; Bearer yoksa 401, libs/common/src/auth-guard/auth-guard.ts:11-25))
- Form yok

## 4. Etkilesimler
- Kosk/medrese karti -> 10/11 (girissiz)
- `giriş yap` -> Keycloak girisine yonlendirir (apps/tedris/app/api/auth/[...nextauth]/route.ts; geri donus URL'i korunur - dogrulanamadi)
- `kayıt ol` -> Keycloak kayit sayfasi (apps/keycloak-theme; sunucu tarafi kayit ayari bu sprintte DEGISMEZ)

## 5. API
- Tum kosk/medrese listesi anonim okunabilmeli: **YOK - yeni** acik (guard'siz) `GET /public/kosks`, `GET /public/madrasas`. Kanit: apps/tedrisat/src/course/course.controller.ts:39 ve apps/tedrisat/src/kosk/kosk.controller.ts:37 (`@UseGuards(AuthGuard)` iki controller'in tamaminda; Bearer yoksa 401, libs/common/src/auth-guard/auth-guard.ts:11-25)
- Anonimde `isFollowing` ve kisisel alanlar donmez; yalniz yayimlanmis dersler sayilir (course.service.ts:36-39 deseni)
- Not: `isPrivate` koskler anonimde gosterilmeli mi: dogrulanamadi (kosk.schema.ts:22 isPrivate default true!) -> urun karari gerekli

## 6. Sinif
**B** - Mevcut API tamamen kimlik dogrulamali; anonim okuma icin yeni acik endpoint ve middleware degisikligi gerekir. Keycloak sunucu ayari gerekmez (yalniz yonlendirme).

## 7. Mevcut durum
- Yok: girissiz gorunum. Liste bileseni yeniden kullanilabilir: apps/tedris/features/courses/components/kosk-list-page.tsx (388 satir) + apps/tedris/app/[locale]/learning/page.tsx
- middleware: apps/tedris/middleware.ts:28-31: yalniz `/`, `/home`, `/api/auth/signin` herkese acik; digerleri withAuth ile giris ister -> girissiz ziyaretci rotalari bugun KILITLI

## 8. Kabul kriterleri
1. Oturumsuz tarayicida `/tr/discover` 200 doner ve kartlari gosterir
2. Takip dugmesi hicbir kartta yok
3. Oturumsuz `GET /public/kosks` 200; `GET /kosks` hala 401
4. Yalniz yayimlanmis ders sayisi gosterilir (taslak sayilmaz)
5. `giriş yap` baglantisi giris sonrasi `/discover`'a doner

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Girissiz kosk karti: takip dugmesi render edilmez
2. Ziyaretci alt metni link hedefleri

**Playwright e2e (gercek API):**
1. Cerezsiz context ile `/tr/discover` -> kartlar gorunur, `Takip et` yok
2. Karta tikla -> 10 sayfasi (giris istemez)
3. `giriş yap` tikla -> Keycloak login ekrani URL'ine gider (`/realms/` icerir)
4. API: curl `/public/kosks` 200, `/kosks` 401

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
