# 20 — Hesap ve ayarlar (nazir)

Kaynak: `local_docs/ekranlar/nazir/20-hesap-ve-ayarlar-nazir/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/hesap/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Görevlerim: medrese satırı (Süleymaniye Medresesi, 'Etkin', atayan + tarih, bitiş 'Süresiz') ve ders satırları (Müderris, 'Dersin imamı', ders adı, köşk, durum Yayında/Taslak/Gizli, atayan + tarih); not 'Medrese nazırlığınız ya da ders nazırlığınız yok.'
- 'Etkin izinleriniz': medrese ve ders izin listeleri (kaynak: görev/izin grubu) + 'Bitiş: süresiz.'
- 'Saat ve dil': 'Saat dilimi' Select (İstanbul, Berlin, Amsterdam, Brüksel, Paris, Viyana, Londra, New York, Diğer…; 'Celse saatleri bu saat diliminde gösterilir. Seçtiğiniz an kaydedilir.'); 'Dil': 'Medaris şimdilik yalnız Türkçe görünür.'
- 'Hesap': monogram, ad, rol, 'E-posta' salt okunur ('buradan değiştirilemez'); 'Çıkış yap' (not 'Bu tarayıcıda Medaris’ten çıkarsınız. Görevleriniz ve tercihleriniz hesabınızda kalır.').

## 3. Durumlar

- Yükleniyor/hata: bölüm iskeletleri; tercih kaydı başarısızsa Toast.
- Saat dilimi seçilince 'seçtiğiniz an kaydedilir' (otomatik kayıt, Kaydet düğmesi yok).
- 'Diğer…' seçilirse tam IANA listesi — tuvalde ayrı görünüm yok, doğrulanamadı.
- Çıkış: kural 44 'uygulama içi tek onay' giriş ekranları için; nazırda onay penceresi tuvalde yok — doğrulanamadı.

## 4. Etkileşimler

- Saat dilimi değişimi tercihi kaydeder ve tüm celse saatleri yeniden biçimlenir.
- 'Çıkış yap' → Keycloak oturumunu da kapatır (`libs/services/src/auth-client/keycloak-sign-out.ts`); giriş sayfasına döner.

## 5. API

- YOK — yeni endpoint: `GET /me/assignments` ve `GET /me/permissions` (görev+izin özeti), `GET|PUT /me/preferences` {timeZone}. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').
- Çıkış için backend gerekmez: `libs/services/src/auth-client/keycloak-sign-out.ts` (next-auth `signOut` + Keycloak end-session; dosyada okundu).

## 6. Sınıf

**B** — Görev ve izin özeti ile saat dilimi tercihi yeni uç ister; çıkış mevcut ortak yardımcıyla yapılır. Üçüncü parti gerekmez → B.

## 7. Mevcut durum

Kısmi (yalnız çıkış altyapısı): `libs/services/src/auth-client/keycloak-sign-out.ts` ortak; `apps/nazir` içinde hesap sayfası/tercih kodu yok. `apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Görev ve izin listeleri sunucudaki gerçek atamalarla birebirdir (ders/medrese ayrı bölümlerde).
2. Saat dilimi seçimi sayfa yenilenince korunur; celse saatleri bu dilimde görünür.
3. E-posta alanı değiştirilemez.
4. 'Çıkış yap' hem uygulama hem Keycloak oturumunu kapatır.
5. Dil seçimi yalnız Türkçe (kural 3).

## 9. Test senaryoları

- Unit: izin listesinin kaynağa (görev/grup) göre gruplanması; saat dilimi biçimlendirme.
- Playwright: Hesap → saat dilimi 'New York' → yenile → seçili kalır; 'Çıkış yap' → giriş ekranı, geri tuşuyla korumalı sayfaya dönülemez.
