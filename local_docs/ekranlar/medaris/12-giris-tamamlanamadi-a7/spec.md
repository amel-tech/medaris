# Giriş tamamlanamadı (A7)

Kaynak: `local_docs/ekranlar/medaris/12-giris-tamamlanamadi-a7/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Yarıda kalmış/geçersiz giriş için hata sayfası; `error.ftl`/`login-restart`.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Başlık, iki cümle açıklama, düğme 'Giriş sayfasına dön'.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Yalnız gösterim.

## 4. Etkileşimler
- Düğme -> `url.loginRestartFlowUrl` (veya `client.baseUrl`).

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**A** — Backend gerekmez; tema uyarlayıcısı.

## 7. Mevcut durum
Yok. `apps/keycloak-theme/src/login/KcPage.tsx` yalnız `login.ftl` ve `register.ftl` için özel sayfa döndürür; diğer tüm `pageId`'ler `DefaultPage` (Keycloakify varsayılanı) ile çizilir; bu ekran şu an Keycloakify varsayılan görünümündedir.

## 8. Kabul kriterleri
1. Metinler ekran.txt ile aynı.
2. Düğme giriş akışını baştan başlatır.

## 9. Test senaryoları
**Unit (Vitest):**
- error.ftl uyarlayıcısı.

**Playwright e2e (gerçek Keycloak + API):**
1. Süresi geçmiş `execution` ile giriş URL'sini aç -> bu sayfa -> düğme yeni giriş sayfasını açar.
