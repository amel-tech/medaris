# 46 — bildirimler-nizam

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Medaris başnazımının yönetim bildirimlerini (köşk başvuruları, yasaklar, deste yayın istekleri, itirazlar, kalıcı yasak talepleri) tarih gruplarıyla listelediği sayfa. Köşk nazımı için aynı bileşenin köşk kapsamlı hali 37'dir. Önerilen rota: `/[locale]/notifications`. Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Bildirimler", açıklama; "Tümünü okundu say" düğmesi.
- Filtre sekmeleri: Tümü 19, Okunmamış 4; "Bildirim türü" seçici: Tümü, Köşk başvuruları, Yasaklar, Deste yayın istekleri, İtirazlar, Kalıcı yasak talepleri.
- Gruplar: BUGÜN / DÜN / DAHA ÖNCE; her satır: başlık ("Yeni ders yasağı"…), "Yeni" rozeti (okunmamış), gövde (kim, kime, gerekçe), alt satır (kaynak·saat), satır düğmesi "Okundu say".
- Kabuk: yan menü rozetli sayaçlar (Bildirimler 4 okunmamış; Pasif kapsamlar 2 yöneticisiz; Köşk başvuruları 3; Deste yayın istekleri 2; İtirazlar 2; Kalıcı yasak talepleri 2).

## 3. Durumlar

- Yükleniyor: satır iskeleti.
- Boş: "Bildirim yok" (metin tuvalde yok — doğrulanamadı).
- Hata: Alert (doğrulanamadı).
- Yetkisiz: bildirim türleri yetkiye göre süzülür (Medaris nazımı yalnız izinli türleri görür; 51'de yan menü daha kısa).

## 4. Etkileşimler

- Tür seçici ve sekme listeyi süzer.
- "Okundu say" tek bildirimi okundu yapar; "Tümünü okundu say" hepsini.
- Satır tıklama ilgili ekrana gider (hedef rota tuvalde belirtilmemiş — doğrulanamadı).
- Zil (AppBar) rozetli sayı `aria-label="Bildirimler, N okunmamış"` (_kurallar.md madde 10).

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Bildirim listesi | YOK — yeni endpoint | `GET /me/notifications?type=&read=` → sayfalı liste + `unreadCount`. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| Okundu | YOK — yeni endpoint | `POST /me/notifications/:id/read`, `POST /me/notifications/read-all`. |
| Kaynak olaylar | kısmen | Köşk başvurusu için kaynak `kosks` tablosu var (apps/tedrisat/src/kosk/kosk.controller.ts:79 `POST kosks`); yasak, deste yayın isteği, itiraz, kalıcı yasak talebi olayları henüz yok. |

## 6. Sınıf

**B** — Bildirim tablosu ve uçları yazılabilir, üçüncü parti yok; olay üreticileri (yasak vb.) bağımlılık olduğundan ilk teslimde yalnız mevcut olaylar (köşk başvurusu) üretilir, diğer türler ilgili özellik gelince.

## 7. Mevcut durum

Yok. nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Liste tarih gruplarıyla ve okunmamış rozetiyle çizilir.
2. Tür filtresi yalnız seçilen türü gösterir.
3. "Okundu say" satırı okundu yapar ve okunmamış sayacını 1 azaltır.
4. "Tümünü okundu say" sayacı 0'a çeker; yan menü rozeti güncellenir.
5. Başka kullanıcının bildirimi okundu yapılamaz (404/403).
6. Tuvaldeki bildirim metin şablonları (gövde cümleleri) birebir kullanılır.

## 9. Test senaryoları

- Unit: gruplama (Bugün/Dün/Daha önce), filtre, rozet sayacı.
- Backend e2e: bildirim oluştur → listele → okundu → unreadCount.
- Playwright: oturum aç → Bildirimler → "Köşk başvuruları" filtresi → bir satırı okundu say → sayacın düştüğünü doğrula → "Tümünü okundu say".
