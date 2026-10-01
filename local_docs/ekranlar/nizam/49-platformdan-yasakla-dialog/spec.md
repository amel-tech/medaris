# 49 — platformdan-yasakla-dialog

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Medaris yönetiminin bir kişiyi bütün Medaris'ten yasakladığı (hesap kapatma + giriş devre dışı) modal; 48 sayfasındaki "Platformdan yasakla" düğmesinden açılır.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Eyebrow "PLATFORM", başlık "Platformdan yasakla", kişi kartı (KU, Kâmil Burak Uzunhasanoğlu, e-posta), "Mevcut yasağı: Ders·Emsile ve Bina·Hasan Basri Gündoğdu·19 Eyl 11:40".
- Uyarı başlığı "Kişi bütün Medaris’e erişemez" + üç paragraf: erişim kalkar, hesap kapanır ve giriş hesabı devre dışı kalır; cihaz kısıtlaması; var olan yasaklar sürer, platform yasağı ayrı kayıt, yalnız Medaris yönetimi kaldırır.
- "* zorunlu alan", Textarea "Yasaklama gerekçesi*" + yardım, "Vazgeç" / "Platformdan yasakla".

## 3. Durumlar

- Yükleniyor: düğmede spinner. Hata: Toast (hata `timeout: 0`).
- Yetkisiz: düğme yalnız Medaris yönetiminde görünür.
- Doğrulama: gerekçe boşken disabled / "Bir gerekçe yazın.".
- Kişi önceden platform yasaklıysa pencere açılmaz (doğrulanamadı).

## 4. Etkileşimler

- "Platformdan yasakla": platform yasağı kaydı açar, hesabı kapatır, Keycloak girişini devre dışı bırakır; satır "Hesap kapalı" rozetiyle listeye girer.
- Vazgeç/X/Esc kapatır; perde kapatmaz.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Platform yasağı | YOK — yeni endpoint | `POST /bans` body `{ userId, scope: 'PLATFORM', reason }`. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| Giriş hesabını devre dışı bırakma | YOK — dış sistem | Keycloak admin API ile kullanıcı `enabled=false` ve oturumları sonlandırma gerekir; tedrisat'ta Keycloak admin istemcisi yok (doğrulandı: config/security-env.ts yalnız doğrulama ayarları — içerik doğrulanamadı). |
| Cihaz kısıtlaması | YOK | Cihaz izi altyapısı yok (doğrulanamadı). |

## 6. Sınıf

**C** — Hesabı kapatma ve giriş hesabını devre dışı bırakma Keycloak sunucusunda admin servis hesabı/rol yapılandırması gerektirir (üçüncü parti, insan işi); cihaz kısıtlaması da ek tasarım ister.

## 7. Mevcut durum

Yok. nizam-web kabuğu (apps/nizam/components/layout/app-sidebar.tsx, nav-routes.ts) bugün yalnız "Decks" ve "Köşkler" rotasını içerir; tuvaldeki kabuk (GENEL/KÖŞK/YÖNETİM grupları, rozetli sayaçlar, köşk değiştirici) kodlu değil.

## 8. Kabul kriterleri

1. Pencere kişi, mevcut yasak ve açıklama metinleriyle açılır.
2. Gerekçe boşken onay disabled.
3. Onayda hesap kapanır; kişi giriş yapamaz (Keycloak yapılandırıldıktan sonra doğrulanır).
4. Kişinin mevcut yasakları korunur; ayrı platform kaydı eklenir.
5. Yalnız Medaris yönetimi kaldırabilir.

## 9. Test senaryoları

- Unit: form şeması, bilgi metni render.
- Playwright (Keycloak admin yapılandırması hazır olunca): Medaris başnazımı → Yasaklamalar → Platformdan yasakla → gerekçe → onay → kişi hesabıyla giriş denemesi reddedilir.
