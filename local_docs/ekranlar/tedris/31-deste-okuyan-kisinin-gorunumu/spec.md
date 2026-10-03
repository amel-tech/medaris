# 31 — Deste — okuyan kişinin görünümü

Kaynak: `local_docs/ekranlar/tedris/31-deste-okuyan-kisinin-gorunumu/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks/[id]` (aynı sayfa; sahibi değilse okuyucu görünümü) — deck-detail-page.tsx.

## 2. Gösterim

- Breadcrumb Desteler / <ad>; başlık, rozetler 'Herkese açık' + 'Koleksiyonunda', '40 ezber kartı · Hadis', açıklama.
- Eylemler: 'Koleksiyondan çıkar', 'Çalış'.
- Sekme Kartlar (40) + bilgi: kartlar değiştirilemez, beğenilen kart kendi desteye kopyalanır.
- Tablo: Ön yüz | Arka yüz (metin + kaynak, ör. 'Buhârî, Müslim') | İşlemler: 'Kendi desteme kopyala' (aria 'kart N').
- '40 karttan 6'sı gösteriliyor' + 'Daha fazla göster'.
- 'Çalışma durumun' (Tamamlanan 12/40, %30) ve 'Deste hakkında' metni.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: iskelet.
- Koleksiyonda değilse 'Koleksiyona ekle' (tuvalde yok; ekran 26 ile tutarlı).
- Kopyalama: hedef deste seçimi gerekir (tuvalde yok — doğrulanamadı); başarıda Toast.
- 403/404: ekran 39/38.

## 4. Etkileşimler

- 'Koleksiyondan çıkar'/'Çalış'/'Kendi desteme kopyala'/'Daha fazla göster' (istemci sayfalama: 6'şar).

## 5. API

- Deste: `GET flashcard/decks/:id` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:78 (herkese açık deste herkese okunur; sahibi olmayan özel deste 403).
- Kartlar+ilerleme: `GET flashcard/cards?deckId=&include=progress` — apps/tedrisat/src/flashcard/flashcard.controller.ts:130.
- Koleksiyon ekle/çıkar: `POST`/`DELETE flashcard/decks/:id/collections` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:157,268.
- Kopyalama: `POST flashcard/decks/:deckId/cards` — apps/tedrisat/src/flashcard/flashcard.controller.ts:178 (kendi destesine, hedef deste seçimi UI kararı).

## 6. Sınıf

**A** — A: tüm eylemler için uç var; hedef deste seçimi arayüz kararı (doğrulanamadı).

## 7. Mevcut durum

apps/tedris/features/flashcards/components/ (decks-page.tsx, deck-detail-page.tsx, explore-decks-page.tsx, deck-cards-page.tsx, deck-cards-table.tsx, flashcard-list.tsx, deckform/*) ve rotalar apps/tedris/app/[locale]/decks/**. Mevcut arayüz shadcn/Radix kabuğunda, tuvaldeki mds-* tasarımına geçmemiş; metinler tuvalle uyuşmuyor (doğrulanamadı: tam karşılaştırma yapılmadı). Okuyucu/sahip ayrımı, 'Kendi desteme kopyala', istemci sayfalama doğrulanamadı/yok.

## 8. Kabul kriterleri

1. Sahibi olmayan kullanıcı kart ekle/düzenle/sil eylemlerini görmez.
2. 'Kendi desteme kopyala' kartı seçilen kullanıcı destesine ekler; kaynak deste değişmez.
3. 'Daha fazla göster' 6 kart ekler; 'N karttan K'sı gösteriliyor' güncellenir.
4. 'Koleksiyondan çıkar' sonrası rozet kalkar.
5. Özel başkası destesi 403 ekranını açar.

## 9. Test senaryoları

- Unit: sayfalama sayacı; kopyalama payload'ı.
- E2E: B kullanıcısı A'nın PUBLIC destesini açar → kartı kendi destesine kopyalar → kendi destesinde görünür; A'nın destesinde kart sayısı değişmez.
