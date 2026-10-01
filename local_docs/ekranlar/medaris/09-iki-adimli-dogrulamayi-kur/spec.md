# İki adımlı doğrulamayı kur

Kaynak: `local_docs/ekranlar/medaris/09-iki-adimli-dogrulamayi-kur/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
TOTP kurulumu; `login-config-totp.ftl`.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Başlık, e-posta/Başka hesapla giriş yap, 3 adım (Uygulamayı yükle, Kodu tara + QR + elle anahtar 'MZ2W 4Y3P …', 'Anahtarı kopyala', Kodu doğrula).
- Alanlar: 'Doğrulama kodu*', 'Cihaz adı', 'Diğer cihazlarda çıkış yap'; düğme 'Kur'.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- QR yüklenemezse elle anahtar.
- Yanlış kod hatası.

## 4. Etkileşimler
- 'Anahtarı kopyala' -> panoya; 'Kur' -> POST `totp`, `userLabel`, `logout-sessions`.

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**C** — Required action (CONFIGURE_TOTP) ve flow Keycloak sunucu yapılandırmasıdır; QR/anahtar Keycloak üretir.

## 7. Mevcut durum
Yok. `apps/keycloak-theme/src/login/KcPage.tsx` yalnız `login.ftl` ve `register.ftl` için özel sayfa döndürür; diğer tüm `pageId`'ler `DefaultPage` (Keycloakify varsayılanı) ile çizilir; bu ekran şu an Keycloakify varsayılan görünümündedir.

## 8. Kabul kriterleri
1. Kodlanmaz.

## 9. Test senaryoları
**Unit (Vitest):**
- Yok.

**Playwright e2e (gerçek Keycloak + API):**
1. Yok.
