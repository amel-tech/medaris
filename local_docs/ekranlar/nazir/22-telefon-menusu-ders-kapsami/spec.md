# 22 — Telefon menüsü — ders kapsamı

Kaynak: `local_docs/ekranlar/nazir/22-telefon-menusu-ders-kapsami/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir kabuk bileşeni (libs/ui; kural 18). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Aynı çekmece, ders kapsamlı: Genel bakış, Müfredat, Celseler ['1 bağlantısı eksik' rozeti], Talebeler ['2 bekleyen başvuru'], Ders kayıtları, Ders destesi, Yasaklamalar, Arşiv; YÖNETİM: Ders nazırları, Ders ayarları; foot kullanıcı satırı ('Abdülhamit Karaosmanoğlu · Müderris, ayarlar').

## 3. Durumlar

- Rozetler 0 ise gizlenir.
- Hedef sayfalar bu tuvalde yok: rota placeholder (AppBar + başlık) — P4.
- Diğer: 21 ile aynı.

## 4. Etkileşimler

- Menü öğesi → ders kapsamı rotası (placeholder).
- Kullanıcı satırı → 20.

## 5. API

- Bekleyen başvuru sayısı için kısmen: `GET kosks/:koskId/enrollments/pending` — `apps/tedrisat/src/course/course.controller.ts:175` (köşk bazlı, ders bazlı değil). 'Bağlantısı eksik' celse sayısı: `lessons.meetingUrl` — `apps/tedrisat/src/database/schema/course.schema.ts` (null sayımı; uç YOK).
- YOK — yeni endpoint: `GET /courses/:id/badge-counts` {missingMeetingLinks, pendingApplications}; `GET /me/assignments`. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Ders kapsamı menüsü; menüdeki sayfaların (Müfredat, Celseler, Ders kayıtları, Ders destesi, Ders nazırları, Ders ayarları) tuvalleri YOK (index.md 'Ders 22 | 0'); yalnız menü kabuğu kodlanabilir, rozetler yeni uç ister → B (hedef sayfalar placeholder: P4).

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Ders kapsamı seçilince menü 22'deki öğeleri gösterir (medrese öğeleri değil).
2. Rozet sayıları sunucu verisiyle tutar.
3. Kapsam değişince menü yeniden kurulur.
4. Çıkış yap yok.

## 9. Test senaryoları

- Unit: kapsam türüne göre menü öğesi kümesi.
- Playwright: ders kapsamı seç → menü aç → 'Genel bakış … Ders ayarları' sırası; medrese kapsamına dönünce 21 menüsü.
