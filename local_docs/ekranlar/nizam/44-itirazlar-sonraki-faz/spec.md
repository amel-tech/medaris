# 44 — itirazlar-sonraki-faz

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Medaris yönetiminin medrese/köşk itirazlarına (köşk yasağı, celse gizleme) karar verdiği ekran. Tuvalde "sonraki faz" etiketi var. Önerilen rota: `/[locale]/appeals`. Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "İtirazlar", açıklama (köşkün eylemi karar verilene kadar yürürlükte; kendi eylemine itiraza karar verilemez; karar medrese ve köşke görünür).
- Sayaçlar: Karar bekleyen 2, Karara bağlanan 1.
- Kart: başlık ("Köşk yasağına itiraz: Elif Nur Taşdelen"), rozet "Karar bekliyor", Medrese, Köşk, İtiraz eden (rol), İtiraz tarihi, "İtiraz edilen eylem" tablosu (Eylem, Eylemi yapan, Zaman, Gerekçe, Denetim kaydı bağlantısı #48107), "Medresenin gerekçesi" metni.
- Düğmeler: "Kararı sürdür", "Kararı kaldır" (kişi/eylem adıyla aria-label).

## 3. Durumlar

- Boş/yükleniyor/hata metinleri tuvalde yok — doğrulanamadı.
- Köşk nazımı kendi eylemine itirazı karara bağlayamaz (düğmeler yok/disabled).
- Karar penceresi "Kararın gerekçesi*" zorunlu (_kurallar.md madde 17).

## 4. Etkileşimler

- "Kararı sürdür"/"Kararı kaldır": gerekçeli karar Dialog'u (tuvalde pencere yok — doğrulanamadı).
- Denetim kaydı bağlantısı denetim sayfasına gider.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| İtiraz modülü | YOK — yeni endpoint | `GET /appeals`, `POST /appeals/:id/decision` önerilir. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |

## 6. Sınıf

**C** — Tuvalde açıkça "sonraki faz" (dizin başlığı "İtirazlar (sonraki faz)"); yasaklama ve celse gizleme önkoşulları da henüz yok. Kodlanmaz.

## 7. Mevcut durum

Yok. nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Bu ekran bu fazda kodlanmaz; kabul kriteri yok. Sonraki faz için: karar sürdür/kaldır gerekçeli, kaydı denetim kaydına yazar.

## 9. Test senaryoları

- Kapsam dışı (sonraki faz).
