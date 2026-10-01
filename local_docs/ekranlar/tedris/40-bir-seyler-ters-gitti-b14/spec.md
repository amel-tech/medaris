# 40 — Bir şeyler ters gitti (B14)

Kaynak: `local_docs/ekranlar/tedris/40-bir-seyler-ters-gitti-b14/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `apps/tedris/app/[locale]/error.tsx` (+ `global-error.tsx`). Mevcut dosya yok.

## 2. Gösterim

- Üst bar; başlık 'Bir şeyler ters gitti'; metin 'Sunucuya ulaşılamadı. İnternet bağlantını denetleyip yeniden dene.'; düğme 'Yeniden dene'.


## 3. Durumlar

- Ağ hatası/5xx/beklenmeyen hata aynı ekran; uygulama kabuğu da çöktüğünde global-error (üst bar olmadan) — doğrulanamadı.

## 4. Etkileşimler

- 'Yeniden dene': `reset()` ile segmenti yeniden dener.

## 5. API

- Backend gerekmez; Next.js `not-found`/`error` dosya kuralları. Mevcut kodda apps/tedris/app altında not-found.tsx, error.tsx bulunmadı.

## 6. Sınıf

**A** — A: yalnız frontend.

## 7. Mevcut durum

Yok.

## 8. Kabul kriterleri

1. Sunucu bileşeni hata fırlatınca bu ekran görünür.
2. 'Yeniden dene' segmenti yeniden çizer; başarılıysa içerik gelir.
3. Hata ayrıntısı kullanıcıya gösterilmez.
4. Metin tuvalle birebir.

## 9. Test senaryoları

- Unit: error bileşeni reset çağrısı.
- E2E: API'yi durdur (ya da route intercept) → sayfa → ekran → API'yi aç → 'Yeniden dene' → içerik.
