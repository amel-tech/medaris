# 26 — Desteleri keşfet

Kaynak: `local_docs/ekranlar/tedris/26-desteleri-kesfet/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks/explore` (apps/tedris/app/[locale]/decks/explore/page.tsx → explore-decks-page.tsx, 209 satır).

## 2. Gösterim

- Breadcrumb Desteler / Desteleri keşfet; başlık + alt metin.
- Kart türü süzgeci (ChoiceChips): Tümü / Kelime / Hadis.
- 'Derslerinin desteleri · 4 deste': kayıtlı derslerin ders/köşk/medrese destesi kartları (rozet: Ders destesi / Köşk destesi / Medrese destesi; alt satır: ders·müderris veya köşk/medrese adı); eylem: 'Koleksiyonda' + 'Çıkar' ya da 'Koleksiyona ekle'.
- 'Herkese açık desteler · 6 deste': Medaris yönetimince yayımlanmış desteler; eylem aynı; kendi destesinde rozet 'Senin desten'.
- Her kartta kart sayısı·tür, varsa 'Tamamlanan: X / Y' ve yüzde.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: iskelet.
- Boş: bölüm boşsa kısa EmptyState (metin doğrulanamadı).
- Hata: SystemState + yeniden dene.
- Ekleme/çıkarma sırasında düğme 'busy' (çift tıklama engeli); hata → Toast (uyarı/hata kalıcı, kural 21).

## 4. Etkileşimler

- Kart türü süzgeci: iki bölümü de süzer.
- 'Koleksiyona ekle': desteyi koleksiyona ekler, düğme 'Koleksiyonda' + 'Çıkar' olur.
- 'Çıkar': koleksiyondan çıkarır (AlertDialog gerektirmez; tuvalde onay yok).
- Kart gövdesi: deste ayrıntısı (/decks/[id]).

## 5. API

- Herkese açık + kendi: `GET flashcard/decks?isPublic=true` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:112.
- Koleksiyona ekle: `POST flashcard/decks/:id/collections` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:157; çıkar: `DELETE flashcard/decks/:id/collections` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:268; koleksiyon: `GET flashcard/decks/collections` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:58.
- YOK — yeni endpoint: `GET /flashcard/decks/explore?cardType=` → `{courseDecks:[…], publicDecks:[…]}` (kayıtlı derslerin ders/köşk/medrese desteleri `source` ile; her biri `inCollection`, ilerleme özeti). Backend'de deste↔ders/köşk bağı yok (flashcard-deck.schema.ts yalnız authorId), `isPublic` yeterli değil. Medrese varlığı backend'de bulunmadı (doğrulanamadı).
- Tür süzgeci: kart türü kart başına (VOCABULARY|HADEETH); deste türü sorgusu için yeni alan/join gerekir. Kart türü (Kelime/Hadis) kart başına `type` (VOCABULARY|HADEETH, flashcard-type.enum.ts); destenin kendisinde tür alanı yok — tuvaldeki 'deste türü' ya türetilmeli ya da alan eklenmeli.

## 6. Sınıf

**B** — B: açık desteler için mevcut uç var; 'derslerinin desteleri' ve tür süzgeci için yeni endpoint + deste↔ders/köşk ilişkisi gerekir. Üçüncü parti yok.

## 7. Mevcut durum

apps/tedris/features/flashcards/components/ (decks-page.tsx, deck-detail-page.tsx, explore-decks-page.tsx, deck-cards-page.tsx, deck-cards-table.tsx, flashcard-list.tsx, deckform/*) ve rotalar apps/tedris/app/[locale]/decks/**. Mevcut arayüz shadcn/Radix kabuğunda, tuvaldeki mds-* tasarımına geçmemiş; metinler tuvalle uyuşmuyor (doğrulanamadı: tam karşılaştırma yapılmadı). explore-decks-page.tsx açık desteleri listeler ve koleksiyona ekler; ders destesi bölümü, tür süzgeci yok.

## 8. Kabul kriterleri

1. İki bölüm de sayaçla ('4 deste', '6 deste') görünür; sayaç gerçek sonuç sayısıdır.
2. 'Kelime' süzgeci Hadis türü desteleri iki bölümden de çıkarır.
3. 'Koleksiyona ekle' tıklandıktan sonra sayfa yenilenince deste 'Koleksiyonda' görünür ve Desteler sayfasında 'Koleksiyonum' altında yer alır.
4. 'Çıkar' desteyi koleksiyondan kaldırır; Desteler sayfasından kaybolur.
5. Kullanıcının kendi destesi 'Senin desten' rozetiyle görünür ve ekle/çıkar eylemi sunmaz.
6. Başkasının özel destesi hiçbir zaman listelenmez.

## 9. Test senaryoları

- Unit: süzgeç, sayaç, ekle/çıkar iyimser güncelleme.
- E2E: giriş → Desteler → Desteleri keşfet → bir desteyi 'Koleksiyona ekle' → Desteler sayfasında koleksiyonda görünür → geri dönüp 'Çıkar'. Seed: bir PUBLIC deste (başka yazar).
