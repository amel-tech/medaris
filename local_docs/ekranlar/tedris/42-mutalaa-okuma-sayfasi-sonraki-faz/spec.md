# 42 — Mütalaa okuma sayfası (sonraki faz)

Kaynak: `local_docs/ekranlar/tedris/42-mutalaa-okuma-sayfasi-sonraki-faz/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/courses/[courseId]/weeks/[n]/mutalaa` — tuval ve slug 'sonraki faz' diyor.

## 2. Gösterim

- Breadcrumb Köşk / Ders / Mütalaa; 'MÜTALAA · HAFTA 5' başlık, ~15 dk okuma; 'Metinde harekeler' ve 'Meâl' anahtarları; Arapça metin (Alak 1–5, Noto Naskh/Scheherazade), meâl, ibare + kaynak, şerh metni, haşiye notları, müderris notu; 'Mütalaa kontrolü' ('Hazırım, kontrol iste'); yan 'Sıradaki celse' kartı + 'Celse sayfasına git'.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Bu fazda kodlanmaz.

## 4. Etkileşimler

- Kontrol iste: müderrise onay isteği (sonraki faz).

## 5. API

- YOK — mütalaa içeriği, hafta notu, kontrol/onay modelinin hiçbiri backend'de yok; kayıtlı yalnız `lessons` + `course_resources` (course.schema.ts).

## 6. Sınıf

**C** — C: tuvalin slug'ı ve işaretlemesi 'sonraki faz'; kapsam dışı. Ayrıca müderris onay akışı ve metin içerik modeli tanımsız.

## 7. Mevcut durum

Yok.

## 8. Kabul kriterleri

1. (Kodlanmaz.)

## 9. Test senaryoları

- Faz açıldığında yazılır.
