# 33 — Desteyi düzenle (sahibi)

Kaynak: `local_docs/ekranlar/tedris/33-desteyi-duzenle-sahibi/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks/[id]/edit` (apps/tedris/app/[locale]/decks/[id]/edit/page.tsx; form deckform/deck-meta-form.tsx).

## 2. Gösterim

- Ekran 28 üzerinde modal/panel 'MEHMÛZ FİİLLER — Desteyi düzenle': '* zorunlu alan', Deste adı* (yardım), Açıklama (isteğe bağlı).
- Yayın isteği bekliyorsa bilgi: 'Yayın isteğin bekliyor — Değişiklik isteği bozmaz; Medaris yönetimi isteği son hâliyle inceler.'
- 'Vazgeç', 'Kaydet'.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Doğrulama: ad boş olamaz.
- Kaydediliyor: 'Kaydet' busy; hata → Toast.
- Sahibi değilse 403 (ekran 39).

## 4. Etkileşimler

- 'Kaydet': ad/açıklamayı günceller, pencereyi kapatır, ekran 28 yenilenir.
- 'Vazgeç': kapatır (değişiklik varsa onay: tuvalde yok).

## 5. API

- Güncelle: `PATCH flashcard/decks/:id` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:219 (UpdateFlashcardDeckDto; yalnız sahibi, aksi 403) veya `PUT` :185.
- Yayın isteği durumu bilgisi: YOK — yeni alan (bkz. ekran 28). Tuvaldeki üç durum (Özel / Yayın isteği bekliyor / Yayında) backend'de karşılanmıyor: `decks` tablosunda yalnız `isPublic boolean` var (apps/tedrisat/src/database/schema/flashcard-deck.schema.ts), yayın isteği/inceleme alanı ve endpoint'i yok.

## 6. Sınıf

**B** — B: güncelleme ucu var ama pencerenin yayın isteği koşulu için ekran 28'deki yeni alan gerekir; yalnız ad/açıklama düzenlemek A olurdu.

## 7. Mevcut durum

apps/tedris/features/flashcards/components/ (decks-page.tsx, deck-detail-page.tsx, explore-decks-page.tsx, deck-cards-page.tsx, deck-cards-table.tsx, flashcard-list.tsx, deckform/*) ve rotalar apps/tedris/app/[locale]/decks/**. Mevcut arayüz shadcn/Radix kabuğunda, tuvaldeki mds-* tasarımına geçmemiş; metinler tuvalle uyuşmuyor (doğrulanamadı: tam karşılaştırma yapılmadı). deck-meta-form.tsx + validations/deck-meta-form-schema.ts var; isPublic anahtarı formda olabilir (tuvalde yok — doğrulanamadı).

## 8. Kabul kriterleri

1. Düzenle penceresi mevcut ad ve açıklamayla dolu açılır.
2. Boş ad kaydedilemez.
3. Kaydet sonrası liste ve ayrıntı sayfası yeni adı gösterir.
4. Yayın isteği PENDING iken düzenleme isteği iptal etmez, bilgi metni görünür.
5. Sahibi olmayan kullanıcı PATCH'te 403 alır.

## 9. Test senaryoları

- Unit: form şeması.
- E2E: sahibi → Düzenle → adı değiştir → Kaydet → başlık güncellenir; Desteler listesinde yeni ad.
