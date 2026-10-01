# 41 — Cihaz kısıtlaması (B15)

Kaynak: `local_docs/ekranlar/tedris/41-cihaz-kisitlamasi-b15/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: yok — tam sayfa, üst bar yok (yalnız 'Medaris' başlığı). Rota/tetik doğrulanamadı.

## 2. Gösterim

- Yalnız 'Medaris' başlığı, 'Erişim kısıtlandı' ve metin 'Bu bilgisayar erişim kısıtlamasına alınmıştır. Lütfen sistem yöneticisiyle görüşün.'


## 3. Durumlar

- Tek durum.

## 4. Etkileşimler

- Etkileşim yok.

## 5. API

- Kısıtlama kaynağı: backend'de cihaz/bilgisayar tanıma veya engelleme mekanizması YOK (tedrisat/teskilat kodunda bulunamadı). Cihaz kimliği, kısıtlama listesi ve uygulama noktası (ağ geçidi/Keycloak/uygulama) ürün+altyapı kararı.

## 6. Sınıf

**C** — C: cihaz kısıtlamasının nasıl tanınacağı (IP/sertifika/cihaz kaydı, hangi katman) tanımsız; insan/altyapı kararı ve sistem yöneticisi süreci gerektirir. Kodlanabilir kısım yalnız statik metin sayfasıdır.

## 7. Mevcut durum

Yok.

## 8. Kabul kriterleri

1. (Kod yazılmaz) Statik sayfa metni tuvalle birebir olmalı.
2. Tetik mekanizması kararı verilene dek ekran yönlendirilmez.

## 9. Test senaryoları

- Karar sonrası: unit (metin), e2e (kısıtlı cihaz simülasyonu) tanımlanır.
