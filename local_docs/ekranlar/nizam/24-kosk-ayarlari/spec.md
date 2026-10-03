# 24 — Köşk ayarları

Kaynak: `24-kosk-ayarlari/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı köşkün sayfada görünen bilgilerini, görünürlüğünü ve köşk genelindeki politikaları düzenler; köşkü gizler.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/ayarlar` (sekmeler: Genel / Köşk nazımları / Barındırma hakları)`
- Mevcut rota/dosya: Kısmi karşılık: apps/nizam/features/kosks/components/kosk-form-dialog.tsx (164 satır; ad, handle, açıklama alanları) kosk-detail-page.tsx'ten 'Köşkü Düzenle' ile açılır.

## 2. Gösterim
- Başlık 'Köşk ayarları', sekme çubuğu 'Genel', 'Köşk nazımları 1', 'Barındırma hakları 1'.
- 'Köşk bilgileri': Ad* (zorunlu), Kısa ad (salt okunur, Medaris yönetimi değiştirir), Alan* (Arapça dil ilimleri, Belâgat, Fıkıh, Fıkıh usûlü, Hadis, Kur'an ilimleri, Tefsir, Akaid ve kelâm, Siyer, Mantık, Diğer), Seviye* (Bütün seviyeler/Başlangıç/Orta/İleri), Etiketler (virgülle), Kapak (Lâciverd, Bordo, Zümrüt, Mürekkep), Açıklama.
- 'Görünürlük': 'Listelerde gösterme' anahtarı + açıklama.
- 'Politikalar': 'Kayıt her zaman onaylı', 'Ders kayıtları herkese açılamaz' anahtarları.
- Alt: 'Vazgeç', 'Kaydet'; tehlike bölümü 'Köşkü gizle'.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Kayıtlı: Toast başarı; kirli form 'Kaydet' etkin.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Doğrulama: Ad zorunlu (kural: CreateKoskDto name 2-120 karakter, apps/tedrisat/src/kosk/dto/create-kosk.dto.ts:15-19), Alan ve Seviye zorunlu; hata, yardımın yerini alır (madde 9).
- Kısa ad alanı salt okunur.

## 4. Etkileşimler
- Alanlar düzenlenir; 'Kaydet' değişenleri gönderir; 'Vazgeç' formu sıfırlar.
- 'Listelerde gösterme' = köşk gizli (`isPrivate`); politikalar köşkteki tüm derslere uygulanır.
- 'Köşkü gizle' → onay penceresi → köşk ve dersleri listelerden çıkar, Arşiv'den geri alınır.

## 5. API
- `PATCH /kosks/:id` — VAR, apps/tedrisat/src/kosk/kosk.controller.ts:95; UpdateKoskDto alanları name, handle, description, coverHue, isPrivate, field, level, tags (kosk/dto/create-kosk.dto.ts:15-62).
- `GET /kosks/:id` — VAR, kosk.controller.ts:66.
- Politikalar (`alwaysRequireApproval`, `recordingsNeverPublic`) — YOK — mevcut `PATCH /kosks/:id` DTO'suna eklenecek (değişen endpoint) ve şemaya sütun.
- `POST /kosks/:id/hide` ve `POST /kosks/:id/restore` — YOK — yeni endpoint (köşk gizli durumu şemada yok; `DELETE /kosks/:id` kalıcı siler: kosk.controller.ts:111).
- Kapak: tuvalde 4 ad (Lâciverd…), backend `coverHue` 0-360 sayı (create-kosk.dto.ts:36-41); ad→hue eşlemesi frontend'de, eşleme tablosu tuvalde yok — doğrulanamadı.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Temel alanlar için endpoint hazır; politikalar ve gizleme için DTO/şema ve iki yeni endpoint gerekir. Üçüncü parti yok.

## 7. Mevcut durum
Kısmi: kosk-form-dialog.tsx ad/kısa ad/açıklama düzenler; alan, seviye, etiket, kapak, görünürlük, politika ve gizleme yok.

## 8. Kabul kriterleri
1. Sayfa mevcut köşk değerleriyle dolu açılır; Kısa ad salt okunurdur.
2. Ad boşken 'Kaydet' hata gösterir ve istek atmaz.
3. 'Kaydet' sonrası değerler `GET /kosks/:id` ile aynıdır.
4. 'Listelerde gösterme' açıkken köşk Keşfet listesinde görünmez.
5. Politika anahtarları kaydedilir ve köşkün derslerinde uygulanır.
6. 'Köşkü gizle' köşkü Arşiv'e taşır; geri alınabilir.

## 9. Test senaryoları
**Unit (Vitest)**
- Form şeması (ad 2-120).
- Kapak adı↔hue eşleme fonksiyonu.
- Etiket virgül ayrıştırma.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk nazımı → Köşk ayarları → Ad değiştir → Kaydet → yenile → kalıcı.
- Görünürlük anahtarı → köşk listesinde kaybolur.
- Köşkü gizle → Arşiv'de görünür.
- Sahip olmayan kullanıcı PATCH → 403.
