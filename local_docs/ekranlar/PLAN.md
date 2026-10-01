# Ekran tuvali kodlama planı (Faz 3)

**Durum:** Faz 1 ✓ · Faz 2 ✓ · Faz 3 ✓ (kullanıcı onayladı, 2026-10-02) · **Sıradaki: Faz 4 — Paket 0.** Linear issue'ları henüz açılmadı (bir hook issue açmayı engelledi; bkz. Kararlar altı not).

Kaynaklar: `_faz2.json` (150 ekran: 124 A/B, 26 C), her ekranın `spec.md` "Amaç ve rota" ve "API" bölümleri, `_kurallar.md`. Ekran kısaltması `proje/NN` = `<proje>/NN-...` dizini (`medaris/NN` Keycloak teması + tedris çıkışı, `tedris`, `nizam`, `nazir`).

Dosya tahmini: ekranların `dosya_tahmini` toplamı (ham) + temel/kit ek tahmini − paylaşılan endpoint kesintisi (her tekrar eden endpoint için 3 dosya: controller+servis+dto, elle yargı). Kesinti ve ek sayıları ölçülmedi, tahmindir; net değer 60 sınırına karşı kontrol edildi.

## Kararlar (2026-10-02)

- **(a) Medrese API adı:** her yerde `/madrasahs` (`/madrasas` ve `/medreseler` kullanılmaz). Türkçe metindeki "medrese" kelimesi değişmedi.
- **(b) Kullanıcı arama:** `/users/lookup` Keycloak Admin API'den beslenir; tedrisat/teskilat'ta service-account client kullanılır. `atama-temeli` (39) paketi dev realm yapılandırmasını (repo'daki Keycloak realm import'u, varsa) ve env anahtarlarını içerir. Yalnız gerçek ortam secret'ı insan işidir; paket 39 notunda risk olarak yazıldı.
- **stack-23:** yeni kit bileşenleri `libs/ui/src/mds/` altında, eski shadcn dosyaları yerinde — _kurallar 34 "aynı yol" der ama 40+ tüketici shadcn/Radix API'sine bağlı; yerinde yeniden yazmak ekransız ppakette uygulamaları kırar, temizlik son tüketici geçince (kural 42).
- **stack-23:** Select Base UI (native değil) — kural 23 açık bırakıyor; tek bileşen, açılır liste `.mds-popup/.mds-option` ile sınıf katmanında (`styles/mds/baseui.css`; components.css değişmedi).
- **stack-23:** Playwright e2e kurulmadı — bu pakette ekran/API yok; ilk ekranlı paket (25) kursun, tek yer, Nx target'ı. Bileşenler happy-dom'da vitest ile doğrulandı, gerçek tarayıcıda doğrulanmadı.
- **stack-23:** Faz 5 kontrolü (tur 2) ekran/spec olmadığı için tasarım sistemi kartlarına karşı yapıldı — paket 23 satırında ekran yok; bileşenler `/tmp` dışı-repo bir esbuild+Tailwind sahnesinde gerçek Chromium ile render edilip `design-system/medaris-unified/components/*.card.html` ile hesaplanmış stil ve etkileşim düzeyinde karşılaştırıldı, API/web uygulaması başlatılmadı (tüketen ekran yok).
- **stack-24:** Weeks + WeekAccordion — tasarım sisteminde WeekAccordion tek haftadır, Base UI Accordion durumu kökte tuttuğu için `Weeks` (kök, multiple + hiddenUntilFound, aktif hafta açık gelir) ve `WeekAccordion` (Item) ayrıldı.
- **stack-24:** Toast tek Base UI Viewport — sistemdeki iki canlı bölge (status/alert) yerine Base UI'nin tek bölgesi + toast başına role (`priority: high` = alertdialog); kural 21 süreleri `useToaster().notify` içinde; `--mds-fixed-end` yazılmadı.
- **stack-24:** Kapsam seçici bileşen değil, `AppBar`/`Sidebar` `scope` prop'u — kural 23 Select/Menu'yü açık bırakıyor, ilk tüketen ekran (nizam) karar versin; Giriş kabuğu paket 25'e bırakıldı.
- **stack-24:** Playwright e2e yine kurulmadı — pakette ekran/API yok; kuran ilk ekranlı paket 25. Bileşenler happy-dom'da doğrulandı, gerçek tarayıcıda doğrulanmadı (migration notunda yazılı).
- **stack-24:** gate'te tedrisat flashcard-bulk e2e'si bir koşuda düştü (collections), tek başına 2x ve tam gate'te yeniden yeşil — paketle ilgisiz (backend değişmedi), flaky.
- **stack-27:** Medrese tablosu/migration/GET /madrasahs/:id zaten vardı (spec bayat: MDRS-106/134) — yeni migration yazılmadı; eksik olan sayfa verisi `GET /madrasahs/:id/overview` olarak eklendi (ders+köşk+kayıt durumu+sonraki celse+başmüderris, anonim açık, meetingUrl yok) — mevcut `GET /madrasahs/:id` yanıtını genişletmek üretilmiş istemciyi ve diğer tüketicileri etkilerdi.
- **stack-27:** Köşk kartı yalnız medresenin listelenen dersi olan köşkleri gösterir (hosting hakkı olanların hepsini değil) — kabul ölçütü 5 böyle; liste dışı köşkün dersi hiçbir listede yok (MDRS-122).
- **stack-27:** Playwright e2e kuruldu: apps/tedris/playwright.config.ts + e2e/, Nx `test:e2e` (gate `-t test`'e girmez), tohum SQL ile (E2E_DATABASE_URL) — Keycloak girişi gerekmeyen anonim akışlar doğrulandı; rozetler (Devam ediyor/Onay bekliyor) tarayıcıda doğrulanamadı (Keycloak test kullanıcısı yok), API e2e + bileşen testiyle kapsandı. Sonraki ekranlı paketler bu altyapıyı kullanır.
- **stack-27:** `libs/ui/src/mds/avatar.tsx`'e "use client" eklendi; kitin hook'lu diğer dosyaları (locale.tsx, tabs, select…) sunucu bileşeninden import edilemez — her tüketen paket gerektiğinde ekler, `joinRun` gibi saf yardımcılar sayfada yerel yazıldı.
- **stack-27:** tedris henüz birleşik tasarımda değil (kabuk geçiş paketi planda yok): medrese rotası `medaris.css`'i kendi layout'unda yükler; Tailwind kırılım değişkenlerini ezdiği için kabuktaki 4 `container` sınıfı `max-w-[80rem]` oldu ve `/madrasahs` TabView `<main>` sarmalayıcısından muaf — uygulama çubuğu (logo/Keşfet/Derslerim/zil) kodlanmadı, eski başlık altında render olur. Sonraki tedris paketleri aynı yolu izlemeli ya da kabuk geçişi ayrı paket olmalı.
- **Linear notu:** 36 paket (MDRS-152–187) + 13 ertelendi (MDRS-188–200) issue'su 2026-10-02'de kullanıcı onayıyla açıldı; tüm issue'lara yorum eklendi, hook geçici kapatılıp geri açıldı.

## 1. Paket tablosu

| No | slug | dal | ekranlar | A/B | yeni endpoint | dosya (ham / ek / kesinti / net) | Linear | PR | durum |
|--|--|--|--|--|--|--|--|--|--|
| 22 | pr106-cherry-pick | `release/stack-22-pr106-cherry-pick` | #131 | 0/0 | 0 (ekran toplamı): - | 88 (cherry-pick, ölçüldü: 15+70+1+2) | MDRS-152 | | PR açık |
| 23 | ui-kit-form | `release/stack-23-ui-kit-form` | #132 | 0/0 | 0 (ekran toplamı): - | 0 / +30 / -0 / **30** | MDRS-153 | | PR açık |
| 24 | ui-kit-katman | `release/stack-24-ui-kit-katman` | - | 0/0 | 0 (ekran toplamı): - | 0 / +40 / -0 / **40** | MDRS-154 | #133 | PR açık |
| 25 | giris-keycloak | `release/stack-25-giris-keycloak` | medaris/01<br>medaris/03<br>medaris/05<br>medaris/07<br>medaris/12<br>medaris/13<br>medaris/14<br>medaris/17 | 8/0 | 0 (ekran toplamı): yok (hepsi A) | 24 / +0 / -0 / **24** | MDRS-155 | | bekliyor |
| 26 | tedris-sistem-sayfalari | `release/stack-26-tedris-sistem-sayfalari` | medaris/16<br>tedris/07<br>tedris/14<br>tedris/38<br>tedris/39<br>tedris/40 | 6/0 | 0 (ekran toplamı): yok (hepsi A) | 24 / +0 / -0 / **24** | MDRS-156 | | bekliyor |
| 27 | medrese-temeli | `release/stack-27-medrese-temeli` | tedris/03 | 0/1 | 1 (ekran toplamı): GET /madrasahs/:id (+ madrasah tablosu, course.madrasahId, migration) | 14 / +6 / -0 / **20** | MDRS-157 | | push edildi (PR yok) |
| 28 | celse-temeli | `release/stack-28-celse-temeli` | tedris/15<br>tedris/18 | 0/2 | 2 (ekran toplamı): GET /courses/:cid/sessions/:sid (+ status, iptal/telafi alanları) | 20 / +6 / -3 / **23** | MDRS-158 | | bekliyor |
| 29 | tedris-kesfet | `release/stack-29-tedris-kesfet` | tedris/02<br>tedris/04<br>tedris/20 | 0/3 | 4 (ekran toplamı): GET /madrasahs, filtreli GET /kosks, GET /kosks/:id/decks, bekleyen başvurular | 36 / +0 / -6 / **30** | MDRS-159 | | bekliyor |
| 30 | anonim-okuma | `release/stack-30-anonim-okuma` | tedris/09<br>tedris/10<br>tedris/11<br>tedris/45 | 0/4 | 6 (ekran toplamı): GET /public/kosks, /public/kosks/:id(/courses), /public/madrasahs(/:id) | 32 / +6 / -6 / **32** | MDRS-160 | | bekliyor |
| 31 | tedris-ders-sayfasi | `release/stack-31-tedris-ders-sayfasi` | tedris/05<br>tedris/06<br>tedris/08<br>tedris/12<br>tedris/13 | 0/5 | 5 (ekran toplamı): GET /public/courses/:id, DELETE /courses/:id/enroll, erişim kaldırma durumu, kadro tamamlama | 55 / +0 / -12 / **43** | MDRS-161 | | bekliyor |
| 32 | tedris-celse-durumlari | `release/stack-32-tedris-celse-durumlari` | tedris/16<br>tedris/17<br>tedris/19<br>tedris/24 | 0/4 | 4 (ekran toplamı): ders kaydı alanı + GET /courses/:id/recordings | 31 / +0 / -9 / **22** | MDRS-162 | | bekliyor |
| 33 | tedris-program-takvim | `release/stack-33-tedris-program-takvim` | tedris/21<br>tedris/22<br>tedris/23<br>tedris/44 | 0/4 | 6 (ekran toplamı): GET /sessions?from&to, tek celse .ics, /me/calendar-feed + /calendar/:token, /me/upcoming-lessons | 40 / +0 / -3 / **37** | MDRS-163 | | bekliyor |
| 34 | tedris-desteler | `release/stack-34-tedris-desteler` | tedris/25<br>tedris/26<br>tedris/27<br>tedris/28<br>tedris/29<br>tedris/31<br>tedris/33 | 2/5 | 8 (ekran toplamı): deck summary/explore/collections, cardType+etiket, publish-request gönder/geri çek | 50 / +3 / -9 / **44** | MDRS-164 | | bekliyor |
| 35 | tedris-deste-calisma | `release/stack-35-tedris-deste-calisma` | tedris/01<br>tedris/30<br>tedris/32 | 0/3 | 6 (ekran toplamı): /flashcard/decks/due, tekrar kuyruğu zamanlaması, /kosks/followed/courses, /public/flashcard/decks/:id | 28 / +0 / -6 / **22** | MDRS-165 | | bekliyor |
| 36 | tedris-hesap-profil | `release/stack-36-tedris-hesap-profil` | tedris/34<br>tedris/35<br>tedris/37 | 0/3 | 5 (ekran toplamı): GET/PATCH /me, public-profile, POST /kosk-applications | 25 / +0 / -3 / **22** | MDRS-166 | | bekliyor |
| 37 | bildirim-temeli | `release/stack-37-bildirim-temeli` | tedris/36 | 0/1 | 3 (ekran toplamı): GET /notifications, unread-count, read, read-all (+ notification tablosu) | 10 / +4 / -0 / **14** | MDRS-167 | | bekliyor |
| 38 | nizam-kabuk | `release/stack-38-nizam-kabuk` | nizam/03<br>nizam/50<br>nizam/51<br>nizam/52<br>nizam/31<br>nizam/57 | 6/0 | 0 (ekran toplamı): yok (hepsi A) | 32 / +3 / -0 / **35** | MDRS-168 | | bekliyor |
| 39 | atama-temeli | `release/stack-39-atama-temeli` | nizam/04<br>nizam/06<br>tedris/43 | 0/3 | 5 (ekran toplamı): GET /me/assignments, /me/roles, /me/grants, /me/permissions, /me/effective-permissions, GET /nizam/chief-nazim, GET/lookup /users/lookup | 26 / +14 / -3 / **37** | MDRS-169 | | bekliyor |
| 40 | nizam-medrese | `release/stack-40-nizam-medrese` | nizam/07<br>nizam/08<br>nizam/26<br>nizam/27 | 0/4 | 9 (ekran toplamı): GET/POST /madrasahs, head-muderris, barındırma hakları | 41 / +0 / -9 / **32** | MDRS-170 | | bekliyor |
| 41 | nizam-izin-yonetimi | `release/stack-41-nizam-izin-yonetimi` | nizam/11<br>nizam/12<br>nizam/13 | 0/3 | 12 (ekran toplamı): /nizam/medaris-nazims (+grants), permission-groups | 40 / +0 / -9 / **31** | MDRS-171 | | bekliyor |
| 42 | nizam-kapsam-izinleri | `release/stack-42-nizam-kapsam-izinleri` | nizam/38<br>nizam/14<br>nizam/22 | 0/3 | 10 (ekran toplamı): /kosks/:id/grants, inactive-scopes, madrasahs/:id/basmuderris + delegations | 38 / +0 / -6 / **32** | MDRS-172 | | bekliyor |
| 43 | arsiv-temeli | `release/stack-43-arsiv-temeli` | nizam/28<br>nizam/29 | 0/2 | 6 (ekran toplamı): archive listele/restore/impact/kalıcı sil, soft-delete sütunları (course, kosk, deck) | 20 / +6 / -3 / **23** | MDRS-173 | | bekliyor |
| 44 | nizam-kosk-yonetimi | `release/stack-44-nizam-kosk-yonetimi` | nizam/09<br>nizam/10<br>nizam/24<br>nizam/25<br>nizam/21 | 0/5 | 8 (ekran toplamı): GET /admin/kosks, köşk nazımları, politika alanları, hide/restore | 49 / +0 / -15 / **34** | MDRS-174 | | bekliyor |
| 45 | nizam-kosk-gorunum | `release/stack-45-nizam-kosk-gorunum` | nizam/20<br>nizam/23<br>nizam/53 | 0/3 | 11 (ekran toplamı): hosting-rights, deactivate/hide, ders gizle/geri al, /courses/:id/stats | 40 / +0 / -12 / **28** | MDRS-175 | | bekliyor |
| 46 | nizam-ders-celse | `release/stack-46-nizam-ders-celse` | nizam/32<br>nizam/33<br>nizam/34<br>nizam/54<br>nizam/55<br>nizam/56 | 0/6 | 9 (ekran toplamı): POST /courses/:id/sessions/bulk, PATCH celse, imam alanı, kısmi PUT | 52 / +0 / -15 / **37** | MDRS-176 | | bekliyor |
| 47 | yasak-temeli | `release/stack-47-yasak-temeli` | nizam/41<br>nizam/42 | 0/2 | 5 (ekran toplamı): POST /courses/:id/bans, /bans/:id/lift, ban-device-events | 19 / +6 / -3 / **22** | MDRS-177 | | bekliyor |
| 48 | nizam-yasak | `release/stack-48-nizam-yasak` | nizam/40<br>nizam/48<br>nizam/58 | 0/3 | 9 (ekran toplamı): /bans listele/extend, dersten çıkar + tamamla | 31 / +0 / -9 / **22** | MDRS-178 | | bekliyor |
| 49 | nizam-bildirim-hesap | `release/stack-49-nizam-bildirim-hesap` | nizam/37<br>nizam/46<br>nizam/36<br>nizam/47 | 0/4 | 10 (ekran toplamı): /notifications, /me/preferences, GET /me | 38 / +0 / -18 / **20** | MDRS-179 | | bekliyor |
| 50 | nizam-deste | `release/stack-50-nizam-deste` | nizam/16<br>nizam/30<br>nizam/35 | 0/3 | 11 (ekran toplamı): /nizam/deck-publish-requests, köşk desteleri, deck-proposals | 34 / +0 / -9 / **25** | MDRS-180 | | bekliyor |
| 51 | nizam-basvuru-politika | `release/stack-51-nizam-basvuru-politika` | nizam/15<br>nizam/19<br>nizam/17<br>nizam/39 | 0/4 | 13 (ekran toplamı): /nizam/kosk-applications, platform-policies, audit-log (+export), course-requests | 51 / +0 / -6 / **45** | MDRS-181 | | bekliyor |
| 52 | nizam-panolar | `release/stack-52-nizam-panolar` | nizam/01<br>nizam/02<br>nizam/05 | 0/3 | 7 (ekran toplamı): /nizam/dashboard, /kosks/:id/dashboard, ret gerekçesi | 58 / +0 / -12 / **46** | MDRS-182 | | bekliyor |
| 53 | nazir-kabuk | `release/stack-53-nazir-kabuk` | nazir/02<br>nazir/03<br>nazir/20<br>nazir/21<br>nazir/22 | 0/5 | 6 (ekran toplamı): /me/permissions, badge-counts (medrese ve ders) | 46 / +0 / -12 / **34** | MDRS-183 | | bekliyor |
| 54 | nazir-nazirlar | `release/stack-54-nazir-nazirlar` | nazir/04<br>nazir/05<br>nazir/15 | 0/3 | 13 (ekran toplamı): /madrasahs/:id/nazirs, ayarlar PATCH, grants | 60 / +0 / -12 / **48** | MDRS-184 | | bekliyor |
| 55 | nazir-izinler-arsiv | `release/stack-55-nazir-izinler-arsiv` | nazir/06<br>nazir/16<br>nazir/12 | 0/3 | 10 (ekran toplamı): /madrasahs/:id/permissions, grup CRUD, archive/hide | 56 / +0 / -15 / **41** | MDRS-185 | | bekliyor |
| 56 | nazir-dersler | `release/stack-56-nazir-dersler` | nazir/07<br>nazir/08<br>nazir/17<br>nazir/18 | 0/4 | 11 (ekran toplamı): /madrasahs/:id/courses, hosting-kosks, müderris PUT, ders gizle | 62 / +0 / -18 / **44** | MDRS-186 | | bekliyor |
| 57 | nazir-talebe-yasak-pano | `release/stack-57-nazir-talebe-yasak-pano` | nazir/09<br>nazir/10<br>nazir/11<br>nazir/01 | 0/4 | 12 (ekran toplamı): /madrasahs/:id/students, bans escalate/permanent-request, offsite-course-requests, dashboard | 70 / +0 / -24 / **46** | MDRS-187 | | bekliyor |

Dal zinciri: 22 `release/stack-21-mdrs-134` (PR #129) üstünden açılır; her paket bir öncekinin dalından. Kit paketleri (23, 24) ekran içermez, dosya sayısı tahmindir (token/CSS/Tailwind Paket 0 ile geliyor, kalan iş Base UI React bileşenleri).

## 2. Paket notları (kapsam, bağımlılık, risk)

**22 pr106-cherry-pick** — PR #106 dört commit cherry-pick (29577c01 233d56aa cfa955fc 88de6c12): token+mds CSS+Tailwind (15 dosya), landing yeniden yapımı (70 dosya), sync-libs düzeltmesi, bağımlılık yükseltmesi. Kodlama değil, cherry-pick.
Bağımlılık: base stack-21-mdrs-134 (PR #129). Risk: Landing çakışması beklenir; ham 88 dosya (cherry-pick, kodlayıcı bağlamı yemez, 60 sınırı dışı tutuldu).

**23 ui-kit-form** — libs/ui: @base-ui/react bağımlılığı, Button/IconButton/Field/Input/Textarea/Select/Checkbox/Radio/Switch/ChoiceChips/Tabs/Tooltip, eski shadcn eşlerinin yerine (aynı yol, _kurallar 34). Token/CSS Paket 0 ile geldi.
Bağımlılık: Paket 0. Risk: Dosya sayısı ekran listesinde yok, tahmin; Base UI role/aria maddeleri _kurallar 20 "doğrulanmadı". Eski bileşen tüketicileri kırılabilir.

**24 ui-kit-katman** — Dialog/AlertDialog, Toast, Avatar, Progress, Accordion, telefon menü çekmecesi (Sheet), AppBar, kabuk bileşenleri ve 18 native bileşen (Badge, Card, Table...); Toast/Tooltip/Direction provider kurulumu.
Bağımlılık: ui-kit-form. Risk: Tahmin; en şişme riski olan paket, gerekirse native bileşenler ayrı pakete bölünür.

**25 giris-keycloak** — libs/ui/src/giris saf React ekranları + apps/keycloak-theme uyarlayıcıları (login, register, info, update-password, error, logout-confirm). E-posta ekranlarının tümü C (SMTP).
Bağımlılık: ui-kit-form. Risk: Storybook ile doğrulama; kcContext bileşene sızmamalı (_kurallar 44). e-posta ekranları ertelendi.

**26 tedris-sistem-sayfalari** — Çıkış onayı (tedris), başvuru onayı penceresi, ders önizleme, 404/403/hata sayfaları.
Bağımlılık: ui-kit-katman. Risk: 14 için yönetici/sahip farkı doğrulanamadı.

**27 medrese-temeli** — Medrese varlığı: şema, migration, okuma endpointi, medrese sayfası. Temel paket.
Bağımlılık: tedris-sistem-sayfalari. Risk: API adı kararı verildi: her yerde `/madrasahs` (bkz. Kararlar).

**28 celse-temeli** — Celse durum/iptal/telafi modeli ve tekil celse endpointi; celse sayfası (yaklaşan) ve iptal sayfası. Temel paket.
Bağımlılık: medrese-temeli. Risk: meetingUrl sunucuda maskelenmeli (bugün herkese dönüyor); migration ders tablosuna dokunur.

**29 tedris-kesfet** — Keşfet (girişli), köşk sayfası, Derslerim.
Bağımlılık: medrese-temeli, celse-temeli. Risk: 04 köşk desteleri ve nâzım adı için küçük ek alanlar gerekir.

**30 anonim-okuma** — Girişsiz okuma modülü (@Public + alan maskeleme) ve girişsiz keşfet/köşk/medrese/menü ekranları; middleware rota kilidi açılır.
Bağımlılık: medrese-temeli. Risk: Güvenlik: yanlış maskeleme veri sızdırır; middleware değişikliği tüm rotaları etkiler.

**31 tedris-ders-sayfasi** — Ders sayfasının beş durumu: ziyaretçi, kayıtsız, bekliyor, kayıtlı, erişimi kaldırılmış.
Bağımlılık: anonim-okuma, celse-temeli. Risk: Aynı CourseDetail yanıtı beş ekranda genişler; sunucu maskeleme kuralı bozulursa tüm durumlar etkilenir.

**32 tedris-celse-durumlari** — Canlı, sona erdi (kayıtlı), erişim yok celse sayfaları ve Ders kayıtları sekmesi.
Bağımlılık: celse-temeli, tedris-ders-sayfasi. Risk: Kayıt barındırma sağlayıcısı doğrulanamadı; 16/17 YouTube/Google API gerektirirse o kısım C olur.

**33 tedris-program-takvim** — Programım, Takvime ekle (.ics), takvim aboneliği, telefon menüsü (girişli).
Bağımlılık: celse-temeli. Risk: 23 alan adı/DNS altyapısı doğrulanamadı.

**34 tedris-desteler** — Desteler, Desteleri keşfet, Deste oluştur/ayrıntı/düzenle, kartlar, okuyan görünümü.
Bağımlılık: ui-kit-katman. Risk: 7 ekran, deste şeması değişir (migration); 29/31 yalnız frontend.

**35 tedris-deste-calisma** — Ana sayfa (talebe), çalışma/ezber kartı, girişsiz deste.
Bağımlılık: tedris-desteler, tedris-program-takvim, anonim-okuma. Risk: Ana sayfa üç paketin verisini toplar; tekrar zamanlama algoritması ürün kararı olabilir.

**36 tedris-hesap-profil** — Hesap, herkese açık profil, köşk açma başvurusu.
Bağımlılık: ui-kit-katman. Risk: Saat dilimi Keycloak'a yazılırsa C olur; açık rıza metni adı belirsiz. 37 sonradan nizam/15 için temel.

**37 bildirim-temeli** — Uygulama içi bildirim modeli ve tedris bildirimler ekranı. Temel paket.
Bağımlılık: ui-kit-katman. Risk: Olay üreticileri (celse değişti vb.) bu pakette tam bağlanmaz; e-posta tercihleri SMTP ister, hariç.

**38 nizam-kabuk** — Yönetim yetkiniz yok, üç çekmece menüsü, başvurular ve talebeler listesi; çıkış onayının nizam tarafı (+3 dosya).
Bağımlılık: ui-kit-katman. Risk: Kabuk root öznitelikleri (lang=tr, data-density) tüm nizam sayfalarını etkiler.

**39 atama-temeli** — Görev/atama/izin/izin-grubu şeması, /me uçları, kullanıcı arama (users tablosu). Temel paket; Tedris 43 ve Nizam 04/06 tüketici.
Bağımlılık: medrese-temeli. Kapsam eki (karar b): `/users/lookup` Keycloak Admin API'den; tedrisat/teskilat'ta service-account client; dev realm yapılandırması (repo'daki realm import'u, varsa) ve env anahtarları pakete dahil. Risk: gerçek ortam secret'ı insan işi (kodlanamaz, yalnız dev değeri paketlenir). nizam/43 C kaldı. Çok sayıda sonraki paket buna bağlı.

**40 nizam-medrese** — Medreseler listesi, medrese aç, barındırma hakları ve geri al.
Bağımlılık: atama-temeli. Risk: Dizin kararı verildi (Keycloak Admin API, bkz. Kararlar b).

**41 nizam-izin-yonetimi** — Medaris nâzımları, izin ver, izin grupları.
Bağımlılık: nizam-medrese. Risk: 4 Ekim 2026 sürüm kapısı: görevden alma penceresi o güne kadar açılmaz (şimdi 2 Ekim).

**42 nizam-kapsam-izinleri** — Köşk kapsamında izin ver, pasif kapsamlar, başmüderris değiştir.
Bağımlılık: nizam-izin-yonetimi. Risk: 22 de 4 Ekim sürüm kapısına bağlı.

**43 arsiv-temeli** — Soft-delete/gizleme şeması + köşk arşivi + platform arşivi. Temel paket.
Bağımlılık: nizam-medrese. Risk: Migration birden çok tabloya dokunur; mevcut DELETE sert silme, davranış değişir.

**44 nizam-kosk-yonetimi** — Köşkler, köşk aç, köşk ayarları, köşk nâzımları, nâzım ekle.
Bağımlılık: arsiv-temeli, atama-temeli. Risk: Köşk politika alanları (nizam/19) bu pakette şemaya girerse 19 ile çakışır.

**45 nizam-kosk-gorunum** — Köşk medaris yönetimi görünümü, dersler, genel bakış.
Bağımlılık: nizam-kosk-yonetimi. Risk: 20 tek başına 20 dosya.

**46 nizam-ders-celse** — Ders aç, müderris düzenle, ders ayarları, müfredat, celse planla, celseler.
Bağımlılık: celse-temeli, nizam-kosk-gorunum. Risk: 6 ekran; PUT tam gövde sorunu mevcut ders akışlarını etkiler.

**47 yasak-temeli** — Yasak modeli (kademe kuralı) + yasakla ve yasağı kaldır pencereleri. Temel paket.
Bağımlılık: nizam-ders-celse. Risk: Cihaz olayları doğrulanamadı; kademe kuralı ürün kararı.

**48 nizam-yasak** — Yasaklamalar (köşk), tüm yasaklar görünümü, dersten çıkar.
Bağımlılık: yasak-temeli. Risk: 48 medrese modeline bağlı kapsam süzgeci.

**49 nizam-bildirim-hesap** — Bildirimler (köşk nâzımı, nizam), hesap ekranları.
Bağımlılık: bildirim-temeli, atama-temeli. Risk: Olay üreticileri bu pakette bağlanır; kapsam şişebilir.

**50 nizam-deste** — Deste yayın istekleri, köşk desteleri, köşk destesi aç.
Bağımlılık: tedris-desteler, arsiv-temeli. Risk: Deste yayın isteği alanı tedris/28 ile paylaşılır; şema çakışmasına dikkat.

**51 nizam-basvuru-politika** — Köşk başvuruları, platform ayarları, denetim kaydı, gelen medrese dışı ders talepleri.
Bağımlılık: tedris-hesap-profil, nizam-kosk-yonetimi. Risk: Denetim kaydı (17) önceki paketlerin olaylarına sonradan bağlanır; KVKK süresi açık madde.

**52 nizam-panolar** — Medaris başnâzımı, köşk nâzımı ve medaris nâzımı ana sayfa panoları.
Bağımlılık: nizam-basvuru-politika, nizam-yasak. Risk: Panolar çoğu paketin verisini toplar; en bağımlı paket.

**53 nazir-kabuk** — Erişim yok, kapsam seçici, hesap, iki telefon menüsü.
Bağımlılık: atama-temeli, ui-kit-katman. Risk: Nazir libs/ui kullanmıyor: Tailwind çift importu ve eski stil temizliği bu pakette.

**54 nazir-nazirlar** — Medrese ayarları, medrese nâzırları, görevden al.
Bağımlılık: nazir-kabuk, nizam-izin-yonetimi. Risk: 15 4 Ekim sürüm kapısı; 05 kullanıcı arama kararı.

**55 nazir-izinler-arsiv** — İzinleri düzenle, izin grubu, arşiv.
Bağımlılık: nazir-nazirlar, arsiv-temeli. Risk: 06 4 Ekim sürüm kapısı.

**56 nazir-dersler** — Dersler, medrese dersi aç, müderrisleri değiştir, dersi gizle.
Bağımlılık: nazir-nazirlar, nizam-ders-celse. Risk: Ham toplam 62; net 60 sınırında, kesinti varsayımı yanlışsa bölünür.

**57 nazir-talebe-yasak-pano** — Medrese dışı ders talebi, talebeler, yasaklamalar, pano.
Bağımlılık: nizam-yasak, nizam-basvuru-politika, nazir-dersler. Risk: Ham 70, net 60 sınırında; pano en son. Kalıcı yasak talebi ve itiraz C ile komşu.

## 3. Ertelendi (C sınıfı, hiçbir pakette yok)

| ekran | proje | gerekçe | önerilen Linear başlığı | Linear |
|--|--|--|--|--|
| medaris/02 | keycloak-theme | Arapça/RTL tuvalde sonraki faz (_kurallar madde 3) | Add Arabic/RTL support to the Keycloak login theme | MDRS-192 |
| medaris/04 | keycloak-theme | SMTP ve verifyEmail realm ayarı gerekir | Enable SMTP and verify-email flow for the Verify your email screen | MDRS-188 |
| medaris/06 | keycloak-theme | Sıfırlama e-postası SMTP gerektirir | Enable SMTP and password-reset email flow for the Reset password screen | MDRS-188 |
| medaris/08 | keycloak-theme | TOTP flow Keycloak sunucu yapılandırması | Configure the Keycloak TOTP flow for the Two-step verification screen | MDRS-190 |
| medaris/09 | keycloak-theme | CONFIGURE_TOTP required action sunucu ayarı | Enable the CONFIGURE_TOTP required action for the Set up two-step verification screen | MDRS-190 |
| medaris/10 | keycloak-theme | Aydınlatma özniteliği realm user-profile ayarı | Add the consent attribute to the realm user profile for the Complete your profile screen | MDRS-191 |
| medaris/11 | keycloak-theme | Kabul tarihi saklama Keycloak required action/SPI ister | Store terms-acceptance date via a Keycloak required action or SPI | MDRS-191 |
| medaris/15 | keycloak-theme | UPDATE_EMAIL bayrağı ve SMTP gerekir | Enable UPDATE_EMAIL and SMTP for the Change email screen | MDRS-188 |
| medaris/18 | keycloak-theme | E-posta teması + SMTP gerekir | Build the verify-email message template and wire SMTP | MDRS-188 |
| medaris/19 | keycloak-theme | E-posta teması + SMTP gerekir | Build the password-reset message template and wire SMTP | MDRS-188 |
| medaris/20 | tedrisat | SMTP, .ics ve celse bildirim servisi yok | Build the session invitation email with .ics and a notification service | MDRS-189 |
| medaris/21 | tedrisat | SMTP, .ics iptal ve celse servisi yok | Build the session changed/cancelled email with .ics cancellation | MDRS-189 |
| medaris/22 | tedrisat | Yasak alanı backend'de yok, SMTP gerekir | Build the escalated-ban notification email (needs ban model and SMTP) | MDRS-189 |
| medaris/23 | keycloak-theme | SMTP ve UPDATE_EMAIL gerekir | Build the email-change confirmation message (UPDATE_EMAIL and SMTP) | MDRS-188 |
| nazir/13 | nazir-web | Tuvalde 'sonraki faz'; icâzet koşulu seçilemiyor | Implement the Nazir acceptance rules screen (design is marked later phase) | MDRS-193 |
| nazir/14 | nazir-web | Tuvalde 'sonraki faz'; karar Medaris yönetiminde | Implement the Nazir open-appeal dialog (design is marked later phase) | MDRS-193 |
| nazir/19 | nazir-web | Tuvalde 'sonraki faz'; karar Medaris yönetimi arayüzünde | Implement the Nazir appeals list (decision lives in Medaris administration) | MDRS-193 |
| nizam/18 | nizam-web | Google/YouTube OAuth ve API denetimi insan gerektirir; başvuru yapılmamış | Implement the YouTube connection screen (Google OAuth and API review required) | MDRS-195 |
| nizam/43 | libs/ui + nizam-web | E-posta araması Keycloak admin yapılandırması ister | Implement the user picker states (Keycloak admin email lookup configuration) |
| nizam/44 | nizam-web | Tuvalde sonraki faz | Implement the Nizam appeals screen (design is marked later phase) | MDRS-194 |
| nizam/45 | nizam-web | Tuvalde sonraki faz | Implement the permanent-ban requests screen (design is marked later phase) | MDRS-194 |
| nizam/49 | nizam-web | Keycloak hesabı devre dışı bırakma gerekir | Implement platform-wide ban dialog (needs Keycloak account disable) | MDRS-197 |
| nizam/59 | nizam-web | Video depolama, YouTube/Drive API gerekir | Implement lesson recordings list (video storage and YouTube/Drive API) | MDRS-198 |
| nizam/60 | nizam-web | Video yükleme ve YouTube OAuth gerekir | Implement add-lesson-recording (video upload and YouTube OAuth) | MDRS-198 |
| tedris/41 | tedris-web | Cihaz tanıma/kısıtlama mekanizması tanımsız; altyapı ve ürün kararı gerekir. | Define and implement device restriction (mechanism and product decision missing) | MDRS-199 |
| tedris/42 | tedris-web | Tuvalde sonraki faz yazıyor; mütalaa modeli de yok. | Implement the reading (mutalaa) page and its model (design marked later phase) | MDRS-200 |

## 4. Eksik kaynak

Nazir'in "Ders" bölümündeki 22 ekran kaynakta yok (yeniden dışa aktarım bekleniyor). `nazir/` dizininde yalnız 01-22 (Medrese bölümü) var; Ders bölümü ekranları bu planın dışındadır, kaynak gelince yeni paket(ler) eklenir (nazir-dersler ve nazir-talebe-yasak-pano ile komşu).

## 5. Toplamlar ve doğrulama

- Paket sayısı: 36 (Paket 0 dahil); kod paketi 35. Temel paketler: medrese-temeli, celse-temeli, atama-temeli, arsiv-temeli, yasak-temeli, bildirim-temeli (+ anonim-okuma modülü). Kit paketleri: ui-kit-form, ui-kit-katman.
- Kapsam betiği (`_faz2.json` ile karşılaştırma): A/B ekran 124, pakete atanan 124, eksik 0, birden çok pakette olan 0, pakete giren C 0. Sonuç: **her A/B ekran tam bir pakette**; A 22, B 102.
- En büyük kod paketi (net): 54 nazir-nazirlar = 48 dosya; net 60'ı aşan yok. Ham toplamı 60'ı aşanlar (kesintiyle altına iniyor, varsayıma bağlı): 56 nazir-dersler (62), 57 nazir-talebe-yasak-pano (70).
- Ekran sayısı 3-8 dışında olanlar: yalnız temel/kit paketleri (0-2 ekran): 22 pr106-cherry-pick (0), 23 ui-kit-form (0), 24 ui-kit-katman (0), 27 medrese-temeli (1), 28 celse-temeli (2), 37 bildirim-temeli (1), 43 arsiv-temeli (2), 47 yasak-temeli (2).
- Sıra doğrulaması: her paketin bağımlılığı daha düşük numaralı pakette (betik kontrolü, hata yok).
- Doğrulanmadı: kit paketlerinin dosya sayısı, kesinti ve ek tahminleri, Paket 0'ın landing çakışma boyutu, `users/lookup` Keycloak Admin API'nin dev realm'de çalışması (karar verildi, doğrulanmadı).
- 4 Ekim 2026 sürüm kapısı (görevden alma/izin devri penceresi) 41, 42, 54, 55 paketlerini etkiler; bugün 2 Ekim.

## Zincir çalışması (2026-10-02 gece)
- Paket 0: PR #131 (MDRS-152, In Review).
- Paket 23–57 + Faz 7 kapanış: Workflow `ekran-zinciri`, run `wf_5ebe4c5f-fe2`. Kesilirse aynı script + `resumeFromRunId` ile devam edilir; biten ajanlar önbellekten gelir.
- Kullanıcı talimatı: gece soru yok; takılan paket "takıldı" + neden, bağımlıları da atlanır; kararlar bu dosyanın Kararlar bölümüne.
- Sıra değişti (kullanıcı talimatı): önce temel paketler 23, 24, 27, 28, 37, 39, 43, 47; sonra 25, 26, 29–36, 38, 40–42, 44–46, 48–57. Stack katman sırası çalışma sırasını izler (her PR'ın base'i bir önce biten paketin dalı); dal adlarındaki stack-NN paket numarasıdır, katman sırası değil.
- Stack-23 kontrolü 2. turda geçti; PR adımında durdurulup aynı run ile yeniden başlatıldı (yarım PR yoktu).
- 2026-10-02: Stack düzeltmesi — #132, #133 `gh stack link 130 132 133` ile stack #130'a eklendi (pos 23, 24); CI (Verify, Commit hygiene) koşmaya başladı. Script'e PR ajanından sonra ayrı bir `stack` adımı eklendi (`gh stack link 130 <pr>` + GraphQL doğrulaması); biten 23/24 için `args.linkli=[23,24]` ile atlanır (önbellek öneki bozulmasın diye). Run aynı: `wf_5ebe4c5f-fe2`.

### /clear sonrası devam yolu
`resumeFromRunId` yalnız AYNI oturumda çalışır; yeni oturum önbellekten süremez. Yeni oturumda:
1. Durum: bu dosyanın paket tablosunda PR sütunu dolu olanlar bitti (anlık: 22 #131, 23 #132, 24 #133). Canlı doğrula: `gh pr list --repo amel-tech/medaris --search "head:release/stack-" --state open`.
2. Base: tabloda PR'ı açık olan paketlerden çalışma sırasına göre EN SON olanın dalı (`release/stack-NN-<slug>`). Takılanlar base olmaz.
3. Kalan sıra (çalışma sırası): 23, 24, 27, 28, 37, 39, 43, 47, 25, 26, 29–36, 38, 40–42, 44–46, 48–57 — bundan PR'ı açık ve "takıldı" olanları çıkar.
4. Script: `~/.claude/projects/-Users-enesyasingedik-Desktop-2026-medaris/90a93987-5276-471f-bc98-704fa09cbdee/workflows/scripts/ekran-zinciri-wf_5ebe4c5f-fe2.js` — YENİ run olarak başlat (`scriptPath`, resume yok), args: `{base: <2. madde>, linkli: [], paketler: <3. madde>}`.
5. Yarım kalan paket: dalı origin'de ya da `.claude/worktrees/stack-NN` worktree'si varsa kodlayıcı onu kullanır (prompt "Dal zaten varsa onu kullan" der). Durumu "takıldı" olanlara kodlayıcı dokunmaz; bağımlıları atlanır.
6. Yeni run'ın kimliğini bu bölüme yaz.
