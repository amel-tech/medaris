# 29 — Arşiv — Kalıcı olarak sil (başnazım)

Kaynak: `29-arsiv-kalici-olarak-sil-basnazim/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Medaris başnazımı tüm köşk ve medreselerde gizlenenleri görür, geri alır ya da kalıcı siler (kalıcı silme geri alınamaz, denetim kaydına adıyla yazılır). Alt kısımda 'Dersi kalıcı olarak sil' onay penceresi.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/arsiv` (platform kapsamı)`
- Mevcut rota/dosya: YOK — bu ekran için dosya bulunmuyor.

## 2. Gösterim
- Kapsam süzgeci (Tümü, köşkler, medreseler), Tür süzgeci (Köşk, Medrese, Ders, Hafta, Celse, Ders kaydı, Deste), '18 gizli öğe'.
- Tablo: Gizlenen, Kapsam (köşk/medrese), Gizleyen, Tarih, İşlemler 'Geri al' ve 'Kalıcı olarak sil'.
- '18 öğeden 10'u gösteriliyor' + 'Daha fazla göster'.
- Dialog (Fatih Köşkü): 'Dersi kalıcı olarak sil' — silinecekler: ders sayfası/müfredat, 35 talebe kaydı, 12 celse, 2 ders kaydı; 'Silme, denetim kaydına adınızla yazılır.'; 'Vazgeç', 'Kalıcı olarak sil'.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Boş, yükleniyor, hata (madde 21).
- Yetkisiz: yalnız başnazım ('Kalıcı olarak sil' başnazıma özel; ekran adı 'başnazım').
- Silme sürüyor: düğme spinner; çakışma (öğe zaten silindi) metni tuvalde yok — doğrulanamadı.

## 4. Etkileşimler
- 'Geri al' öğeyi geri getirir.
- 'Kalıcı olarak sil' → AlertDialog/Dialog (madde 23: belirsiz; tablo gereği yanıt bekleyen onay = AlertDialog, odak 'Vazgeç'te) → onayda silinir, satır düşer.
- 'Daha fazla göster' sonraki 10 öğeyi yükler.

## 5. API
- Mevcut: `DELETE /courses/:id` kalıcı siler — VAR, apps/tedrisat/src/course/course.controller.ts:139; `DELETE /kosks/:id` — VAR, kosk.controller.ts:111 (yalnız sahip). Platform arşivi, geri alma, yetki ayrımı için yeterli değil.
- `GET /archive?scope=&type=&page=` — YOK — yeni endpoint.
- `POST /archive/:type/:id/restore`, `DELETE /archive/:type/:id` — YOK — yeni endpoint; silme denetim kaydı yazar. Silinecek sayıları (talebe, celse, ders kaydı) önizleme: `GET /archive/:type/:id/impact` — YOK.
- Sistem yöneticisi ayrımı: `SYSTEM_ADMIN` realm rolü var (libs/common/src/authz/authz.service.ts:7, :73-78) fakat Medaris başnazımı rolü ile eşleşmesi doğrulanamadı.

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Soft-delete modeli (28 ile ortak), platform arşiv listesi ve kalıcı silme yazılmalı; üçüncü parti yok.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Liste platformdaki tüm gizlenenleri kapsam ve tür süzgeciyle gösterir; sayfalama 10'ar.
2. 'Kalıcı olarak sil' dialog'u etkilenecek sayıları gösterir.
3. Onayla → öğe ve bağlı kayıtlar silinir, denetim kaydında silenin adı vardır.
4. Başnazım olmayan silme isteği 403 döner.
5. 'Geri al' öğeyi geri getirir.

## 9. Test senaryoları
**Unit (Vitest)**
- Etki özeti metin üretimi.
- 'Daha fazla göster' sayfalama durumu.
- Silme dialog'unda odak 'Vazgeç'.

**Playwright e2e (gerçek API'ye karşı)**
- Başnazım → Arşiv → Kapsam 'Fatih Köşkü'.
- Bir ders için 'Kalıcı olarak sil' → onay → liste ve ders API'si 404.
- Köşk nazımı ile aynı endpoint → 403.
