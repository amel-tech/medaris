# Giriş yap — Arapça arayüz (A3, RTL)

Kaynak: `local_docs/ekranlar/medaris/02-giris-yap-arapca-arayuz-a3-rtl/ekran.txt` + `ekran.png`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota
Giriş ekranının Arapça/RTL sürümü.
- Nx projesi: `keycloak-theme`.
- Rota/dosya: Keycloak sayfa kimliği ile gelir (rota Keycloak'ındır, uygulamada değil). Tema girişi `apps/keycloak-theme/src/login/KcPage.tsx`; yeni uyarlayıcı `apps/keycloak-theme/src/login/pages/<Ad>.tsx` (bugün YOK).

## 2. Gösterim
- Metinler Arapça (ekran.txt): 'تسجيل الدخول', alanlar 'البريد الإلكتروني', 'كلمة المرور', 'نسيت كلمة المرور؟'.
- Alt dil seçici: Türkçe / English / العربية.
- Genel: Keycloak'a özgü her şey `apps/keycloak-theme/src/login/pages/*.tsx` uyarlayıcısında; saf React bileşeni `libs/ui/src/giris/` altında prop alır (_kurallar.md madde 44; `libs/ui/src/giris/` bugün YOK). Stil `.mds-*` (madde 7), Base UI Form/Field.
- i18n: `libs/i18n/src/locales/{ar,en,tr}/*.json` içinde bu ekranın anahtarı doğrulanamadı (yalnız `nizam.json` `KeycloakLogin.signIn` bulundu). Keycloak sayfaları kendi mesaj paketini (`apps/keycloak-theme/src/login/i18n.ts`, `msg()`) kullanır; metinler ekran.txt'den alınır.

## 3. Durumlar
- Aynı giriş durumları (ekran 01).
- RTL yerleşim: mantıksal özellikler (_kurallar madde 35).

## 4. Etkileşimler
- Dil seçici Keycloak `locale.supported` bağlantılarıyla dili değiştirir.

## 5. API
YOK — bu ekran backend (tedrisat/teskilat) çağrısı yapmaz. Kanıt: `grep -rnE "@(Get|Post|Put|Patch|Delete)\(" apps/tedrisat/src apps/teskilat/src` yalnız course/flashcard/kosk/health controller'larını döndürür (kimlik, kullanıcı, oturum, e-posta controller'ı yok; apps/teskilat/src/app.controller.ts:11,26 yalnız `/` ve `health`). Veri/aksiyon Keycloak akışındadır; yeni endpoint gerekmez.

## 6. Sınıf
**C** — _kurallar.md madde 3: lansmanda arayüz yalnız Türkçe, `lang="tr" dir="ltr"` sabit; Arapça/rtl 'sonraki faz'. Ayrıca Keycloak realm'inde Arapça locale yapılandırması gerekir.

## 7. Mevcut durum
Yok. `libs/i18n/src/locales/ar/` mevcut ama Keycloak teması `apps/keycloak-theme/src/login/i18n.ts` içinde Arapça doğrulanamadı.

## 8. Kabul kriterleri
1. Kodlanmaz; sonraki faz. Faz açıldığında: `dir=rtl` + Arapça mesaj paketi ile ekran 01 aynı bileşenden çizilir.

## 9. Test senaryoları
**Unit (Vitest):**
- Yok (kodlanmaz).

**Playwright e2e (gerçek Keycloak + API):**
1. Yok (kodlanmaz).
