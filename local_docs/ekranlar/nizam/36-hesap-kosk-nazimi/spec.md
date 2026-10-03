# 36 — Hesap — köşk nazımı

Kaynak: `36-hesap-kosk-nazimi/ekran.png`, `ekran.txt`. Telefon kopyası yok. Bu belge salt-okuma analizdir; kod/Linear'a dokunulmadı.

## 1. Amaç ve rota
Köşk nazımı kendi görevlerini ve etkin izinlerini görür, saat dilimini seçer, e-postasını görür, Nazır'a geçer ve çıkış yapar.

- Nx projesi: `nizam-web` (apps/nizam, Next.js, `scope:app platform:web`).
- Önerilen rota: ``/[locale]/hesap``
- Mevcut rota/dosya: Yok; yalnız kullanıcı menüsü: apps/nizam/components/layout/nav-user.tsx ve lib/keycloak-logout.ts (çıkış).

## 2. Gösterim
- Başlık 'Hesap ve ayarlar'; 'Görevleriniz' tablosu: Görev, Kapsam (köşk/ders, durum rozeti), Atayan·tarih, Süre.
- 'Etkin izinleriniz': gruplar ('Nûruosmaniye Köşkü·köşk nazımı', 'Müderris·…') ve izin cümleleri; açıklayıcı notlar.
- 'Saat ve dil': Saat dilimi seçici (İstanbul…); Dil: 'Medaris şimdilik yalnız Türkçe görünür.'
- 'Hesap': avatar, ad, roller, E-posta (salt okunur), Müderrislik 'Nazır'da aç', 'Çıkış yap'.
- Kabuk (yan menü köşk kapsamı: Genel/Köşk/Yönetim bölümleri, köşk değiştirici, kullanıcı satırı) tuval kabuğudur; mevcut `apps/nizam/components/layout/app-sidebar.tsx` ve `nav-routes.ts` yalnız `Decks` ve `Köşkler` gösterir, kapsam seçici/rozetli menü YOK (_kurallar.md madde 36: kabuk libs/ui bileşenine taşınır).

## 3. Durumlar
- Yükleniyor: tablo/kart iskeleti (Skeleton), eylem düğmeleri devre dışı.
- Hata: ağ/5xx → sayfa içi uyarı + 'Yeniden dene'; eylem hatası → Toast (hata, `timeout: 0`, _kurallar.md madde 21).
- Saat dilimi kaydı: Toast ('Seçtiğiniz an kaydedilir').
- Yetkisiz: oturum yoksa Keycloak girişine yönlenir (middleware.ts).
- Rol/görev yok: tuvalde yok — doğrulanamadı.

## 4. Etkileşimler
- Saat dilimi seçimi anında kaydedilir.
- 'Nazır'da aç' → Nazır uygulaması (nazir-web).
- 'Çıkış yap' → uygulama içi tek onay (_kurallar.md madde 44) → Keycloak çıkışı (mevcut lib/keycloak-logout.ts).

## 5. API
- Oturum bilgisi: token claims (sub, email, name) — `AuthGuard` request.user (apps/tedrisat/src/course/course.controller.ts:159-166 kullanımı).
- `GET /me/roles` (görevler, izinler, kapsam) — YOK — yeni endpoint (rol modeli yok).
- `PUT /me/preferences` {timezone} — YOK — yeni endpoint; kullanıcı tercih tablosu yok.
- Çıkış: Keycloak OIDC logout, frontend'de VAR (apps/nizam/lib/keycloak-logout.ts).

Ortak boşluk kanıtı: Köşk için tek `ownerId` var (apps/tedrisat/src/database/schema/kosk.schema.ts:17); köşk nazımı üyelik tablosu, Medaris başnazımı/nazımı rolü, medrese, denetim kaydı, bildirim, yasak tabloları şemada YOK (schema/ altında yalnız course, example, flashcard*, kosk). apps/teskilat'ta alan controller'ı yok (apps/teskilat/src/app.controller.ts:11 ve :26 yalnız kök ve health). Yetki bugün yalnız `AuthGuard` + servis içi sahip kontrolü (kosk.controller.ts:38; kosk.service.ts:51 `KoskForbiddenError`).

## 6. Sınıf
**B** — Görev/izin okuma ve saat dilimi tercihi yeni yazılır; çıkış ve e-posta hazır; üçüncü parti yapılandırması gerekmez (Keycloak oturumu mevcut).

## 7. Mevcut durum
Kısmi yok: nav-user.tsx menüsü ve çıkış var; sayfa yok.

## 8. Kabul kriterleri
1. Sayfa görevleri kapsam ve süreyle listeler.
2. Etkin izinler görevlerden türetilip gruplanır.
3. Saat dilimi değişince kaydedilir ve yenilemede korunur.
4. E-posta salt okunur gösterilir.
5. 'Çıkış yap' oturumu kapatır ve girişe döner.

## 9. Test senaryoları
**Unit (Vitest)**
- Görev→izin gruplama fonksiyonu.
- Saat dilimi seçici varsayılan/seçenek listesi.
- Çıkış onay akışı.

**Playwright e2e (gerçek API'ye karşı)**
- Köşk nazımı → kullanıcı menüsü → Hesap.
- Saat dilimini Berlin yap → yenile → seçili.
- Çıkış yap → girişe yönlenir.
