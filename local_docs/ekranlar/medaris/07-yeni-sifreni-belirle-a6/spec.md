# Yeni şifreni belirle (A6)

Kaynak: `local_docs/ekranlar/medaris/07-yeni-sifreni-belirle-a6/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
E-postadaki bağlantıdan gelen yeni şifre belirleme; Keycloak `login-update-password.ftl`.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Başlık, e-posta adresi içeren açıklama, 'Yeni şifre*', kural listesi (ekran 03 ile aynı), 'Yeni şifre (tekrar)*', onay kutusu 'Diğer cihazlarda çıkış yap' + açıklaması, düğme 'Şifreyi kaydet'.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Kurallar karşılanmadan düğme `disabled` değil, hata gösterimi doğrulanamadı.
- Süresi dolmuş bağlantı: ekran 13 benzeri hata sayfası.

## 4. Etkileşimler
- 'Şifreyi kaydet' -> `url.loginAction` POST; `logout-sessions` onay kutusu alanı.
- Şifre kural bileşeni ekran 03 ile paylaşılır.

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**A** — Sayfa tema uyarlayıcısıdır; backend gerekmez. (Bağlantıya ulaşmak SMTP'ye bağlıdır ama sayfa tek başına kodlanıp Storybook/test ile doğrulanır.) Şifre politikası (10 karakter) realm ayarıdır — doğrulanamadı.

## 7. Mevcut durum
Yok. `apps/keycloak-theme/src/login/KcPage.tsx` yalnız `login.ftl` ve `register.ftl` için özel sayfa döndürür; diğer tüm `pageId`'ler `DefaultPage` (Keycloakify varsayılanı) ile çizilir; bu ekran şu an Keycloakify varsayılan görünümündedir.

## 8. Kabul kriterleri
1. Alanlar/metinler ekran.txt ile aynı.
2. Kurallar canlı güncellenir.
3. Tekrar uyuşmazsa gönderim yapılmaz.
4. 'Diğer cihazlarda çıkış yap' işaretliyse form alanı gönderilir.

## 9. Test senaryoları
**Unit (Vitest):**
- Paylaşılan şifre kuralı bileşeni.
- Uyuşmazlık.

**Playwright e2e (gerçek Keycloak + API):**
1. Yok (e-posta bağlantısı gerekir; SMTP olmadan koşulamaz) — Storybook ile doğrula.
