# 11 Medrese sayfasi - girissiz (B3)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/11-medrese-sayfasi-girissiz-b3/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. 03'un hesapsiz ziyaretci gorunumu: kayit rozetleri yok, giris daveti var. Oneri rota `/[locale]/madrasas/[madrasaId]` (herkese acik).

## 2. Gosterim
- 03 ile ayni baslik/aciklama; `Dersler: Medresenin bütün dersleri, açıldıkları köşkle birlikte`
- Ders satirlarinda durum rozeti yok; `Nûruosmaniye Köşkü · Sonraki celse Paz 21:00`
- Davet: `Bir derse başvurmak için giriş yap ya da kayıt ol.`
- Yan kartlar: Başmüderris (MI), Köşkler (NK -> Bina ve İzhar Şerhi, FK -> İsâgûcî ile mantığa giriş)

## 3. Durumlar
- Yukleniyor/bos/404: 03 ile ayni
- Yetkisiz: oturum istemez (anonim 200)
- Form yok

## 4. Etkilesimler
- Ders satiri -> 05 (girissiz ders sayfasi)
- `giriş yap`/`kayıt ol` -> Keycloak
- Kosk -> 10

## 5. API
- **YOK - yeni** acik `GET /public/madrasas/:id` (03'un anonim kopyasi, `enrollment` ve kisisel alanlar olmadan). Kanit: apps/tedrisat/src/course/course.controller.ts:39 ve apps/tedrisat/src/kosk/kosk.controller.ts:37 (`@UseGuards(AuthGuard)` iki controller'in tamaminda; Bearer yoksa 401, libs/common/src/auth-guard/auth-guard.ts:11-25); `medrese` kavrami backend'de YOK: apps/tedrisat/src/database/schema/ altinda (course, kosk, flashcard*) medrese tablosu/alani yok; `grep -ril medrese apps/tedrisat/src` bos

## 6. Sinif
**B** - Medrese + anonim okuma yeni endpoint. Keycloak yalniz yonlendirme hedefi.

## 7. Mevcut durum
- Yok. middleware `/madrasas/*` icin acik yol listesi eklemeli: apps/tedris/middleware.ts:28-31: yalniz `/`, `/home`, `/api/auth/signin` herkese acik; digerleri withAuth ile giris ister -> girissiz ziyaretci rotalari bugun KILITLI

## 8. Kabul kriterleri
1. Oturumsuz `/tr/madrasas/{id}` 200 ve icerik gorunur
2. Hicbir kayit/takip rozeti gorunmez
3. `Dersler` basligi `Medresenin bütün dersleri...` aciklamasini kullanir (03'tekinden farkli metin)
4. Olmayan id 404

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Girissiz medrese: rozet render edilmez

**Playwright e2e (gercek API):**
1. Cerezsiz context -> sayfa gorunur, `Onay bekliyor` yok
2. Ders satirina tikla -> 05
3. API curl `/public/madrasas/:id` 200 / `/madrasas/:id` 401

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
