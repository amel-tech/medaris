# 21 — Telefon menüsü — medrese kapsamı

Kaynak: `local_docs/ekranlar/nazir/21-telefon-menusu-medrese-kapsami/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir kabuk bileşeni (libs/ui; kural 18). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- 390 px'te Dialog/sheet 'Ana menu': head (logo + kapat), kapsam seçici, `<nav aria-label="Ana menu">`: GENEL (Pano, Bildirimler [okunmamış rozeti]); MEDRESE (Dersler [rozet], Talebeler, Medrese nazırları, Yasaklamalar, İtirazlar, Arşiv); YÖNETİM (Kabul kuralları, Medrese ayarları); foot: kullanıcı satırı ('Mehmet Emin Işıkoğlu · Medrese başmüderrisi · Müderris, ayarlar') → Hesap.
- Kural 18: 'Çıkış yap' çekmecede YOK; genişlik `min(320px,85vw)`; ≥768 px'te kontrollu `open` ile kapat; odak head'de.

## 3. Durumlar

- Rozet sayıları yoksa gizlenir.
- İzne bağlı menü öğeleri izin yoksa gizlenir (hangi öğe hangi izne — tuvalde yok, doğrulanamadı).
- Uzun menüde çekmece kayar.

## 4. Etkileşimler

- Menü öğesi → rota; sheet kapanır.
- Kapsam seçici → 03 benzeri liste.
- Kullanıcı satırı → 20.
- Kapat/Esc/perde → kapanır.

## 5. API

- YOK — yeni endpoint: `GET /me/assignments`, `GET /madrasahs/:id/badge-counts` (Dersler/Bildirimler rozeti). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Menü içeriği kapsam ve izne göre; kapsam listesi `GET /me/assignments` ister (yok) ve rozet sayaçları yeni uçlardan gelir → B. Bileşen kuralı 18 net.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. 390 px'te menü düğmesi çekmeceyi açar; ≥768 px'te çekmece kapanır ve masaüstü yan menü görünür.
2. Sıra: head, kapsam seçici, nav, kullanıcı satırı.
3. 'Çıkış yap' yok.
4. Rozetler gerçek sayılardır.
5. Odak açılışta head'de.

## 9. Test senaryoları

- Unit: çekmece açık/kapalı, breakpoint dinleyicisi.
- Playwright: viewport 390x844 → menü aç → 'Dersler' → rota ve kapanma; viewport 1024'e büyüt → çekmece kapanır.
