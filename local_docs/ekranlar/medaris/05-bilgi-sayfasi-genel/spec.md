# Bilgi sayfası (genel)

Kaynak: `local_docs/ekranlar/medaris/05-bilgi-sayfasi-genel/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Keycloak `info.ftl`/`login-verify-email` sonrası genel bilgi sayfası; örnek metin 'E-posta adresin doğrulandı'.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Başlık, tek cümle açıklama, birincil düğme 'Medaris’e devam et'.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Yalnız gösterim; metin Keycloak `messageHeader`/`message`'dan gelir (ekran bir örnek).

## 4. Etkileşimler
- 'Medaris’e devam et' -> `pageRedirectUri` ya da `actionUri`; yoksa `client.baseUrl`.

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**A** — Backend gerekmez; yalnız tema uyarlayıcısı (`info.ftl`). Metnin kendisi Keycloak mesajıdır.

## 7. Mevcut durum
Yok. `apps/keycloak-theme/src/login/KcPage.tsx` yalnız `login.ftl` ve `register.ftl` için özel sayfa döndürür; diğer tüm `pageId`'ler `DefaultPage` (Keycloakify varsayılanı) ile çizilir; bu ekran şu an Keycloakify varsayılan görünümündedir.

## 8. Kabul kriterleri
1. Düğme doğru yönlendirme hedefine gider.
2. Başlık ve mesaj kcContext'ten gelir.
3. Mesaj tipine göre simge/ton uyar (doğrulanamadı: tuval tek örnek).

## 9. Test senaryoları
**Unit (Vitest):**
- info.ftl uyarlayıcısı pageRedirectUri/actionUri/baseUrl öncelik sırası.

**Playwright e2e (gerçek Keycloak + API):**
1. Doğrulama bağlantısını aç (e-posta ortamı varsa) -> bu sayfa -> düğme uygulamaya döner.
