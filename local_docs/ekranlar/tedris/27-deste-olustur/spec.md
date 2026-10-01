# 27 — Deste oluştur

Kaynak: `local_docs/ekranlar/tedris/27-deste-olustur/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Mevcut: `/decks/create` (apps/tedris/app/[locale]/decks/create/page.tsx → create-deck-page.tsx + deckform/*).

## 2. Gösterim

- Breadcrumb Desteler / Deste oluştur; başlık + alt metin; '* zorunlu alan'.
- Alanlar: Deste adı* (yardım: 'Listelerde ve deste sayfasında bu ad görünür.'), Açıklama (isteğe bağlı), Kart türü* (radyo: Kelime / Hadis, her birinin açıklamasıyla), Etiketler (virgülle ayrılan, yalnız sahibi görür).
- Bilgi kutusu 'Deste özel başlar' + metin.
- Eylemler: 'Vazgeç', 'Oluştur'. Yan önizleme: 'Kelime kartı böyle görünür' (ÖN YÜZ/ARKA YÜZ örneği, seçilen türe göre değişir) + CSV/Excel aktarma notu.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Form doğrulama: ad boş → hata (metin tuvalde yok, doğrulanamadı); tür seçilmeden gönderilemez.
- Gönderiliyor: 'Oluştur' busy.
- Sunucu hatası: Toast (kalıcı) + alanlar korunur.
- Oturumsuz: giriş yönlendirmesi.

## 4. Etkileşimler

- 'Oluştur': deste yaratır (isPublic=false), başarıda deste ayrıntısına (/decks/[id]) gider.
- 'Vazgeç': /decks'e döner (değişiklik varsa onay: tuvalde yok).
- Tür radyosu: önizleme örneğini değiştirir.

## 5. API

- Deste oluşturma: `POST flashcard/decks` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:134 (CreateFlashcardDeckDto: title, isPublic, description; apps/tedrisat/src/flashcard/dto/create-flashcard-deck.dto.ts).
- Etiket: `POST flashcard-deck-label/create` + `/labeling` — apps/tedrisat/src/flashcard/flashcard-deck-label.controller.ts:55,95 (kapsam/Scope kuralları incelenmeli).
- DEĞİŞEN endpoint: kart türü deste alanı değil, kart alanı. Önerilen: `CreateFlashcardDeckDto`'ya `cardType: 'VOCABULARY'|'HADEETH'` ekle (schema + migration) ve `POST /flashcard/decks` kabul etsin; etiketler `tags?: string[]` ile tek istekte. Kart türü (Kelime/Hadis) kart başına `type` (VOCABULARY|HADEETH, flashcard-type.enum.ts); destenin kendisinde tür alanı yok — tuvaldeki 'deste türü' ya türetilmeli ya da alan eklenmeli.

## 6. Sınıf

**B** — B: deste oluşturma var; kart türü ve tek istekle etiket için DTO/şema değişikliği gerekir.

## 7. Mevcut durum

apps/tedris/features/flashcards/components/ (decks-page.tsx, deck-detail-page.tsx, explore-decks-page.tsx, deck-cards-page.tsx, deck-cards-table.tsx, flashcard-list.tsx, deckform/*) ve rotalar apps/tedris/app/[locale]/decks/**. Mevcut arayüz shadcn/Radix kabuğunda, tuvaldeki mds-* tasarımına geçmemiş; metinler tuvalle uyuşmuyor (doğrulanamadı: tam karşılaştırma yapılmadı). create-deck-page.tsx ve deckform/ ile başlık/açıklama/isPublic formu var; tür radyosu, etiket alanı, önizleme yok; isPublic seçimi tuvalde YOK (özel başlar) — kaldırılmalı.

## 8. Kabul kriterleri

1. Zorunlu alan boşken 'Oluştur' hata gösterir, istek atılmaz.
2. Oluşan deste `isPublic=false` olur.
3. Başarıda kullanıcı yeni deste ayrıntı sayfasına yönlenir.
4. Tür seçimi önizlemeyi değiştirir (Kelime↔Hadis).
5. Etiketler virgülle ayrılıp kırpılır; boş etiket yok sayılır.
6. 'Vazgeç' hiçbir istek atmadan Desteler'e döner.

## 9. Test senaryoları

- Unit: form şeması (ad zorunlu, tür zorunlu), etiket ayrıştırma.
- E2E: giriş → Desteler → Deste oluştur → ad+tür doldur → Oluştur → ayrıntı sayfası başlığı ad ile eşleşir; Desteler'de 'Özel' rozetiyle görünür.
