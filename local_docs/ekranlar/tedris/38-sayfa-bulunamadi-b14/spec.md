# 38 — Sayfa bulunamadı (B14)

Kaynak: `local_docs/ekranlar/tedris/38-sayfa-bulunamadi-b14/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `apps/tedris/app/[locale]/not-found.tsx` (+ kök için app/not-found.tsx); `notFound()` zaten çağrılıyor (ör. decks/study/[id]/page.tsx).

## 2. Gösterim

- Üst bar (giriş durumuna göre) + merkezde başlık 'Sayfa bulunamadı', metin 'Aradığın sayfa yok ya da artık burada değil. Adresi kontrol et ya da ana sayfadan devam et.', bağlantı düğmesi 'Ana sayfaya dön'.


## 3. Durumlar

- Tek durum; girişsiz kullanıcıda üst bar girişsiz biçim.

## 4. Etkileşimler

- 'Ana sayfaya dön': / (oturumluysa /home) adresine gider.

## 5. API

- Backend gerekmez; Next.js `not-found`/`error` dosya kuralları. Mevcut kodda apps/tedris/app altında not-found.tsx, error.tsx bulunmadı.

## 6. Sınıf

**A** — A: yalnız frontend.

## 7. Mevcut durum

Yok.

## 8. Kabul kriterleri

1. Bilinmeyen URL bu ekranı ve HTTP 404 durumunu verir.
2. Metin ve düğme tuvalle birebir aynıdır.
3. API'nin 404 döndürdüğü deste/ders sayfaları bu ekrana düşer.
4. Düğme ana sayfaya götürür.

## 9. Test senaryoları

- Unit: bileşen metin/bağlantı.
- E2E: /tr/olmayan-sayfa → başlık 'Sayfa bulunamadı' → düğme → ana sayfa.
