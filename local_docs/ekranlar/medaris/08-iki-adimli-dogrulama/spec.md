# İki adımlı doğrulama

Kaynak: `local_docs/ekranlar/medaris/08-iki-adimli-dogrulama/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Girişte TOTP kodu isteme; `login-otp.ftl`.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Başlık, kullanıcı e-postası + 'Başka hesapla giriş yap' bağlantısı, açıklama, 'Doğrulama kodu*' (6 hane), yardım 'Kod 30 saniyede bir değişir…', düğme 'Doğrula', destek notu '[Destek e-posta adresi]' (yer tutucu, adres ekranda yok).
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Yanlış kod hatası (Keycloak).
- Boş alan hatası.

## 4. Etkileşimler
- 'Doğrula' -> `url.loginAction` POST `otp`.
- 'Başka hesapla giriş yap' -> `url.loginRestartFlowUrl`.

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**C** — TOTP zorunluluğu Keycloak authentication flow/required-action sunucu yapılandırması ister; destek e-posta adresi de belirsiz.

## 7. Mevcut durum
Yok. `apps/keycloak-theme/src/login/KcPage.tsx` yalnız `login.ftl` ve `register.ftl` için özel sayfa döndürür; diğer tüm `pageId`'ler `DefaultPage` (Keycloakify varsayılanı) ile çizilir; bu ekran şu an Keycloakify varsayılan görünümündedir.

## 8. Kabul kriterleri
1. Kodlanmaz.

## 9. Test senaryoları
**Unit (Vitest):**
- Yok.

**Playwright e2e (gerçek Keycloak + API):**
1. Yok.
