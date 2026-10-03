# 28 — Deste ayrıntısı (sahibi)

Kaynak: `local_docs/ekranlar/tedris/28-deste-ayrintisi-sahibi/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks/[id]` (apps/tedris/app/[locale]/decks/[id]/page.tsx → deck-detail-page.tsx, 290 satır).

## 2. Gösterim

- Breadcrumb Desteler / <deste adı>; başlık, durum rozeti (Yayın isteği bekliyor), meta '18 ezber kartı · Kelime · Senin desten', açıklama; 'Çalış' düğmesi.
- Sekmeler: Genel / Kartlar (sayaç 18).
- 'Çalışma durumun': Tamamlanan 6/18, %33 çubuk; Yeni 5, Öğreniliyor 7, Tamamlandı 6; 'Bugün 6 kart tekrar bekliyor.'
- 'Örnek kartlar' (ilk 6 kart: sıra, durum rozeti, ön yüz Arapça, arka yüz) + 'Bütün kartlar' bağlantısı.
- 'Kimler görebilir' kartı: yayın isteği tarihi metni ('29 Eylül 2026 Salı 21:10'da gönderdin…') + 'İsteği geri çek'. Özel desteyse 'yayın iste' eylemi (tuvalde yok — doğrulanamadı).
- 'Deste' kartı: 'Düzenle' (→ ekran 33), 'Desteyi sil'.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: iskelet.
- 404: deste yok → ekran 38; 403: başkasının özel destesi → ekran 39.
- Boş deste: kart yok → örnek kartlar yerine EmptyState + 'Kart ekle' (metin doğrulanamadı).
- Silme: AlertDialog (kural 11 — Kalıcı sil/Sil = AlertDialog), onaya dek yıkıcı düğme; başarıda /decks'e dönüş.
- İstek geri çekme hatası: Toast.

## 4. Etkileşimler

- 'Çalış' → /decks/study/[id]; 'Kartlar' sekmesi → ekran 29; 'Bütün kartlar' aynı.
- 'İsteği geri çek': yayın isteğini iptal eder, rozet 'Özel' olur.
- 'Düzenle' → ekran 33; 'Desteyi sil' → onay → silme.

## 5. API

- Deste: `GET flashcard/decks/:id` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:78; kartlar+ilerleme: `GET flashcard/cards?deckId=&include=progress` — apps/tedrisat/src/flashcard/flashcard.controller.ts:130 (durum sayıları istemcide hesaplanabilir); silme: `DELETE flashcard/decks/:id` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:249 (sahibi dışına 403).
- YOK — yayın isteği gönderme / geri çekme: `POST /flashcard/decks/:id/publish-request`, `DELETE /flashcard/decks/:id/publish-request` (durum, requestedAt). Tuvaldeki üç durum (Özel / Yayın isteği bekliyor / Yayında) backend'de karşılanmıyor: `decks` tablosunda yalnız `isPublic boolean` var (apps/tedrisat/src/database/schema/flashcard-deck.schema.ts), yayın isteği/inceleme alanı ve endpoint'i yok.
- YOK — 'bugün tekrar bekliyor' (bkz. ekran 25: ilerleme tablosunda zaman damgası yok).

## 6. Sınıf

**B** — B: okuma/silme uçları var; yayın isteği ve due hesabı için yeni endpoint + şema gerekir.

## 7. Mevcut durum

apps/tedris/features/flashcards/components/ (decks-page.tsx, deck-detail-page.tsx, explore-decks-page.tsx, deck-cards-page.tsx, deck-cards-table.tsx, flashcard-list.tsx, deckform/*) ve rotalar apps/tedris/app/[locale]/decks/**. Mevcut arayüz shadcn/Radix kabuğunda, tuvaldeki mds-* tasarımına geçmemiş; metinler tuvalle uyuşmuyor (doğrulanamadı: tam karşılaştırma yapılmadı). deck-detail-page.tsx deste ve kart özetini gösterir; sekmeler, durum sayıları, 'Kimler görebilir' kartı, yayın isteği yok.

## 8. Kabul kriterleri

1. Sahibi olmayan kullanıcı sayfada 'Düzenle', 'Desteyi sil', 'İsteği geri çek' görmez.
2. Durum sayıları (Yeni/Öğreniliyor/Tamamlandı) kartların progress durumlarından hesaplanır ve toplam karta eşittir.
3. 'İsteği geri çek' sonrası rozet 'Özel' olur ve 'Kimler görebilir' metni güncellenir.
4. 'Desteyi sil' onay penceresi olmadan silmez; onayda deste ve kartları gider, /decks'e dönülür.
5. Olmayan UUID 404 sayfasına, başkasının özel destesi 403 sayfasına gider.

## 9. Test senaryoları

- Unit: durum sayısı hesabı; rozet eşlemesi; silme onay bileşeni.
- E2E: sahibi olarak deste aç → sayılar toplamı = kart sayısı → 'Desteyi sil' → Vazgeç deste duruyor → tekrar sil → onay → /decks'te yok. Başka kullanıcıyla özel deste URL'si → 403 ekranı.
