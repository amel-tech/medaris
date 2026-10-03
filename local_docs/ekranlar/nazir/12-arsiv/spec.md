# 12 — Arşiv

Kaynak: `local_docs/ekranlar/nazir/12-arsiv/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/arsiv/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Sayaç; tablo 'Gizlenen öğeler': Öğe (ad + üst bağlam), Tür (Ders kaydı / Celse / Hafta / Ders), Gizleyen (ad + rol), Gizlendiği tarih, İşlemler.
- İşlem: 'Geri al' ya da kademe yetmezse 'Bunu köşk nazımı gizledi; yalnız o kademe ya da üstü geri alabilir.' (ve 'İtiraz edildi · karar bekliyor').
- Alt bölüm 'Medreseyi gizle': açıklama + 'Medreseyi gizle' (yıkıcı eylem; onay penceresi tuvali yok — doğrulanamadı).

## 3. Durumlar

- Yükleniyor: tablo/kart yerine `Skeleton` (kural 6: Skeleton native bileşen).
- Boş: `EmptyState` bileşeni; metni tuvalde yok — doğrulanamadı (tasarım gerekir; geçici metin kullanılacaksa P4 placeholder).
- Hata: liste yüklenemezse `Alert` + 'Yeniden dene' (tuvalde metin yok, doğrulanamadı).
- Yetkisiz: kullanıcının bu kapsamda görevi/izni yoksa ekran açılmaz; hiç görevi yoksa 02 numaralı ekrana yönlenir; yalnız izne bağlı eylemler (düğmeler) gizlenir/disabled olur.

## 4. Etkileşimler

- 'Geri al' → öğeyi arşivden çıkarır (anında; onay penceresi tuvalde yok).
- 'Medreseyi gizle' → onay (tuvalde yok) → medrese ve dersler listelerden kalkar.

## 5. API

- YOK — yeni endpoint: `GET /madrasahs/:id/archive`, `POST /archive/:itemId/restore`, `POST /madrasahs/:id/hide`. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').
- Mevcut silme sert silmedir: `DELETE courses/:id` — `apps/tedrisat/src/course/course.controller.ts:139-150`; gizleme bayrağı `apps/tedrisat/src/database/schema/course.schema.ts` courses kolonlarında yok.

## 6. Sınıf

**B** — Gizleme (soft-hide) ve geri alma kademesi modeli yeni; ders silme dışında gizleme bayrağı yok → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Yalnız gizli öğeler listelenir; geri alınca kaybolur ve asıl yerinde görünür.
2. Gizleyenden alt kademedeki kullanıcı geri alamaz; düğme yerine açıklama görünür.
3. Medreseyi gizleyince medrese/ders sayfaları başmüderris ve Medaris yönetimi dışına kapanır; hiçbir kayıt silinmez.
4. Tür ve tarih doğru.

## 9. Test senaryoları

- Unit: kademe karşılaştırma (geri alma yetkisi).
- Playwright: dersi gizle (18) → Arşiv'de satır → 'Geri al' → Dersler'de yeniden görünür.
