# 22 Takvime ekle menusu acik (B10)

> Faz 2 sartname. Tuval: `local_docs/ekranlar/tedris/22-takvime-ekle-menusu-acik-b10/` (ekran.png, ekran.txt). Kanit yoksa "dogrulanamadi" yazildi.

## 1. Amac ve rota
Nx projesi `tedris-web`. Celse sayfasi (15/16) uzerinde acilan menu (Base UI Menu/Popover, `_kurallar.md` madde 22). Rota degil.

## 2. Gosterim
- Menu basligi `Takvime ekle`; ogeler `Google Takvim (yeni sekmede açılır)`, `Apple Takvim (.ics)`, `Tüm derslerime abone ol`
- Alt not `Takvim kaydı bu celse sayfasına bağlanır; toplantı bağlantısı takvime yazılmaz.`
- Arka plan: 15 sayfasi + `Katılım, celse başlamadan 10 dakika önce açılır.`

## 3. Durumlar
- Yukleniyor: yok (istemci URL'i)
- Hata: .ics indirme hatasi -> toast
- Iptal edilmis celsede menu gizli (18)
- Yetkisiz: kayitsizda menu yok (19)

## 4. Etkilesimler
- `Google Takvim` -> `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=<celse sayfasi URL'i>` yeni sekmede (URL bicimi Google'in herkese acik sablonudur; bu repoda kodu YOK, dogrulanamadi)
- `Apple Takvim (.ics)` -> tek etkinlikli .ics indirir
- `Tüm derslerime abone ol` -> 23

## 5. API
- Google linki istemcide uretilir (API/anahtar gerekmez)
- Tek celse .ics: **YOK - yeni** `GET /courses/:courseId/sessions/:sessionId/calendar.ics` (veya istemcide Blob uretimi - kucuk ve API'siz alternatif). Kanit: takvim/ICS/abonelik: apps/tedrisat/src ve libs/services/src/tedrisat/generated altinda `calendar|.ics` eslesmesi yok
- Takvim kaydi celse sayfasina baglanir: URL = tedris-web celse rotasi; toplanti URL'i ICS'ye YAZILMAZ (ekran kurali)

## 6. Sinif
**B** - Google linki istemci; .ics bir yeni endpoint ya da istemci uretimi. Ucuncu parti sunucu yapilandirmasi gerekmez (Google'a yalniz link gider).

## 7. Mevcut durum
- Yok: menu ve .ics. Menu bileseni: libs/ui/src/components/dropdown-menu.tsx (Radix; Base UI gecisi `_kurallar.md`)

## 8. Kabul kriterleri
1. Menu uc ogeyi gosterir, Esc ile kapanir
2. Google linki yeni sekmede, dogru baslik/tarih/sure ve celse sayfasi URL'i ile acilir
3. Indirilen .ics gecerli VEVENT icerir, UID sabit, DESCRIPTION'da toplanti URL'i YOKTUR
4. Iptal celsede menu yoktur
5. Zaman dilimi `Europe/Istanbul` TZID'i dogrudur

## 9. Test senaryolari
**Unit (Vitest + Testing Library):**
1. Google URL uretici (kacis, tarih bicimi YYYYMMDDTHHmmssZ)
2. ICS uretici: VEVENT alanlari, toplanti URL'i yok

**Playwright e2e (gercek API):**
1. Celse sayfasinda `Takvime ekle` -> menu acilir
2. Google ogesi: popup URL'i beklenen sorgu parametrelerini icerir
3. `.ics` indirilir ve parse edilir (ical.js)
4. `Tüm derslerime abone ol` -> 23

Not: Playwright: repoda `playwright.config.*` ve package.json'da playwright bagimliligi YOK (dogrulandi) -> e2e icin once paket + config eklenmeli (ayri is); Nx hedefi tedris-web altinda. Gercek API: tedrisat docker compose + Keycloak test kullanicisi gerekir.
