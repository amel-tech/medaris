# E-posta: şifre sıfırlama (A8)

Kaynak: `local_docs/ekranlar/medaris/19-e-posta-sifre-sifirlama-a8/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Şifre sıfırlama e-postası.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Öneri: `apps/keycloak-theme/src/email/` altında Keycloak e-posta teması (bugün YOK; `apps/keycloak-theme/src` altında `email` dizini yok).

## 2. Gösterim
- Selâm, açıklama, düğme 'Yeni şifre belirle', 30 dakika notu, 'Bu isteği sen yapmadıysan' bloğu, yedek bağlantı.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Tablolu, satır içi stilli HTML (Tailwind yok, _kurallar madde 37).
- Düğme çalışmazsa düz bağlantı gösterilir.

## 4. Etkileşimler
- Gönderim yok (salt gösterim sözleşmesi).

## 5. API
YOK — e-posta Keycloak e-posta temasıyla (`apps/keycloak-theme` e-posta teması) üretilir; backend endpoint'i yok. Kanıt: apps/tedrisat/src ve apps/teskilat/src altında e-posta/bildirim controller'ı yok.

## 6. Sınıf
**C** — SMTP + Keycloak e-posta teması gerekir.

## 7. Mevcut durum
Yok.

## 8. Kabul kriterleri
1. Kodlanmaz.

## 9. Test senaryoları
**Unit (Vitest):**
- Yok.

**Playwright e2e (gerçek Keycloak + API):**
1. Yok.
