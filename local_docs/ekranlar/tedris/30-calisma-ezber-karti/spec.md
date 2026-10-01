# 30 — Çalışma (ezber kartı)

Kaynak: `local_docs/ekranlar/tedris/30-calisma-ezber-karti/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks/study/[id]` (apps/tedris/app/[locale]/decks/study/[id]/page.tsx → study-page.tsx → flashcard-list.tsx; ayrıca `/decks/study`).

## 2. Gösterim

- Breadcrumb Desteler / <deste> / Çalışma; başlık 'Çalışma'; alt: '<deste> · Bugün tekrar bekleyen 6 kart'; 'Çalışmayı bitir'.
- İlerleme: 'Bu tur: 2 / 6 kart' + %33 çubuk.
- Kart: 'Kart 3 / 6', durum rozeti 'Öğreniliyor', ÖN YÜZ (Arapça), 'ARKA YÜZ' bölümü (kart çevrilince), 'Ne kadar zordu?' + Zor / Orta / Kolay düğmeleri.
- Telefon varyantı ekran-telefon.png (30 için var).
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: kart iskeleti.
- Tekrar bekleyen kart yok: 'bugün için bitti' durumu (metin tuvalde yok — doğrulanamadı).
- Tur bitti: özet/yönlendirme (tuvalde yok — doğrulanamadı).
- Kayıt hatası: Toast, kart geri alınır; çevrimdışıysa yeniden dene.
- Girişsiz: ilerleme kaydedilmez (ekran 32).

## 4. Etkileşimler

- Kart tıklama/boşluk: arka yüzü gösterir/gizler.
- Zor/Orta/Kolay: kartı değerlendirir, ilerlemeyi yazar, sonraki karta geçer, tur sayacı artar.
- 'Çalışmayı bitir': turu bitirir, deste ayrıntısına döner (hedef doğrulanamadı).

## 5. API

- İlerleme yazma: `PUT flashcard/cards/progress` — apps/tedrisat/src/flashcard/flashcard.controller.ts:206 (gövde: [{flashcardId, status}], status NEW|LEARNING|MASTERED).
- Kartlar: `GET flashcard/cards?deckId=&include=progress` — apps/tedrisat/src/flashcard/flashcard.controller.ts:130.
- YOK — 'bugün tekrar bekleyen' kuyruğu ve Zor/Orta/Kolay eşlemesi: tabloda yalnız `status` var (flashcard.schema.ts:35-44), zorluk/aralık/son-tekrar tarihi yok. Önerilen: `flashcard_progress`'e `dueAt`, `ease`; `GET /flashcard/decks/:id/due` → bugünkü kartlar; PUT gövdesine `rating:'HARD'|'MEDIUM'|'EASY'`. Aralıklı tekrar algoritması ürün kararı: doğrulanamadı.

## 6. Sınıf

**B** — B: ilerleme yazma var, tekrar zamanlaması/kuyruk yok → yeni endpoint ve şema. Algoritma ürün kararı beklediğinden en küçük sürüm (Zor→LEARNING, Orta→LEARNING, Kolay→MASTERED) varsayımı doğrulanmalı.

## 7. Mevcut durum

apps/tedris/features/flashcards/components/flashcard-list.tsx, flashcard-content.tsx, flashcard.tsx: kart çevirme listesi var; tur sayacı, zorluk düğmeleri, ilerleme yazma yok (progress isteğini yapan kod doğrulanamadı).

## 8. Kabul kriterleri

1. Sayfa yalnız tekrar bekleyen kartları sırayla gösterir; 'Kart N / M' ve 'Bu tur: k / M' doğru ilerler.
2. Arka yüz ilk açılışta gizlidir; çevirince görünür.
3. Bir derecelendirme seçildiğinde tek bir `PUT cards/progress` isteği gider ve sonraki kart gelir.
4. Tüm kartlar bitince tur sonu durumu görünür.
5. 'Çalışmayı bitir' kalan kartları değiştirmez ve çıkar.

## 9. Test senaryoları

- Unit: tur sayacı ve kuyruk reducer'ı; derecelendirme→status eşlemesi.
- E2E: giriş → deste → Çalış → arka yüzü göster → 'Kolay' → sayaç 1/…; Deste ayrıntısında 'Tamamlandı' sayısı +1.
