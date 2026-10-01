# 25 — Desteler

Kaynak: `local_docs/ekranlar/tedris/25-desteler/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks` (apps/tedris/app/[locale]/decks/page.tsx → features/flashcards/components/decks-page.tsx). Rota aynı kalır.

## 2. Gösterim

- Başlık 'Desteler' + alt metin; sağ üstte 'Desteleri keşfet' (bağlantı → /decks/explore) ve 'Deste oluştur' (→ /decks/create).
- 'Destelerim · 4 deste' bölümü: bilgi metni (yeni desteler özel başlar, yayın isteği akışı); süzgeç sekmeleri: Tümü / Özel / Yayın isteği bekliyor / Yayında.
- Deste kartı: avatar baş harfleri (EÇ), ad, durum rozeti (Yayında / Yayın isteği bekliyor / Özel), açıklama, 'Tamamlanan: 30 / 36 kart' + yüzde çubuğu, 'N kart tekrar bekliyor', '36 kart · Kelime' (tür), '29 Eylül'de istendi' (yalnız bekleyenlerde), 'Çalış' düğmesi (aria: 'Çalış: <ad>').
- 'Koleksiyonum · 3 deste' bölümü: başkalarının desteleri; rozetler: Ders destesi / Köşk destesi / Herkese açık; alt satır ders·müderris ya da köşk adı; '5 yeni kart' etiketi; 'Çalış'.
- Koleksiyon bölümü bilgi metni: kartlar değiştirilemez, beğenilen kart kendi desteye kopyalanabilir.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: iskelet kartlar.
- Boş: Destelerim boşsa EmptyState + 'Deste oluştur' (metin tuvalde yok — doğrulanamadı); Koleksiyonum boşsa 'Desteleri keşfet' yönlendirmesi.
- Süzgeç sonucu boş: ilgili durumda deste yoksa boş mesajı (metin doğrulanamadı).
- Hata: SystemState + yeniden dene.
- Yetkisiz (oturum yok): giriş sayfasına yönlendirme (middleware.ts mevcut).

## 4. Etkileşimler

- Süzgeç sekmesi: listeyi duruma göre süzer (istemci tarafı).
- 'Çalış': /decks/study/[id] açar (tekrar bekleyen kartlarla).
- Kart gövdesi: deste ayrıntısına gider (/decks/[id]).
- 'Desteleri keşfet' → ekran 26; 'Deste oluştur' → ekran 27.

## 5. API

- Destelerim/koleksiyon: `GET flashcard/decks/collections` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:58 (kullanıcının koleksiyonu), `GET flashcard/decks` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:112 (`isPublic` süzgeci: yalnız kendi özel / herkese açık / ikisi).
- Tamamlanan/öğreniliyor sayıları: kartlar `GET flashcard/cards?deckId=…&include=progress` — apps/tedrisat/src/flashcard/flashcard.controller.ts:130 ile gelir ama desteler listesi başına N istek gerektirir; toplu özet YOK.
- YOK — yeni endpoint: `GET /flashcard/decks/summary` → her deste için `{cardCount, masteredCount, learningCount, newCount, dueCount, type, source:'OWN'|'COLLECTION', collectionKind:'COURSE'|'KOSK'|'PUBLIC'|null, publishStatus:'PRIVATE'|'PENDING'|'PUBLISHED', publishRequestedAt}`.
- YOK — yayın isteği alanı/durumu ve 'ders/köşk destesi' ayrımı (backend'de deste yalnız `isPublic`, `authorId` taşır). Tuvaldeki üç durum (Özel / Yayın isteği bekliyor / Yayında) backend'de karşılanmıyor: `decks` tablosunda yalnız `isPublic boolean` var (apps/tedrisat/src/database/schema/flashcard-deck.schema.ts), yayın isteği/inceleme alanı ve endpoint'i yok.
- YOK — 'tekrar bekliyor' (due) hesabı: `flashcard_progress` yalnız `status` (NEW|LEARNING|MASTERED) tutar, zaman damgası yok (flashcard.schema.ts:35-44).

## 6. Sınıf

**B** — B: mevcut uçlar yalnız ham deste listesi verir; ilerleme özeti, yayın durumu ve deste kaynağı için yeni/değişen endpoint + şema alanları gerekir. Üçüncü parti yok.

## 7. Mevcut durum

apps/tedris/features/flashcards/components/ (decks-page.tsx, deck-detail-page.tsx, explore-decks-page.tsx, deck-cards-page.tsx, deck-cards-table.tsx, flashcard-list.tsx, deckform/*) ve rotalar apps/tedris/app/[locale]/decks/**. Mevcut arayüz shadcn/Radix kabuğunda, tuvaldeki mds-* tasarımına geçmemiş; metinler tuvalle uyuşmuyor (doğrulanamadı: tam karşılaştırma yapılmadı). decks-page.tsx 'Destelerim' + 'Koleksiyon' liste ve deste kartı var (deck/deck-card.tsx); süzgeç, ilerleme yüzdesi, yayın rozeti, tekrar bekliyor sayısı yok.

## 8. Kabul kriterleri

1. Sayfa oturumlu kullanıcının destelerini 'Destelerim' ve 'Koleksiyonum' altında ayrı listeler.
2. Süzgeç 'Yayın isteği bekliyor' seçilince yalnız PENDING desteler görünür; sayaçlar tuval ile aynı mantıkta.
3. Her kartta tamamlanan/toplam ve yüzde, MASTERED/cardCount ile hesaplanır.
4. 'Çalış' düğmesinin erişilebilir adı 'Çalış: <deste adı>'.
5. Koleksiyondaki deste kartlarında kart düzenleme eylemi yoktur.
6. Oturumsuz erişim giriş sayfasına yönlendirir.

## 9. Test senaryoları

- Unit: yüzde/sayaç hesabı, süzgeç fonksiyonu, durum rozeti eşlemesi.
- Unit: deste kartı bileşeni (rozet, 'N kart tekrar bekliyor' koşullu).
- E2E: giriş → Desteler → en az bir deste kartı → 'Yayın isteği bekliyor' sekmesi listeyi daraltır → 'Çalış' çalışma sayfasını açar. Seed: iki özel + bir PENDING deste.
