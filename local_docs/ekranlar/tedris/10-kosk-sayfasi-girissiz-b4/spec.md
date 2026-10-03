# 10 Kosk sayfasi - girissiz (B4)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/10-kosk-sayfasi-girissiz-b4/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. 04'un anonim gorunumu. Rota `/[locale]/kosks/[koskId]` herkese acik olmali; bugun middleware girisli yapiyor (apps/tedris/middleware.ts:28-31: yalniz `/`, `/home`, `/api/auth/signin` herkese acik; digerleri withAuth ile giris ister -> girissiz ziyaretci rotalari bugun KILITLI).

## 2. Gosterim
- Rozet NK, `KÖŞK`, ad, alan, `Başlangıç seviyesi · 3 ders` (takip dugmesi YOK); `Köşk nazımı Abdülhamit Karaosmanoğlu`; aciklama
- Dersler listesi (rozetsiz), medrese dersine `Süleymaniye Medresesi dersi` etiketi, `Sonraki celse ...`
- Davet metni `Bir derse başvurmak için giriş yap ya da kayıt ol.`
- Kosk desteleri blogu YOK (yalniz kayitlilara)

## 3. Durumlar
- Yukleniyor/bos/404: 04 ile ayni
- Yetkisiz: oturum istemez

## 4. Etkilesimler
- Ders satiri -> 05
- `giriş yap`/`kayıt ol` -> Keycloak

## 5. API
- **YOK - yeni** `GET /public/kosks/:id` ve `GET /public/kosks/:id/courses` (anonim; yalniz PUBLISHED). Kanit: apps/tedrisat/src/course/course.controller.ts:39 ve apps/tedrisat/src/kosk/kosk.controller.ts:37 (`@UseGuards(AuthGuard)` iki controller'in tamaminda; Bearer yoksa 401, libs/common/src/auth-guard/auth-guard.ts:11-25)
- `Köşk nazımı` icin `ownerName`: kosk-response.dto.ts'te YOK

## 6. Sinif
**B** - Anonim okuma ve kosk nazimi adi icin yeni endpoint; ucuncu parti yok.

## 7. Mevcut durum
- Yok (girissiz). Bilesen yeniden kullanimi: apps/tedris/features/courses/components/kosk-page.tsx (252 satir) + apps/tedris/app/[locale]/kosks/[koskId]/page.tsx

## 8. Kabul kriterleri
1. Oturumsuz `/tr/kosks/{id}` 200 ve icerik gorunur
2. Takip dugmesi ve desteler blogu gorunmez
3. Taslak ders gorunmez
4. `Köşk nazımı` adi gorunur

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Girissiz kosk: takip dugmesi yok

**Playwright e2e (gercek API):**
1. Cerezsiz context -> sayfa gorunur, takip yok
2. Ders tikla -> 05
3. curl `/public/kosks/:id` 200

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
