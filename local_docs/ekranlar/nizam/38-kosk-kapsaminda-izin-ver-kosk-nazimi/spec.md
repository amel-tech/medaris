# 38 — Köşk kapsamında izin ver (köşk nazımı)

Kaynak: `38-kosk-kapsaminda-izin-ver-kosk-nazimi/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı, köşkün medrese dışı derslerinde ders nazırı atar ve izin verir; atanmış ders nazırlarını listeler, izinlerini düzenler ya da görevden alır.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/izinler``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Başlık 'İzinler', açıklama, 'Ders nazırı ata' düğmesi; not: bazı dersler medresenindir, izni medrese kadrosu verir.
- 'Atanmış ders nazırları — 1 kişi' tablosu: Ders nazırı (ad, e-posta), Ders, İzinler ('8 izin' + ad listesi), Bitiş (tarih; 'Görev ve izinler aynı gün biter.'), Veren (ad, tarih), İşlemler 'İzinleri düzenle', 'Görevden al'.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: 'Henüz ders nazırı yok' (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Verilen izin kendi izinlerini aşamaz → hata (kural metinde; hata metni yok — doğrulanamadı).
- Görevden alma penceresi sürüm kapısına bağlı: _kurallar.md madde 15 — 4 Ekim 2026'ya kadar açılmaz.

## 4. Etkileşimler
- 'Ders nazırı ata' → izin verme Dialog'u (ayrı ekran 12/benzeri; ders, kişi, izin seçimi).
- 'İzinleri düzenle' → aynı Dialog satır için.
- 'Görevden al' → görevden alma Dialog'u (Devral/Düşür satırları, madde 15).

## 5. API
- Yok — hiçbir izin/ders nazırı endpoint'i yok. Yalnız rol çözücü: `TedrisatRoleResolver` kosk(manager)/course(manager|muderris|enrolled|pending) rolleri (apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts:36) ve `SYSTEM_ADMIN` bypass (libs/common/src/authz/authz.service.ts:73-78).
- `GET /kosks/:id/grants`, `POST /kosks/:id/grants`, `PATCH /grants/:id`, `DELETE /grants/:id` — YOK — yeni endpoint; izin kataloğu (Celseler, canlı yayın, hafta/celse gizleme, başvurular, tamamladı sayma, ders kayıtları, ders yasağı, celse içeriği) şemada yok.
- Verilen izin ≤ vericinin izni sınaması sunucuda yazılmalı.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — İzin/rol modeli sıfırdan yazılır; üçüncü parti yok. En büyük modellerden biri; 12/22/36 ile aynı modele bağlı.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Liste köşkün medrese dışı derslerindeki ders nazırlarını izin sayısı, bitiş ve vericiyle gösterir.
2. Vericinin sahip olmadığı izin verilemez (sunucu 403/422).
3. 'İzinleri düzenle' izinleri günceller.
4. 'Görevden al' görevi ve izinleri aynı anda bitirir.
5. Süresi dolan görev ve izin aynı gün biter.

## 9. Test senaryoları
**Unit (Vitest)**
- İzin özeti ('8 izin' + liste) biçimleyici.
- Verici-izin alt kümesi doğrulaması (saf fonksiyon).
- Satır eylem erişilebilir adları.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk nazımı → İzinler.
- Ders nazırı ata → izin seç → kaydet → listede.
- Düzenle/Görevden al akışı.
- Vericinin izni olmayan izni vermeyi dene → hata.
