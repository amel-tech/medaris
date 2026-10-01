# Giriş yap (A3)

Kaynak: `local_docs/ekranlar/medaris/01-giris-yap-a3/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Kullanıcıyı Keycloak ile oturum açtırır; tedris/nizam/nazir uygulamalarının OIDC giriş sayfasıdır.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Logo 'Medaris', başlık 'Giriş yap', alt metin 'Derslerine kaldığın yerden devam et.', '* zorunlu alan' notu.
- Alanlar: 'Kullanıcı adı ya da e-posta*', 'Şifre*'; bağlantı 'Şifremi unuttum'; birincil düğme 'Giriş yap'; alt satır 'Hesabın yok mu? Kayıt ol'.
- Telefon sürümü: ekran-telefon.png (aynı içerik, 390 px).
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Yükleniyor: gönderimde düğme spinner + disabled.
- Boş alan: zorunlu alan hatası (native/Base UI Field).
- Hatalı kimlik: Keycloak `message` (tür error) üstte `Alert`; alan `aria-invalid`.
- Yetkisiz/engelli hesap: Keycloak hesabı reddeder; metni ekranda yok — doğrulanamadı.

## 4. Etkileşimler
- 'Giriş yap' -> native `<form method=post action=url.loginAction>`, alan adları `username`, `password`.
- 'Şifremi unuttum' -> Keycloak `url.loginResetCredentialsUrl` (ekran 06).
- 'Kayıt ol' -> `url.registrationUrl` (ekran 03).

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**A** — Backend gerekmez; Keycloak giriş akışı hazır, yalnız tema uyarlayıcısı yeniden yazılır.

## 7. Mevcut durum
Kısmi: `apps/keycloak-theme/src/login/pages/Login.tsx` (300 satır) + `Login.stories.tsx` var; `doUseDefaultCss={true}` ile eski shadcn görünümü, yeni `.mds-*` tasarımına geçmemiş. `libs/ui/src/giris/` yok.

## 8. Kabul kriterleri
1. Ekran.txt'deki tüm metinler birebir görünür.
2. Geçerli kimlikle gönderim `url.loginAction`'a POST olur ve uygulamaya yönlenir.
3. Hatalı şifrede hata görünür ve kullanıcı adı alanı korunur.
4. 'Şifremi unuttum' ve 'Kayıt ol' doğru Keycloak URL'lerine gider.
5. Telefon (390 px) ve gündüz/gece teması tuvalle uyumlu.

## 9. Test senaryoları
**Unit (Vitest):**
- Login uyarlayıcısı kcContext'ten prop'ları doğru eşler (storybook/Vitest).
- Hata mesajı varsa Alert render edilir.

**Playwright e2e (gerçek Keycloak + API):**
1. tedris-web'den korumalı sayfaya git -> Keycloak giriş sayfası açılır.
2. Geçerli test kullanıcısıyla giriş -> uygulamaya dönüş.
3. Yanlış şifre -> hata metni görünür, sayfa değişmez.
