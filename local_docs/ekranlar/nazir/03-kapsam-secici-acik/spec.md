# 03 — Kapsam seçici açık

Kaynak: `local_docs/ekranlar/nazir/03-kapsam-secici-acik/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir (kabuk bileşeni; libs/ui'ye taşınacak — kural 36). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Pano (01) zemininde yan menüdeki kapsam düğmesinden açılan liste: MEDRESE bölümü (SM, 'Süleymaniye Medresesi', rolü 'Medrese başmüderrisi'); DERSLER bölümü (ders adı, 'Müderris · dersin imamı · {Köşk}').
- Alt not: 'Yalnız görev aldığınız medrese ve dersler listelenir.'
- Seçili kapsam işaretli. Kural 22: Menu henüz tasarım sisteminde yok (`.mds-popup`, `.mds-menu-item`); kural 23: Select mi Menu mu açık karar (uydurulmaz).

## 3. Durumlar

- Yükleniyor: tablo/kart yerine `Skeleton` (kural 6: Skeleton native bileşen).
- Tek kapsam varsa seçici açılır olmaz (tuvalde yok, doğrulanamadı).
- Liste boşsa 02'ye yönlenilir.

## 4. Etkileşimler

- Kapsam düğmesi → listeyi açar; Esc/dış tık kapatır.
- Medrese satırı → medrese kapsamı menüsü ve Pano (01).
- Ders satırı → ders kapsamı menüsü (22) ve ders genel bakışı (tuvali yok).
- Telefonda seçici menü çekmecesinin içinde (21/22; kural 18).

## 5. API

- YOK — yeni endpoint: `GET /me/assignments` (bkz. 02). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Kapsam listesi 'görev aldığınız medrese ve dersler'den gelir; bu uç yok → B. Açık hâli yeni bir sayfa değil, Pano (01) üstüne açılan Menu/Popover.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Seçici yalnız kullanıcının görevli olduğu medrese ve dersleri listeler.
2. Seçim değişince yan menü ve sayfa içeriği yeni kapsama geçer; URL kapsamı yansıtır.
3. Klavye ile açılıp kapanır, odak liste öğelerinde gezer.
4. Aktif kapsam işaretlidir.

## 9. Test senaryoları

- Unit: kapsam seçimi → rota üretimi.
- Playwright: iki kapsamlı nazır → seçici aç → ders seç → menü 22'ye döner; medreseye geri dön → 01 menüsü.
