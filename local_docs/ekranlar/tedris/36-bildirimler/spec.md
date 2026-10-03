# 36 — Bildirimler

Kaynak: `local_docs/ekranlar/tedris/36-bildirimler/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/notifications`. Mevcut: yalnız zil hover kartı apps/tedris/components/header/user-notification-menu.tsx ('Yeni bildirim yok' metni).

## 2. Gösterim

- Başlık 'Bildirimler' + alt metin; sağ üst 'Tümünü okundu say'.
- Sekmeler: Tümü (6) / Okunmamış (3).
- Gün grupları: BUGÜN / DÜN / DAHA ÖNCE; bildirim satırı: tür ikonu, başlık (bağlantı), gövde, 'kaynak·saat/tarih', 'Yeni' rozeti, '…' menü.
- Tür örnekleri: Celse iptal edildi, Yeni ders kaydı, Başvurun onaylandı (reddedildi + gerekçe), Dersten çıkarıldın, Erişimin kaldırıldı, Celse saati değişti, Köşk başvurusu sonucu, Deste yayın isteği sonucu.
- Yan kart 'Neler bildirilir' (statik liste) + 'E-posta tercihleri' düğmesi.
- AppBar zili: aria-label 'Bildirimler, N okunmamış' (kural 10).
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: iskelet.
- Boş: 'Bildirim yok' (metin doğrulanamadı).
- Hata: SystemState + yeniden dene.
- 'Okunmamış' sekmesi boş: boş mesaj (doğrulanamadı).
- Okundu işaretleme hatası: geri al + Toast.

## 4. Etkileşimler

- Bildirim başlığı/gövdesi: ilgili sayfaya gider (hedef türe göre: ders, celse, deste, köşk başvurusu).
- '…' menü: okundu/okunmadı (içerik tuvalde yok — doğrulanamadı).
- 'Tümünü okundu say': hepsini okundu yapar, rozetler kalkar, zil aria-label güncellenir.
- 'E-posta tercihleri': e-posta ayar sayfasına gider (SMTP gerektirir — bkz. gerekçe).

## 5. API

- YOK — yeni endpoint: `GET /notifications?status=unread|all&cursor=`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /notifications/unread-count`. Backend'de bildirim modeli/controller'ı yok (tedrisat controller listesi: course, kosk, flashcard).
- Üreticiler (olay → bildirim): başvuru onay/ret (courses/:id/enrollments/:userId/approve — apps/tedrisat/src/course/course.controller.ts:196 ve DELETE :211 mevcut), ders kaydı ekleme, celse iptal/saat değişikliği, köşk başvurusu, deste yayın isteği — çoğu olay kaynağı henüz yok (ekran 24/37/28 ile bağlı).

## 6. Sınıf

**B** — B: uygulama içi bildirim listesi/okundu için yeni tablo + 4 endpoint ile kodlanır. E-posta bildirimi/tercihleri SMTP gerektirir (C bileşeni) ve bu ekranın kapsamı dışında tutulmalı; olay üreticilerinin bir kısmı henüz yok.

## 7. Mevcut durum

Yalnız zil ikonlu hover kartı (user-notification-menu.tsx); sayfa, liste, sekmeler yok.

## 8. Kabul kriterleri

1. Liste yeni→eski, BUGÜN/DÜN/DAHA ÖNCE gruplarıyla görünür; sekme sayaçları doğru.
2. 'Tümünü okundu say' sonrası Okunmamış sayacı 0 ve 'Yeni' rozetleri kalkar.
3. Bildirime tıklayınca ilgili sayfaya gidilir ve bildirim okundu olur.
4. Zilin erişilebilir adı okunmamış sayısını söyler (0 ise yalnız 'Bildirimler').
5. Başka kullanıcının bildirimi hiçbir zaman dönmez.

## 9. Test senaryoları

- Unit: gün gruplama, sayaç, aria-label üretimi.
- E2E: bildirim seed'le → /notifications → 'Okunmamış' sekmesi 3 → birini aç → sayaç 2 → 'Tümünü okundu say' → 0.
