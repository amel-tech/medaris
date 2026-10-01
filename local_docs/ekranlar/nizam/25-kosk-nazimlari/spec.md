# 25 — Köşk nazımları

Kaynak: `25-kosk-nazimlari/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımının köşkü yöneten köşk nazımlarını salt okunur görmesi; liste Medaris yönetimi tarafından değiştirilir.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/ayarlar/nazimlar``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Breadcrumb 'Köşk ayarları / Köşk nazımları', başlık, sekmeler (Genel, Köşk nazımları 1, Barındırma hakları 1).
- Bilgi: 'Köşk nazımlarını Medaris yönetimi atar; bu listeyi buradan değiştiremezsiniz.'
- Tablo: Köşk nazımı (avatar, ad, 'Siz'), Atayan (ad+rol), Atanma tarihi, Süre ('Süresiz').
- Altta 'Köşk nazımı bu köşkte' yetki listesi (6 madde) ve medrese dersleri notu.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Boş: tuvalde yok (köşk nazımsız köşk pasif sayılır); metin doğrulanamadı.

## 4. Etkileşimler
- Salt okunur; satır eylemi yok.
- Sekme gezintisi diğer ayar sayfalarına götürür.

## 5. API
- `GET /kosks/:id/nazimlar` — YOK — yeni endpoint; yanıt `{user, grantedBy, grantedAt, endsAt}[]`.
- Mevcut yakın veri: `KoskResponse.ownerId` yalnız sahip kimliği (kosk/dto/kosk-response.dto.ts:6-7), ad/atayan/tarih yok.
- Yetki metni statik içeriktir (i18n), API gerekmez.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Üyelik/atama verisi yok; küçük bir okuma endpoint'i ve tablo gerekir (21'deki üyelik modeliyle birlikte yapılmalı).

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Sayfa köşkün nazımlarını Atayan/Atanma/Süre ile listeler; kendi satırında 'Siz' yazar.
2. Ekleme/çıkarma düğmesi yoktur.
3. Süresi olmayan atama 'Süresiz' görünür.
4. Köşk nazımı olmayan 403 görür.

## 9. Test senaryoları
**Unit (Vitest)**
- Süre biçimleyici (Süresiz/tarih).
- 'Siz' rozeti eşlemesi.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk nazımı → Köşk ayarları → Köşk nazımları sekmesi.
- Tek satır, 'Siz' etiketi.
- Başka köşk id'si ile 403.
