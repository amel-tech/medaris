# Gezinme grafları: rapor (ce47fce8, 25 Ekim 2026)

| Uygulama | `delurio page --strict` |
|---|---|
| nazar | 32 sayfa, 55 yol, 8 kişi türü; 5 sorun, 3 not (çıkış 2) |
| nizam | 49 sayfa, 125 yol, 9 kişi türü; 4 sorun, 2 not (çıkış 2) |
| tedris | 33 sayfa, 107 yol, 2 kişi türü; 1 sorun, 2 not (çıkış 2) |
| landing | 10 sayfa, 28 yol, 1 kişi türü; 0 sorun, 1 not (çıkış 0) |

`extract --check` üçünde 0. Çıkış 2'ye yol açan sorunların hepsi uygulamanın gerçek davranışı; aşağıda bulgu olarak yazılı.

## 16 Ekim'den bu yana ne değişti

- Dört uygulamada adreslerden dil öneki kalktı (#348). Eski adresler 308 ile yönleniyor (`apps/tedris/proxy.ts:23`). Landing'in Tedris yönlendirmeleri artık `/tr` ve `?locale=` taşımıyor.
- nazar: Ders desteleri yapıldı (#356): `/ders/{id}/deste` ve `/ders/{id}/deste/{id}`. Menü girişi `deck.manage_course` istiyor.
- nizam: karşılama sayfasına dil menüsü geldi. Ders açınca kişi Dersler'e dönüyor.
- tedris: dersin "Ders destesi" sekmesi desteleri listeliyor (#357).
- Eski elle yazılmış yarılarda yanlış okumalar vardı. Bunlar düzeltildi:
  - nazar: medrese sayfalarındaki API retleri;
  - tedris: herkese açık profil;
  - landing: satır numaraları.

## Bulgular

**Yüksek**

- **NAV-1** `apps/nizam/features/dashboard/components/medaris-home.tsx:49`: #348 ile `base` değeri `"/"` oldu. Başnazımın ve Medaris nazımının ana sayfasındaki her bağlantı artık `//talepler/…`, `//kosks` biçiminde başlıyor ve tarayıcı bunu başka bir sunucu sanıyor. Test (`test/dashboard-views.spec.tsx:140`) yalnız `toContain` ile baktığı için geçiyor.

**Orta**

- **NAV-2** `apps/nizam/features/courses/components/sessions-view.tsx:291` Tedris'te `/courses/{id}/sessions/{id}` adresine bağlanıyor. Tedris'te yalnız `/lessons/` var, bu yüzden bağlantı 404 veriyor.
- **NAV-3** `apps/nizam/lib/shell-nav.ts:178` Medaris nazımının menüsüne denetim kaydı, pasif kapsamlar, platform ayarları ve ortak uygulamalar hiç girmiyor. Oysa `ITEM_PERMISSIONS` (`:288`) bunlar için izin yazıyor ve API izni olana bu sayfaları açıyor (`audit.service.ts:97`). 4 hedef "yol yok" diye başarısız. 16 Ekim'den beri sürüyor.
- **NAV-4** `apps/nizam/lib/shell-nav.ts:119`, `:125`, `:149`: İtirazlar, Kalıcı yasak talepleri ve YouTube bağlantısı girişlerinin sayfası yok, sunucu 404 veriyor. Sürüyor.
- **NAV-5** Medaris nazımına gösterilen bağlantılar 403 ile bitiyor. Bu, MDRS-108'e aykırı (`kosk-abilities.ts:10`). Bağlantılar: `kosk-manage-page.tsx:542` ve `:584`, `kosk-courses-view.tsx:67` ve `:74`, `kosk-course-table.tsx:124` ve `:275`. Karşı tarafta API: `course.controller.ts:522`, `hosting.controller.ts:73`.
- **NAV-6** `apps/nazar/features/shell/nav.ts:84` medrese menüsünde ve ders menüsündeki Sorular ile Arşiv'de `requires` yok. İzni olmayan bir medrese nazırında menünün 10 girişinden 6'sı reddediyor. İzni olmayan bir ders nazırında 12 girişten 8'i reddediyor, açılan yok.
- **NAV-7** `apps/nazar/features/pano/components/pano-page.tsx:102` ve `:219`: "Medrese dersi aç" ve "Medrese dışı ders talebi gönder" panoyu okuyabilen herkese gösteriliyor (`madrasah-portal.controller.ts:118`). Arkalarındaki sayfalar ise başka izinler istiyor: `madrasah.course_open` (`madrasah-course.controller.ts:83`) ve `offsite_course_request` (`:240`).
- **NAV-8** `apps/nazar/app/ders/[dersId]/page.tsx:11`: `/` müderrisi ve ders nazırını henüz yapılmamış "Genel bakış" sayfasına gönderiyor. Sürüyor.
- **NAV-9** nazar menüsünde beş sayfa yapılmamış: Bildirimler, İtirazlar, Kabul kuralları, Genel bakış ve ders Yasaklamalar. Sürüyor.
- **NAV-10** `apps/tedris/features/account/components/account-settings.tsx:73`: cinsiyet boş kalabiliyor ve Tedris bunu hiçbir adımda istemiyor. Girişten sonra kişi doğrudan Ana sayfa'ya iniyor (`lib/post-sign-in.ts:12`). Cinsiyet zorunlu olmalı; bu bir eksik.

**Düşük**

- **NAV-11** `apps/nazar/features/pano/components/pano-tables.tsx:100`: "Düzenle" her derste gösteriliyor. Ders izni olmayan bir nazıra Celseler sayfası reddediyor.
- **NAV-12** `apps/nazar/features/courses/components/courses-page.tsx:108`: düğmeleri gösteren izinlerle düğmelerin açtığı sayfaların istediği izinler farklı.
- **NAV-13** `courses-page.tsx:55` ve dört dosya daha "API her medrese nazırını reddeder" diyor. API artık izin koduna bakıyor (`madrasah-portal.controller.ts:36`).
- **NAV-14** nizam'da `/decks` sayfasına hiçbir yerden bağlantı yok (`features/decks/actions/index.ts:12`). Sürüyor.
- **NAV-15** `apps/tedris/features/public-profile/availability.ts:14`: profil sayfası herkese 404 veriyor. Açılmadan önce bir çelişki çözülmeli: kod, profilin cinsiyeti herkese göstereceğini söylüyor (`:9`); Aydınlatma Metni göstermeyeceğini söylüyor.
- **NAV-16** `apps/tedris/next.config.js:90`: `/` herkesi kalıcı olarak `/home`'a gönderiyor. Bu yüzden `app/page.tsx:13` hiç çalışmıyor; ziyaretçi Keşfet'e `home/page.tsx:27` üzerinden varıyor.
- **NAV-17** `apps/tedris/features/schedule/components/schedule-page.tsx:210`: "Saat dilimini değiştir" Hesap sayfasını açıyor, ama saat dilimi kartına değil, sayfanın başına.
- **NAV-18** Farklı adlar, ortak başlıklar:
  - Tedris logosu ziyaretçiye "Medaris Tedris, ana sayfa" diyor ama Keşfet'i açıyor (`desktop-bar.tsx:65`).
  - Yedi Tedris sekmesinin başlığı aynı: "Medaris Tedris" (`app/layout.tsx:19`).
  - Beş nizam sekmesinin başlığı aynı: "Nizam".
  - nazar'da deste listesi ile deste sayfasının başlığı aynı (`deste/[desteId]/page.tsx:6`).
  - nazar ders menüsünde "Pano" ve "Genel bakış" aynı sayfayı açıyor.

Toplam: 1 yüksek, 9 orta, 8 düşük.

## Çıkarıcının okuyamadıkları

Bunları elle yazdım; her birinin yanında `evidence` ya da `source` var:

- API'nin cevabına bağlı kapılar: nazar'da medrese sayfaları, Sorular ve Arşiv; nizam'da sayfaların çoğu.
- nizam'da yardımcı fonksiyonların içindeki kapılar: `readCourseScope`, `koskAbilities`, `koskEntry`.
- Kişilerin izin kümeleri.
- Sayfa içindeki bağlantılar, ortam adresinden kurulan Tedris ve Nazar bağlantıları dahil.
- API'den ya da `tedris-account.json`/`tedris-learn.json`'dan gelen başlıklar.
- Bir sabitin arkasında hep `notFound()` veren sayfa (tedris profil).
- `PAGE_CODES` yalnız bir import adımına kadar izleniyor.
- Landing'in çıkarıcısı yok; graf baştan elle yazıldı.
