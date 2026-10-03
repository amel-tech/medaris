# 07 — Dersler

Kaynak: `local_docs/ekranlar/nazir/07-dersler/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/dersler/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Dersler' + 'Süleymaniye Medresesi’nin dersleri, açıldıkları köşkle birlikte.'; düğmeler 'Medrese dışı ders talebi gönder' (09) ve 'Medrese dersi aç' (08).
- Filtreler: 'Köşk: tümü / …', 'Durum: tümü / Yayında / Taslak'; sayaç '3 ders · 2 köşkte'.
- Tablo: Ders (ad + köşk + 'bugün açıldı'), Müderrisler (ad + 'Dersin imamı' + diğerleri), Talebe (sayı + 'N onay bekliyor' / 'Henüz talebe yok'), Durum (rozet), İşlemler (satır menüsü: müderrisleri değiştir → 17, dersi gizle → 18).
- Not: 'Gizlenen dersler bu listede yer almaz; Arşiv’de görünür.'
- Yan blok 'Ders açabileceğiniz köşkler' (hak sahibi köşkler) ve 'Medrese dışı ders' açıklaması.

## 3. Durumlar

- Yükleniyor: tablo/kart yerine `Skeleton` (kural 6: Skeleton native bileşen).
- Boş: `EmptyState` bileşeni; metni tuvalde yok — doğrulanamadı (tasarım gerekir; geçici metin kullanılacaksa P4 placeholder).
- Hata: liste yüklenemezse `Alert` + 'Yeniden dene' (tuvalde metin yok, doğrulanamadı).
- Yetkisiz: kullanıcının bu kapsamda görevi/izni yoksa ekran açılmaz; hiç görevi yoksa 02 numaralı ekrana yönlenir; yalnız izne bağlı eylemler (düğmeler) gizlenir/disabled olur.

## 4. Etkileşimler

- Filtreler listeyi daraltır.
- 'Medrese dersi aç' → 08; 'Medrese dışı ders talebi gönder' → 09.
- Satır işlemleri: 'Müderrisleri değiştir' → 17; 'Dersi gizle' → 18 (AlertDialog).
- Ders adı → ders kapsamı (tuvali yok).

## 5. API

- Köşke göre ders listesi mevcut: `GET kosks/:koskId/courses` — `apps/tedrisat/src/course/course.controller.ts:50-61` (yanıt `CourseSummaryResponse`: status DRAFT/PUBLISHED var — `apps/tedrisat/src/course/domain/course-status.enum.ts`). 'Gizli' durumu YOK (enum yalnız DRAFT, PUBLISHED).
- Müderris listesi: `course_muderris` tablosu — `apps/tedrisat/src/database/schema/course.schema.ts` (courseMuderris: userId, name, orderIndex); 'imam' bayrağı YOK (orderIndex ile türetme önerisi doğrulanamadı).
- Talebe sayısı: enrollments tablosu — `apps/tedrisat/src/database/schema/course.schema.ts`; 'onay bekliyor' = status PENDING (`enrollment-status.enum.ts`).
- YOK — yeni endpoint: `GET /madrasahs/:id/courses?koskId&status` (köşk, imam, talebe/pending sayıları, gizli bayrağı dahil). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Ders listesi mevcut `courses` tablosundan beslenebilir ama medrese bağı, köşk filtresi, 'onay bekliyor' sayacı için yeni uç/kolon gerekir → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Liste yalnız medreseye bağlı, gizlenmemiş dersleri gösterir.
2. Köşk ve Durum filtreleri birlikte çalışır; sayaç filtreyle güncellenir.
3. Talebe sütunu kayıtlı sayısını ve bekleyen sayısını doğru gösterir; talebesizse 'Henüz talebe yok'.
4. İmam müderris listede ayrıca etiketlenir.
5. Gizlenen ders listeden düşer, 12'de görünür.

## 9. Test senaryoları

- Unit: filtre/sayaç türetme.
- Playwright: 3 ders seed → liste 3 satır → 'Köşk: Fatih' → 1 satır → Durum Taslak → boş.
- Playwright: 18 ile gizle → 07'den düşer, 12'de görünür.
