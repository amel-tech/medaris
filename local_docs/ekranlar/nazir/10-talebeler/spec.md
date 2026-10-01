# 10 — Talebeler

Kaynak: `local_docs/ekranlar/nazir/10-talebeler/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/talebeler/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Talebeler'; sayaç '48 talebe'; tablo 'Süleymaniye Medresesi talebeleri': Talebe (monogram+ad), E-posta, Devam ettiği dersler, Tamamladığı dersler ('Yok' ya da ders + tarih), İlk kayıt, İşlemler 'Yasakla'.
- Not: 'Talebenin medrese dışındaki dersleri bu listede yer almaz.'
- Sayfalama: 'Önceki / Sayfa 1 / 5 · 48 talebeden 1–10 / Sonraki' (sayfa boyutu 10). TanStack Table (kural 6).

## 3. Durumlar

- Yükleniyor: tablo/kart yerine `Skeleton` (kural 6: Skeleton native bileşen).
- Boş: `EmptyState` bileşeni; metni tuvalde yok — doğrulanamadı (tasarım gerekir; geçici metin kullanılacaksa P4 placeholder).
- Hata: liste yüklenemezse `Alert` + 'Yeniden dene' (tuvalde metin yok, doğrulanamadı).
- Yetkisiz: kullanıcının bu kapsamda görevi/izni yoksa ekran açılmaz; hiç görevi yoksa 02 numaralı ekrana yönlenir; yalnız izne bağlı eylemler (düğmeler) gizlenir/disabled olur.
- 'Medresenin talebelerini gör' izni yoksa sayfa 403.

## 4. Etkileşimler

- 'Yasakla' → yasaklama Dialog'u (kapsam seçimi + 'Yasaklama gerekçesi*' — kural 17; bu pencerenin tuvali yok, doğrulanamadı).
- Sayfalama düğmeleri sayfayı değiştirir.

## 5. API

- Kayıt verisi: enrollments tablosu (userId, studentName, studentEmail, status, createdAt) — `apps/tedrisat/src/database/schema/course.schema.ts`. Mevcut uç ise talebe listesini DÖNMÜYOR: yalnız `GET kosks/:koskId/enrollments/pending` (`apps/tedrisat/src/course/course.controller.ts:175`) ve kendi kayıtları `GET courses/enrolled` (`apps/tedrisat/src/course/course.controller.ts:79`).
- YOK — yeni endpoint: `GET /madrasahs/:id/students?page&limit` (ders başına devam/tamamlama; COMPLETED = `EnrollmentStatus.COMPLETED`), `POST /madrasahs/:id/bans` (11). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Medresenin talebeleri ve tamamlanan dersleri toplu sorgusu, sayfalama ve yasaklama başlatma yeni uç ister → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Liste yalnız medrese derslerinde kayıtlı talebeleri gösterir (medrese dışı dersler hariç).
2. Sayfalama 10'luk; toplam sayaç doğru.
3. Tamamlanan ders yoksa 'Yok'.
4. 'Yasakla' izin kontrolünden geçer.

## 9. Test senaryoları

- Unit: sayfalama gösterim metni.
- Playwright: 48 talebe seed → 1/5 sayfa → Sonraki → 11–20; 'Yasakla' → pencere açılır.
