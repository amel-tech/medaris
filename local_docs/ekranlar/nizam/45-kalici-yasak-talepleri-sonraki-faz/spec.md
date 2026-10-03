# 45 — kalici-yasak-talepleri-sonraki-faz

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Alt kademede yasak koyanların aynı kişinin platformdan yasaklanması için açtığı talepleri Medaris yönetiminin onayladığı/reddettiği ekran. Tuvalde "sonraki faz". Önerilen rota: `/[locale]/permanent-ban-requests`.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Kalıcı yasak talepleri", açıklama (onay kişiyi platformdan yasaklar ve hesabını kapatır; ret alt kademe yasağını bırakır).
- Sayaçlar: Karar bekleyen 2, Karara bağlanan 1.
- Kart: avatar+ad, "Karar bekliyor", "Mevcut yasak" (Kapsam, Koyan, Yasağın gerekçesi), "Talep" (Talep eden, Talebin gerekçesi).
- Düğmeler: "Yasaklamalar’da gör", "Reddet", "Onayla".

## 3. Durumlar

- Boş/yükleniyor/hata: tuvalde yok — doğrulanamadı.
- "Onayla" hesabı kapatır: Keycloak girişini devre dışı bırakır (bkz. 49).

## 4. Etkileşimler

- "Onayla": platform yasağı + hesap kapatma. "Reddet": gerekçeli ("Ret gerekcesi*", madde 17). "Yasaklamalar’da gör": 48'e gider.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Talep modülü | YOK — yeni endpoint | `GET /permanent-ban-requests`, `POST …/:id/approve/reject`. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |

## 6. Sınıf

**C** — Tuvalde "sonraki faz"; ayrıca onay, Keycloak hesap kapatmayı gerektirir (üçüncü parti yapılandırma). Kodlanmaz.

## 7. Mevcut durum

Yok. nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Bu fazda kodlanmaz.

## 9. Test senaryoları

- Kapsam dışı (sonraki faz).
