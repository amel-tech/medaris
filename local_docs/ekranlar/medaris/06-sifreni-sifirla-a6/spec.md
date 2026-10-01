# Şifreni sıfırla (A6)

Kaynak: `local_docs/ekranlar/medaris/06-sifreni-sifirla-a6/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Şifre sıfırlama isteği; Keycloak `login-reset-password.ftl`.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Başlık, açıklama, alan 'Kullanıcı adı ya da e-posta*', düğme 'Sıfırlama bağlantısı gönder', bağlantı 'Giriş sayfasına dön'.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Boş alan hatası.
- Gönderim sonrası bilgi (Keycloak mesajı; hesap varlığını sızdırmayan metin — doğrulanamadı).

## 4. Etkileşimler
- Gönder -> `url.loginAction` POST.
- 'Giriş sayfasına dön' -> `url.loginUrl`.

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**C** — Sıfırlama e-postası SMTP gerektirir; repoda SMTP yapılandırması yok (insan/üçüncü parti).

## 7. Mevcut durum
Yok. `apps/keycloak-theme/src/login/KcPage.tsx` yalnız `login.ftl` ve `register.ftl` için özel sayfa döndürür; diğer tüm `pageId`'ler `DefaultPage` (Keycloakify varsayılanı) ile çizilir; bu ekran şu an Keycloakify varsayılan görünümündedir.

## 8. Kabul kriterleri
1. Kodlanmaz; SMTP hazır olunca A sınıfına döner.

## 9. Test senaryoları
**Unit (Vitest):**
- Yok.

**Playwright e2e (gerçek Keycloak + API):**
1. Yok.
