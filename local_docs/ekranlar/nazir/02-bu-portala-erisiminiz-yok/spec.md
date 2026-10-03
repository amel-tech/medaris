# 02 — Bu portala erişiminiz yok

Kaynak: `local_docs/ekranlar/nazir/02-bu-portala-erisiminiz-yok/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/erisim-yok/page.tsx (öneri; mevcut dosya yok). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Üst çubuk: Medaris NAZIR, kullanıcı (monogram 'ET', ad, rol 'Talebe', ayarlar). Kapsam seçici ve yan menü YOK.
- Başlık 'Bu portala erişiminiz yok'.
- Metin: 'Nazır, medrese ve ders görevlilerinin portalıdır. Hesabınızda bir medrese ya da ders görevi yok; görev aldığınızda bu portal açılır.'
- 'Giriş yaptığınız hesap: {e-posta}'.
- Bağlantı 'Tedris’e dön' (tedris-web kök adresi; adres yapılandırması doğrulanamadı).

## 3. Durumlar

- Yükleniyor: görev sorgusu bitene dek tam sayfa iskelet (içerik flaş yapmasın).
- Hata: görev sorgusu 5xx ise bu sayfa DEĞİL, yeniden-dene hatası gösterilmeli (yetkisiz sanılmasın) — tuvalde yok, doğrulanamadı.
- Oturum yok: Keycloak girişine yönlendirilir (diğer web uygulamalarındaki next-auth akışıyla; `libs/services/src/auth`).

## 4. Etkileşimler

- 'Tedris’e dön' → tedris-web ana sayfası (dış uygulama bağlantısı, `<a>`).
- Başka etkileşim yok; yan menü yok. Kullanıcı satırı → Hesap (20) yalnız görevi olanlarda anlamlı, burada tuvalde tıklanabilirlik belirsiz — doğrulanamadı.

## 5. API

- Mevcut uç YOK. Kanıt: `apps/tedrisat/src/course/course.controller.ts` ve `apps/tedrisat/src/kosk/kosk.controller.ts` içinde 'kullanıcının görevleri' ucu bulunmuyor; `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` madrasah için PUBLIC döner.
- YOK — yeni endpoint: `GET /me/assignments` → `{ madrasahs: [], courses: [] }`; her ikisi boşsa 02 gösterilir. Aynı uç 01/03/20 tarafından kullanılır.
- Kimlik: access token `sub`/`email` next-auth oturumundan (`libs/services/src/auth/get-access-token.ts`).

## 6. Sınıf

**B** — Görev yoksa gösterilen ekran; yalnız 'kullanıcının medrese/ders görevi var mı' sorusunu yanıtlayan bir uç gerekir (şu an yok) → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok. Oturum/çıkış altyapısı ortak libs'te var (`libs/services/src/auth`, `auth-client`).

## 8. Kabul kriterleri

1. Görev ataması olmayan oturumlu kullanıcı `/` açınca bu ekranı görür; yan menü görünmez.
2. Gösterilen e-posta oturumdaki e-postayla aynıdır.
3. 'Tedris’e dön' tedris-web'e götürür.
4. Görevi olan kullanıcı bu sayfayı açarsa Pano'ya (01) yönlenir.
5. Görev sorgusu hata verirse yetkisiz mesajı gösterilmez.

## 9. Test senaryoları

- Unit: `assignments` boşsa yönlendirme kararı (saf fonksiyon).
- Playwright: görevsiz talebe hesabıyla giriş → 'Bu portala erişiminiz yok' + e-posta metni; 'Tedris’e dön' bağlantısı href doğrulaması.
- Playwright: nazır hesabıyla `/erisim-yok` → Pano'ya yönlenir.
