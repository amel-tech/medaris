# Çıkış yap (uygulama, /auth/signout)

Kaynak: `local_docs/ekranlar/medaris/16-cikis-yap-uygulama-auth-signout/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Uygulama içi tek onaylı çıkış sayfası (d-1001-33); NextAuth + Keycloak oturumlarını kapatır.
- Nx projesi: `tedris-web`.
- Rota/dosya: Öneri: `apps/tedris/app/[locale]/auth/signout/page.tsx` ve `apps/nizam/app/[locale]/auth/signout/page.tsx` (bugün YOK; nizam-web de aynı sayfayı ister).

## 2. Gösterim
- Başlık 'Çıkış yapılsın mı?', açıklama, düğmeler 'Çıkış yap', 'Vazgeç'.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Çıkış sürerken düğme disabled/spinner.
- Oturum yoksa giriş sayfasına yönlen (doğrulanamadı).

## 4. Etkileşimler
- 'Çıkış yap' -> `keycloakSignOut()` (libs/services/src/auth-client/keycloak-sign-out.ts:33).
- 'Vazgeç' -> önceki sayfa.

## 5. API
YOK — backend çağrısı yok; Keycloak end-session uçlarını `createKeycloakSignOut` çağırır (apps/tedris/lib/keycloak-logout.ts:1-16).

## 6. Sınıf
**A** — Backend gerekmez; `keycloakSignOut` hazır, yalnız onay sayfası eklenir.

## 7. Mevcut durum
Kısmi: `apps/tedris/lib/keycloak-logout.ts`, `apps/nizam/lib/keycloak-logout.ts`; kullanılan yerler `apps/tedris/components/header/user-header-menu.tsx`, `apps/nizam/components/layout/nav-user.tsx` (doğrudan çıkış, onay sayfası yok).

## 8. Kabul kriterleri
1. `/auth/signout` rotası onay sayfasını gösterir.
2. 'Çıkış yap' hem NextAuth hem Keycloak oturumunu kapatır.
3. 'Vazgeç' çıkış yapmadan geri döner.
4. Kullanıcı menüsündeki 'Çıkış yap' bu sayfaya yönlenir (uygulama içi tek onay).

## 9. Test senaryoları
**Unit (Vitest):**
- Sayfa bileşeni: iki düğme, signOut çağrısı mock'lanır.

**Playwright e2e (gerçek Keycloak + API):**
1. Giriş yap -> kullanıcı menüsü -> Çıkış yap -> onay -> 'Çıkış yap' -> giriş sayfasına dönülür, korumalı sayfa tekrar giriş ister.
2. 'Vazgeç' -> oturum açık kalır.
