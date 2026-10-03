# 23 Takvim aboneligi (B11)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/23-takvim-aboneligi-b11/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Mevcut rota yok; oneri `/[locale]/account/calendar` (kirinti `Hesap / Takvim aboneliği`).

## 2. Gosterim
- Baslik `Takvim aboneliği` + aciklama (`...Google ya da Apple takvimine kendiliğinden eklenir...`)
- `Kişisel takvim bağlantın`: uyari `Bağlantını şimdi kopyala` (yalniz olusturuldugunda gosterilir); `Google Takvim için` salt-okunur alan + `Kopyala` (https://tedris.medaris.app/calendar/{belirtec}); `Apple Takvim için` (webcal://) + `Kopyala`; `Apple Takvim’de aç`; `Oluşturuldu: 1 Ekim 2026 Perşembe 10:42`; `Bağlantıyı yenile` + `Yeni bağlantı oluşur; eskisi çalışmayı bırakır.`
- `Takvimine nasıl eklenir`: Google (3 adim + telefon notu) ve Apple (3 adim) yonergeleri
- `Google değişiklikleri geç gösterebilir` bilgi kutusu
- Yan kartlar: `Bu takvimde neler var` (30 gun oncesi/180 gun sonrasi, iptal gorunur, toplanti URL'i yok, ayrilinca cikar) ve `Bağlantın sana özel`
- Alan degeri mono yazi tipi `dir=ltr`: `_kurallar.md` madde 9

## 3. Durumlar
- Yukleniyor: iskelet
- Ilk acilis: baglanti yok -> `Bağlantı oluştur` eylemi (tuvalde bu durum YOK, dogrulanamadi); tuval baglantinin YENI olusturuldugu ani gosteriyor
- Sayfa yenilenince: sunucu belirteci tekrar gosteremez (yalniz hash saklanir) -> alanlar maskeli + `Bağlantıyı yenile` (tuvalde bu durum YOK, dogrulanamadi)
- Hata: toast; panoya kopyalama reddedilirse alan secili birakilir
- Yetkisiz: oturumsuz -> giris

## 4. Etkilesimler
- `Kopyala` -> panoya yazar + toast
- `Apple Takvim’de aç` -> webcal:// baglantisina gider
- `Bağlantıyı yenile` -> onay (`AlertDialog` oneri: eski baglanti olur) -> yeni belirtec; eskisi 404/410
- Takvim istemcisi `GET /calendar/{belirtec}` ile ICS ceker (oturumsuz, belirtec yetki yerine gecer)

## 5. API
- Belirtec uretme/yenileme/okuma: **YOK - yeni** `POST /me/calendar-feed` (olustur/yenile, belirteci YALNIZ bu yanitta dondurur) ve `GET /me/calendar-feed` (`{exists, createdAt}`). Kanit: takvim/ICS/abonelik: apps/tedrisat/src ve libs/services/src/tedrisat/generated altinda `calendar|.ics` eslesmesi yok
- ICS feed: **YOK - yeni**, AuthGuard'siz `GET /calendar/:token` (text/calendar; ENROLLED derslerin celseleri; -30/+180 gun; iptal = STATUS:CANCELLED; saati degisen: SEQUENCE/LAST-MODIFIED; toplanti URL'i yok). Guard'siz rota gerekir: apps/tedrisat/src/course/course.controller.ts:39 ve apps/tedrisat/src/kosk/kosk.controller.ts:37 (`@UseGuards(AuthGuard)` iki controller'in tamaminda; Bearer yoksa 401, libs/common/src/auth-guard/auth-guard.ts:11-25)
- Belirtec yalniz hash'li saklanir (yeni tablo `calendar_feeds(user_id, token_hash, created_at)`); rate limit: libs/common/src/throttler mevcut modulu kullanilabilir (kapsam dogrulanamadi)
- Alan adi `tedris.medaris.app` deploy/ters vekil ayari: bu repoda dogrulanamadi (altyapi isi)

## 6. Sinif
**B** - Tamamen yeni backend (belirtec + ICS feed) ama kendi kodumuzla yazilir; ucuncu parti sunucu yapilandirmasi gerekmez. Google Takvim'in yenileme gecikmesi bizim kontrolumuz disindadir, bilgi kutusu olarak yazilir. Alan adi/DNS ayari ayri altyapi isi (dogrulanamadi).

## 7. Mevcut durum
- Yok: rota, bilesen, API. `apps/tedris/app` altinda `account` yok

## 8. Kabul kriterleri
1. Ilk olusturmada belirtec yalniz bir kez gosterilir; yeniden acilista gosterilmez
2. `Bağlantıyı yenile` eski belirteci gecersiz kilar (eski URL 404/410) ve yenisini gosterir
3. Feed yalniz ENROLLED derslerin celselerini icerir; PENDING/REVOKED/ayrilmis dersler cikar
4. Penceere -30/+180 gun
5. Iptal celse STATUS:CANCELLED, saat degisiminde ayni UID + SEQUENCE artar
6. Feed'de toplanti URL'i yoktur; URL alani celse sayfasi baglantisidir
7. Belirtec veritabaninda ham saklanmaz (hash)
8. `Kopyala` dugmeleri dogru URL'yi panoya yazar

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Belirtec uretimi: yeterli entropi, hash saklama
2. ICS uretici: iptal/guncelleme/pencere/toplanti URL'i yok
3. Kopyala dugmesi: pano mock

**Playwright e2e (gercek API):**
1. Oturum ac -> `/tr/account/calendar` -> baglanti olustur -> alanlar dolu
2. Kopyalanan URL ile `GET /calendar/{token}` -> 200 text/calendar, VEVENT'ler
3. `Bağlantıyı yenile` -> eski URL 404, yeni URL 200
4. Seed'de iptal celse -> feed'de STATUS:CANCELLED
5. Sayfayi yenile -> belirtec gosterilmez

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
