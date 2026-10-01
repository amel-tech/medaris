# Kayıt ol (A4)

Kaynak: `local_docs/ekranlar/medaris/03-kayit-ol-a4/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Yeni hesap oluşturur; Keycloak kayıt akışı.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Başlık 'Kayıt ol', alt metin 'Hesabını oluştur; köşkleri keşfet, derslere başvur.'.
- Alanlar: Ad*, Soyad*, Kullanıcı adı*, E-posta* (yardım: 'Doğrulama bağlantısını bu adrese göndereceğiz.'), Şifre*, Şifre (tekrar)*.
- Şifre kural listesi: 'En az 10 karakter', 'E-posta adresinden farklı', 'Kullanıcı adından farklı'; her biri karşılanınca ', karşılandı' (ekran okuyucu metni).
- Onay kutusu 'Aydınlatma Metni’ni okudum.*' (yeni sekmede açılır); düğme 'Kayıt ol'; 'Hesabın var mı? Giriş yap'.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Canlı şifre kuralı göstergesi (karşılanan/karşılanmayan).
- Şifre tekrarı uyuşmazlığı: hata; metin ekranda yok.
- Kullanıcı adı/e-posta kullanımda: Keycloak hata mesajı.
- Aydınlatma kutusu işaretsizse gönderim reddedilir.

## 4. Etkileşimler
- 'Kayıt ol' -> `url.registrationAction` POST; ayrı `username` alanı, `registrationEmailAsUsername=false` (_kurallar madde 44).
- Aydınlatma Metni bağlantısı yeni sekme; hedef URL ekranda yok — doğrulanamadı.
- 'Giriş yap' -> `url.loginUrl`.

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**A** — Backend gerekmez. Not: e-posta doğrulama bağlantısının gerçekten gitmesi SMTP ister (ekran 04, C); kayıt formu tek başına kodlanır. Realm dışa aktarımında `verifyEmail:false` (`apps/keycloak-theme/.keycloakify/realm-kc-26.json:33`) — doğrulamanın açılması sunucu ayarıdır.

## 7. Mevcut durum
Kısmi: `apps/keycloak-theme/src/login/pages/Register.tsx` (223 satır) + `Register.stories.tsx`, `UserProfileFormFields.tsx`; eski görünüm, `doMakeUserConfirmPassword=true`.

## 8. Kabul kriterleri
1. Tüm alanlar ve metinler ekran.txt ile aynı.
2. Şifre kuralları yazdıkça güncellenir ve karşılanınca ', karşılandı' okunur.
3. Geçersiz girişte gönderim yapılmaz, hatalar alan altında.
4. Geçerli girişte `url.registrationAction`'a POST olur.
5. Aydınlatma bağlantısı yeni sekmede açılır.

## 9. Test senaryoları
**Unit (Vitest):**
- Şifre kural fonksiyonu (uzunluk, e-posta/kullanıcı adı farklılığı) birim testi.
- Tekrar şifre uyuşmazlığı.

**Playwright e2e (gerçek Keycloak + API):**
1. Kayıt sayfasına git, alanları doldur -> hesap oluşur.
2. Var olan kullanıcı adıyla kayıt -> hata.
3. Aydınlatma işaretlenmeden gönder -> engellenir.
