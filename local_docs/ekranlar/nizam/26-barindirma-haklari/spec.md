# 26 — Barındırma hakları

Kaynak: `26-barindirma-haklari/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşkte barındırma hakkı olan medreseleri listeler; köşk nazımı hak verir ya da geri alır. Hak, medreseye köşk üzerinde yetki vermez.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/ayarlar/barindirma``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Başlık, açıklama, birincil düğme 'Barındırma hakkı ver', sekmeler.
- Tablo: Medrese (ad, başmüderris), Veren (ad+rol), Tarih, Açık ders (sayı, '1 yayında·1 taslak'), İşlemler 'Barındırma hakkını geri al'.
- Dipnot: geri alınınca medrese yeni ders açamaz; açık dersler kapanmaz.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: 'Henüz barındırma hakkı yok' (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).

## 4. Etkileşimler
- 'Barındırma hakkı ver' → medrese seçimi (Dialog; tuvalde yok — doğrulanamadı) → hak oluşur.
- 'Barındırma hakkını geri al' → nizam/27 Dialog'u.

## 5. API
- `GET /kosks/:id/barindirma-haklari` — YOK — yeni endpoint.
- `POST /kosks/:id/barindirma-haklari` {medreseId} — YOK — yeni endpoint.
- Medrese varlığı yok (bkz. ortak boşluk); resolver'da `madrasah` provizyonel (apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts:36).

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Medrese ve hak tabloları sıfırdan yazılır; üçüncü parti yok. Medrese modeline bağımlıdır, o yoksa ekran boş kalır.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Liste köşkte hakkı olan medreseleri ve açık ders sayısını gösterir.
2. 'Barındırma hakkı ver' yeni medrese ekler ve listede görünür.
3. Geri alma 27'deki Dialog ile yapılır.
4. Köşk nazımı dışı 403.

## 9. Test senaryoları
**Unit (Vitest)**
- Açık ders özeti ('x yayında·y taslak') biçimleyici.
- Tablo satır eylemi.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk ayarları → Barındırma hakları.
- Hak ver → satır görünür.
- Geri al akışı 27 ile birlikte.
