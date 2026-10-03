# 39 — Bu sayfayı göremezsin (B14)

Kaynak: `local_docs/ekranlar/tedris/39-bu-sayfayi-goremezsin-b14/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: yetki reddi bileşeni (ör. `features/errors/forbidden-state.tsx`), 403 yakalandığında sayfa içinde gösterilir. Metin bağlamsal: tuvalde 'Kırk hadis herkese açık bir deste; kartlarını yalnız sahibi düzenler…' ve 'Desteye dön'.

## 2. Gösterim

- Üst bar + başlık 'Bu sayfayı göremezsin'; bağlamsal açıklama (kaynağa göre değişir; örnek: okuyucunun deste kartlarını düzenlemeye çalışması) ve geri dönüş düğmesi ('Desteye dön').


## 3. Durumlar

- Kaynağa göre metin: düzenleme yetkisi yok / özel kaynak. Genel varsayılan metin tuvalde yok — doğrulanamadı.

## 4. Etkileşimler

- Düğme: ilgili üst sayfaya (deste ayrıntısı) gider.

## 5. API

- Backend 403 üretir: `ForbiddenException`/`@ApiForbiddenResponse` — apps/tedrisat/src/flashcard/flashcard-deck.controller.ts:51,85,115 ve apps/tedrisat/src/flashcard/flashcard.controller.ts (sahibi olmayan deste). İstemci 403'ü yakalayıp bu bileşeni gösterir. Yeni endpoint gerekmez.

## 6. Sınıf

**A** — A: yalnız frontend; 403 yanıtları mevcut.

## 7. Mevcut durum

Yok (403'ün sayfada işlenmesi doğrulanamadı; use-case'e göre uçlarda hata yakalama gerekir).

## 8. Kabul kriterleri

1. Sahibi olmayan kullanıcı /decks/[id]/edit veya cards düzenleme rotasına girdiğinde bu ekran görünür.
2. Metin deste adını ve kuralı içerir.
3. 'Desteye dön' deste ayrıntısına götürür.
4. API 403 dönmeden bu ekran gösterilmez.

## 9. Test senaryoları

- Unit: bileşen, bağlam metni.
- E2E: B kullanıcısı A'nın destesinin /edit adresine gider → ekran → 'Desteye dön' → ayrıntı.
