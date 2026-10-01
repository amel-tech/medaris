# 28 — Arşiv (köşk)

Kaynak: `28-arsiv/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı köşkünde gizlenen ders, hafta, celse, ders kaydı ve desteleri görür ve geri alır. Kalıcı silme bu görünümde yok (başnazım, nizam/29).

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/kosks/[id]/arsiv``
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Başlık 'Arşiv', açıklama, 'Gizlenenler' başlığı, tür süzgeci (Tümü, Ders, Hafta, Celse, Ders kaydı, Deste), '10 gizli öğe'.
- Tablo: Gizlenen (ad + bağlam), Tür rozeti, Gizleyen (ad+rol), Gizlendiği tarih, İşlemler 'Geri al'.
- Alt bilgi: geri alınınca ders köşk sayfasına, hafta/celse programa, ders kaydı celsesine döner.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş: 'Gizlenen öğe yok' (tuvalde yok — doğrulanamadı).
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Yetkisiz: köşk nazımı olmayan kullanıcı için 403 → ekran 'Yönetim yetkiniz yok' (nizam/03) sayfasına düşer; köşk yoksa 404 → 'erişim yok / bulunamadı' (nizam/06).
- Geri alma çakışması (ör. üst ders hâlâ gizli) — metin tuvalde yok, doğrulanamadı.

## 4. Etkileşimler
- Tür süzgeci listeyi daraltır.
- 'Geri al' öğeyi eski yerine döndürür, satır listeden düşer, Toast.

## 5. API
- `GET /kosks/:id/archive?type=` — YOK — yeni endpoint.
- `POST /archive/:itemType/:itemId/restore` — YOK — yeni endpoint.
- Gizleme (soft-delete) alanları şemada YOK: courses/course_weeks/lessons tablolarında `hidden`/`deletedAt` sütunu yok (apps/tedrisat/src/database/schema/course.schema.ts:19-46); mevcut silme kalıcıdır (course.controller.ts:139).
- Ders kaydı ve celse kayıtları: lessons tablosu var (course.schema.ts:60-80), ders kaydı (recording) kavramı yok — doğrulanamadı.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Yumuşak silme sütunları, gizleme/geri alma ve arşiv sorgusu yeni yazılır; üçüncü parti yok. Ders kaydı ve deste türleri ilgili özelliklere bağlı.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Arşiv köşkte gizlenen öğeleri tür, gizleyen ve tarihle listeler.
2. Tür süzgeci doğru sayıyı gösterir.
3. 'Geri al' öğeyi eski yerine döndürür ve listeden düşürür.
4. Kalıcı silme düğmesi bu görünümde yoktur.
5. Başka köşkün öğeleri görünmez.

## 9. Test senaryoları
**Unit (Vitest)**
- Tür süzgeci ve sayım.
- Satır erişilebilir adı ('Geri al: …').
- Göreli tarih biçimleyici (Dün/…).

**Playwright e2e (gerçek API'ye karşı)**
- Bir celse/ders gizle → Arşiv'de göründüğünü doğrula.
- Geri al → Dersler'de döner.
- Süzgeç 'Ders'.
