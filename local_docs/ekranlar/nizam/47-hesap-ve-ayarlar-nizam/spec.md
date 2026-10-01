# 47 — hesap-ve-ayarlar-nizam

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Kullanıcının görevlerini, etkin izinlerini, saat dilimini, dilini ve hesabını gördüğü; çıkış yaptığı sayfa. Önerilen rota: `/[locale]/account`. Mevcut: `apps/nizam/components/layout/nav-user.tsx` ve `lib/keycloak-logout.ts` (çıkış) var; sayfa yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Hesap ve ayarlar".
- "Görevleriniz" tablosu: Görev, Kapsam, Atayan, Süre (örn. Medaris başnazımı / Platform / "Giriş sisteminde tanımlı" / Süresiz; Köşk nazımı / Üsküdar Köşkü + "Listelenmeyen" / Kendiniz·12 Eylül 2026 / 31 Aralık 2026 tarihine kadar).
- "Etkin izinleriniz": kapsam başlığı + izin cümleleri (örn. "Köşkü düzenle, gizle ya da geri al", "E-postayla kullanıcı bul"); bitiş notu "Atamanız 31 Aralık 2026 tarihinde bittiği için izin de en geç o gün biter."
- "Saat ve dil": Saat dilimi seçici (İstanbul, Berlin, Amsterdam, Brüksel, Paris, Viyana, Londra, New York, Diğer…) + yardım "Celse saatleri bu saat diliminde gösterilir. Seçtiğiniz an kaydedilir."; Dil: "Medaris şimdilik yalnız Türkçe görünür."
- "Hesap": avatar, ad, rol özeti, E-posta (salt okunur, "buradan değiştirilemez"), "Çıkış yap" düğmesi + açıklama.

## 3. Durumlar

- Yükleniyor: Skeleton. Hata: Alert. Boş görev listesi: metin yok — doğrulanamadı.
- Yetkisiz: oturum yoksa giriş sayfasına yönlenir (apps/nizam/middleware.ts).
- Form: saat dilimi seçimi anında kaydedilir; "Diğer…" tam liste açar (davranış doğrulanamadı).

## 4. Etkileşimler

- Saat dilimi değişince tercih kaydedilir (Toast).
- "Çıkış yap": uygulama içi tek onay sonra Keycloak oturumunu kapatır (_kurallar.md madde 44 notu; `apps/nizam/lib/keycloak-logout.ts`).
- E-posta değiştirilemez.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Görev/izin özeti | YOK — yeni endpoint | `GET /me` → `{ user, assignments[], effectivePermissions[], timezone }`. Rol çözümü için `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` var ama görev/kapsam/atayan/süre modeli doğrulanamadı; `Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti).` |
| Saat dilimi tercihi | YOK — yeni endpoint | `PUT /me/preferences` body `{ timezone }`. |
| Çıkış | var (istemci) | `apps/nizam/lib/keycloak-logout.ts` — sunucu endpoint'i gerekmez. |

## 6. Sınıf

**B** — Tercih deposu ve /me uçları yazılır; görev/izin verisi ancak atama modeli (köşk nazımı/ders nazırı atamaları) tanımlanınca dolar — ilk teslimde mevcut sahiplik kayıtlarından türetilir. Keycloak yapılandırması değişmez.

## 7. Mevcut durum

Kısmi: çıkış ve kullanıcı menüsü (`apps/nizam/components/layout/nav-user.tsx`, `lib/keycloak-logout.ts`, `lib/auth_options.ts`); hesap sayfası, görev/izin tabloları ve saat dilimi yok.

## 8. Kabul kriterleri

1. Sayfa kullanıcının görevlerini tuvaldeki kolonlarla gösterir.
2. Süreli atama için bitiş notu görünür.
3. E-posta alanı salt okunurdur.
4. Saat dilimi seçimi sayfa yenilenince korunur.
5. "Çıkış yap" oturumu kapatır ve giriş sayfasına döner.
6. Oturumsuz erişim giriş sayfasına yönlendirir.

## 9. Test senaryoları

- Unit: görev satırı eşlemesi, bitiş notu hesabı, saat dilimi seçici.
- Backend e2e: GET /me, PUT /me/preferences kalıcılığı.
- Playwright: giriş → kullanıcı menüsü → Hesap → saat dilimini Berlin yap → yenile → Berlin seçili → Çıkış yap → korumalı sayfa girişe atar.
