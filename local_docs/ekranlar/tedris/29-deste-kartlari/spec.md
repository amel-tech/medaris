# 29 — Deste kartları

Kaynak: `local_docs/ekranlar/tedris/29-deste-kartlari/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks/[id]/cards` (apps/tedris/app/[locale]/decks/[id]/cards/page.tsx → deck-cards-page.tsx + deck-cards-table.tsx).

## 2. Gösterim

- Deste başlığı bloğu ekran 28'deki gibi; sağda 'Dışa aktar', 'İçe aktar', 'Kart ekle'.
- Sekmeler Genel / Kartlar (18).
- Bilgi: 'Durum sütunu senin çalışma ilerlemeni gösterir. Kartları yalnız sen ekler, düzenler ve silersin.'
- Tablo (başlık 'X destesinin kartları'): Ön yüz | Arka yüz | Durum (Yeni/Öğreniliyor/Tamamlandı) | İşlemler (Düzenle, Sil; aria 'kart N'). Arapça ön yüz RTL/font-arabic.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: tablo iskeleti.
- Boş: kart yok → EmptyState + 'Kart ekle' (metin doğrulanamadı).
- Silme: AlertDialog onayı (tuvalde yok — kural 11'e göre eklenir, doğrulanamadı).
- İçe aktarma hatası: satır bazlı hata özeti (BulkResponse içeriği apps/tedrisat/src/flashcard/dto/flashcard-bulk-response.dto.ts).
- Yetkisiz: sahibi değilse bu sayfa 403 (ekran 39); okuyan kişi için ekran 31 gösterilir.

## 4. Etkileşimler

- 'Kart ekle': kart ekleme penceresi (ön/arka yüz, tür), kaydedince tablo yenilenir.
- 'Düzenle': satır içi/pencerede kartı günceller; 'Sil': onay sonrası siler.
- 'Dışa aktar': xlsx/csv indirir; 'İçe aktar': dosya seçip yükler, sonucu bildirir; örnek şablon indirme.
- Sekme 'Genel' → ekran 28.

## 5. API

- Kartlar+durum: `GET flashcard/cards?deckId=&include=progress` — apps/tedrisat/src/flashcard/flashcard.controller.ts:130.
- Ekle: `POST flashcard/decks/:deckId/cards` — apps/tedrisat/src/flashcard/flashcard.controller.ts:178; toplu: `POST …/cards/bulk` :339.
- Düzenle: `PUT flashcard/cards/:id` :242, `PATCH` :276; sil: `DELETE` :307.
- Dışa aktar: `GET flashcard/decks/:deckId/cards/bulk/export` :396; örnek: `GET flashcard/cards/bulk/sample` :375; içe aktar: `POST …/cards/bulk/import` :437 (hepsi apps/tedrisat/src/flashcard/flashcard.controller.ts).

## 6. Sınıf

**A** — A: tuvaldeki tüm eylemler için uç mevcut; yalnız frontend. Tür/due ihtiyacı bu ekranda yok.

## 7. Mevcut durum

apps/tedris/features/flashcards/components/ (decks-page.tsx, deck-detail-page.tsx, explore-decks-page.tsx, deck-cards-page.tsx, deck-cards-table.tsx, flashcard-list.tsx, deckform/*) ve rotalar apps/tedris/app/[locale]/decks/**. Mevcut arayüz shadcn/Radix kabuğunda, tuvaldeki mds-* tasarımına geçmemiş; metinler tuvalle uyuşmuyor (doğrulanamadı: tam karşılaştırma yapılmadı). deck-cards-table.tsx tablo + inline düzenleme (data-table/editable) ve add-card-button-dialog.tsx var; dışa/içe aktarma düğmeleri UI'da YOK (doğrulanamadı: kodda grep edilmedi) — hizmet katmanında uçlar var.

## 8. Kabul kriterleri

1. Tablo, deste kartlarının tümünü ön/arka yüz ve durumla listeler; durum, giriş yapan kullanıcının ilerlemesidir.
2. Sahibi 'Düzenle/Sil/Kart ekle/İçe aktar' görür; diğer kullanıcılar bu sayfada değişiklik yapamaz (API 403).
3. 'Kart ekle' sonrası satır sayısı +1 olur ve sekme sayacı güncellenir.
4. Silme onay penceresiz silmez; onaydan sonra satır ve sayaç azalır.
5. 'Dışa aktar' dosya indirir ve içe aktarma aynı dosyayla satır sayısını iki katına çıkarır (xlsx).

## 9. Test senaryoları

- Unit: durum rozeti eşlemesi (NEW/LEARNING/MASTERED), Arapça hücre yönü.
- E2E: sahibi → /decks/[id]/cards → Kart ekle → satır görünür → Düzenle → metin değişir → Sil → onay → satır yok; 'Dışa aktar' indirme olayı.
